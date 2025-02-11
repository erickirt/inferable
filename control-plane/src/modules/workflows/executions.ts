import { z } from "zod";
import * as jobs from "../jobs/jobs";
import { packer } from "../packer";
import { getClusterBackgroundRun } from "../runs";
import { BadRequestError, NotFoundError } from "../../utilities/errors";
import * as data from "../data";
import { and, eq, sql } from "drizzle-orm";
import { getActivityByJobId, getActivityForTimeline } from "../observability/events";
import { getRunsByTag } from "../runs/tags";
import { getWorkflowTools } from "../tools";
import { logger } from "../observability/logger";

export const createWorkflowExecution = async (
  clusterId: string,
  workflowName: string,
  input: unknown
) => {
  const parsed = z
    .object({
      executionId: z.string(),
    })
    .passthrough()
    .safeParse(input);

  if (!parsed.success) {
    throw new Error("Invalid input");
  }

  const tools = await getWorkflowTools({ clusterId, workflowName });

  if (tools.length === 0) {
    throw new BadRequestError(
      `No workflow registration for ${workflowName}. You might want to make the workflow listen first.`
    );
  }

  const latest = tools.reduce((latest, tool) => {
    if (tool.version > latest.version) {
      return tool;
    }

    return latest;
  }, tools[0]);

  const version = latest.version;

  logger.info(`Using workflow tool ${latest.name} for ${workflowName}`);

  const job = await jobs.createJobV2({
    owner: { clusterId },
    targetFn: latest.name,
    targetArgs: packer.pack(parsed.data),
    runId: getClusterBackgroundRun(clusterId), // we don't really care about the run semantics here, only that it's a job that gets picked up by the worker at least once
  });

  await data.db
    .insert(data.workflowExecutions)
    .values({
      id: parsed.data.executionId,
      cluster_id: clusterId,
      workflow_execution_id: parsed.data.executionId,
      job_id: job.id,
      workflow_name: workflowName,
      version: version,
    })
    .onConflictDoNothing();

  return { jobId: job.id };
};

export const resumeWorkflowExecution = async ({
  clusterId,
  workflowExecutionId,
}: {
  clusterId: string;
  workflowExecutionId: string;
}) => {
  const existing = await data.db
    .select()
    .from(data.workflowExecutions)
    .where(
      and(
        eq(data.workflowExecutions.cluster_id, clusterId),
        eq(data.workflowExecutions.workflow_execution_id, workflowExecutionId)
      )
    );

  if (existing.length === 0) {
    throw new NotFoundError(`Workflow execution ${workflowExecutionId} not found`);
  }

  const workflowExecution = existing[0];

  const existingJob = await jobs.getJob({
    clusterId,
    jobId: workflowExecution.job_id,
  });

  if (!existingJob) {
    throw new NotFoundError(
      `Job ${workflowExecution.job_id} not found while resuming workflow execution ${workflowExecutionId}`
    );
  }

  if (existingJob.approvalRequested && !existingJob.approved) {
    logger.warn(
      "Workflow execution is not approved yet. Waiting for approval before resuming",
      {
        clusterId,
        workflowExecutionId,
      }
    )
  }

  // Move the job back to pending to allow it to be resumed
  const [job] = await data.db
    .update(data.jobs)
    .set({
      status: "pending",
      executing_machine_id: null,
      last_retrieved_at: null,
      remaining_attempts: sql`remaining_attempts + 1`,
    })
    .where(
      and(
        eq(data.jobs.id, workflowExecution.job_id),
        eq(data.jobs.cluster_id, clusterId),
      )
    )
    .returning({
      id: data.jobs.id,
    });

  return { jobId: job.id };
};

export const getWorkflowExecutionEvents = async ({
  clusterId,
  workflowName,
  executionId,
  after,
}: {
  clusterId: string;
  workflowName: string;
  executionId: string;
  after?: string;
}) => {
  const events = await data.db
    .select({
      jobId: data.workflowExecutions.job_id,
    })
    .from(data.workflowExecutions)
    .where(
      and(
        eq(data.workflowExecutions.workflow_execution_id, executionId),
        eq(data.workflowExecutions.cluster_id, clusterId),
        eq(data.workflowExecutions.workflow_name, workflowName)
      )
    );

  const handlerJobEvents = await getActivityByJobId({
    clusterId,
    jobId: events[0].jobId,
  });

  const associatedRuns = await getRunsByTag({
    clusterId,
    key: "workflow.executionId",
    value: executionId,
  });

  const runEvents = await Promise.all(
    associatedRuns.map(run => getActivityForTimeline({ clusterId, runId: run.id, after }))
  ).then(results => results.flat());

  return {
    handlerJobEvents,
    associatedRuns,
    runEvents,
  };
};
