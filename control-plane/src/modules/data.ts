import advisoryLock from "advisory-lock";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  boolean,
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  vector,
} from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { env } from "../utilities/env";
import { logger } from "./observability/logger";
import { z } from "zod";
import { onStatusChangeSchema } from "./contract";
import { ToolConfig } from "./tools";

export const createMutex = advisoryLock(env.DATABASE_URL);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL_DISABLED
    ? false
    : {
        rejectUnauthorized: false,
      },
  allowExitOnIdle: env.DATABASE_ALLOW_EXIT_ON_IDLE,
  max: env.DATABASE_MAX_CONNECTIONS,
});

pool.on("error", err => {
  logger.error("Database connection error on idle client", {
    error: err,
  });
});

pool.on("connect", () => {
  logger.debug("Database connection established");
});

pool.on("release", () => {
  logger.debug("Database connection released");
});

pool.on("remove", () => {
  logger.debug("Database connection removed");
});

// by default jobs have a:
// - timeoutIntervalSeconds: 30
// - maxAttempts: 1
export const jobDefaults = {
  timeoutIntervalSeconds: 30,
  maxAttempts: 1,
};

export const jobs = pgTable(
  "jobs",
  {
    // this column is poorly named, it's actually the job id
    // TODO: (good-first-issue) rename this column to execution_id
    id: varchar("id", { length: 1024 }).notNull().unique(),
    // TODO: rename this column to cluster_id
    cluster_id: text("cluster_id").notNull(),
    target_fn: varchar("target_fn", { length: 1024 }).notNull(),
    target_args: text("target_args").notNull(),
    cache_key: varchar("cache_key", { length: 1024 }),
    status: text("status", {
      enum: [
        "pending",
        "running",
        "success",
        "failure",
        "stalled",
        "interrupted",
      ], // job failure is actually a stalled state. TODO: rename it
    }).notNull(),
    result: text("result"),
    result_type: text("result_type", {
      enum: ["resolution", "rejection", "interrupt"],
    }),
    executing_machine_id: text("executing_machine_id"),
    remaining_attempts: integer("remaining_attempts")
      .notNull()
      .default(jobDefaults.maxAttempts),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
    resulted_at: timestamp("resulted_at", { withTimezone: true }),
    last_retrieved_at: timestamp("last_retrieved_at", { withTimezone: true }),
    function_execution_time_ms: integer("function_execution_time_ms"),
    timeout_interval_seconds: integer("timeout_interval_seconds")
      .notNull()
      .default(jobDefaults.timeoutIntervalSeconds),
    run_id: varchar("run_id", { length: 1024 }).notNull(),
    auth_context: json("auth_context"),
    run_context: json("run_context"),
    approval_requested: boolean("approval_requested").notNull().default(false),
    approved: boolean("approved"),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.id],
      name: "jobs_cluster_id_id",
    }),
  }),
);

export const machines = pgTable(
  "machines",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    last_ping_at: timestamp("last_ping_at", { withTimezone: true }).notNull(),
    sdk_version: varchar("sdk_version", { length: 128 }),
    sdk_language: varchar("sdk_language", { length: 128 }),
    ip: varchar("ip", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id").notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.id, table.cluster_id],
      name: "machines_id_cluster_id",
    }),
  }),
);

export const clusters = pgTable(
  "clusters",
  {
    id: varchar("id", { length: 1024 }).primaryKey(),
    name: varchar("name", { length: 1024 }).notNull(),
    debug: boolean("debug").notNull().default(false),
    description: varchar("description", { length: 1024 }),
    organization_id: varchar("organization_id"),
    created_at: timestamp("created_at", {
      withTimezone: true,
      precision: 6,
    })
      .defaultNow()
      .notNull(),
    deleted_at: timestamp("deleted_at", {
      withTimezone: true,
      precision: 6,
    }),
    is_demo: boolean("is_demo").notNull().default(false),
    is_ephemeral: boolean("is_ephemeral").notNull().default(false),
    // How long events should be kept for this cluster (in seconds). Defaults to null (no expiry).
    event_expiry_age: integer("event_expiry_age"),
    // How long workflow (+ jobs + runs) should be kept for this cluster (in seconds). Defaults to null (no expiry).
    workflow_execution_expiry_age: integer("workflow_execution_expiry_age"),
  },
  table => ({
    idOrgIndex: index("clusters_id_org_index").on(
      table.id,
      table.organization_id,
    ),
  }),
);

export const tools = pgTable(
  "tools",
  {
    cluster_id: varchar("cluster_id")
      .references(() => clusters.id)
      .notNull(),
    name: varchar("name", { length: 1024 }).notNull(),
    description: text("description"),
    schema: text("schema"),
    config: json("config").$type<ToolConfig>(),
    hash: text("hash").notNull(),
    should_expire: boolean("should_expire").notNull(),
    last_ping_at: timestamp("last_ping_at", { withTimezone: true }).notNull(),
    embedding_1024: vector("embedding_1024", {
      dimensions: 1024, // for embed-english-v3
    }).notNull(),
    embedding_model: text("embedding_model", {
      enum: ["embed-english-v3"],
    }).notNull(),
    created_at: timestamp("created_at", {
      withTimezone: true,
      precision: 6,
    })
      .defaultNow()
      .notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.name],
      name: "tools_cluster_id_tools",
    }),
    toolEmbedding1024Index: index("toolEmbedding1024Index").using(
      "hnsw",
      table.embedding_1024.op("vector_cosine_ops"),
    ),
  }),
);

export const integrations = pgTable(
  "integrations",
  {
    cluster_id: varchar("cluster_id")
      .references(() => clusters.id)
      .notNull(),
    langfuse: json("langfuse").$type<{
      publicKey: string;
      secretKey: string;
      baseUrl: string;
      sendMessagePayloads: boolean;
    }>(),
    slack: json("slack").$type<{
      nangoConnectionId: string;
      botUserId: string;
      teamId: string;
      agentId?: string;
    }>(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id],
      name: "integrations_pkey",
    }),
  }),
);

export const runTags = pgTable(
  "run_tags",
  {
    cluster_id: varchar("cluster_id").notNull(),
    run_id: varchar("run_id", { length: 1024 }).notNull(),
    key: varchar("key", { length: 1024 }).notNull(),
    value: text("value").notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.run_id, table.key],
      name: "run_tags_cluster_id_run_id_key",
    }),
    runReference: foreignKey({
      columns: [table.run_id, table.cluster_id],
      foreignColumns: [runs.id, runs.cluster_id],
    }).onDelete("cascade"),
    index: index("runTagsIndex").on(table.key, table.value, table.cluster_id),
  }),
);

export const runs = pgTable(
  "runs",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    on_status_change:
      json("on_status_change").$type<z.infer<typeof onStatusChangeSchema>>(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result_schema: json("result_schema").$type<any>(),
    name: varchar("name", { length: 1024 }).default("").notNull(),
    system_prompt: text("system_prompt"),
    model_identifier: text("model_identifier", {
      enum: ["claude-3-5-sonnet", "claude-3-haiku"],
    }),
    user_id: varchar("user_id", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id")
      .references(() => clusters.id)
      .notNull(),
    created_at: timestamp("created_at", {
      withTimezone: true,
      precision: 6,
    })
      .defaultNow()
      .notNull(),
    status: text("status", {
      enum: ["pending", "running", "paused", "done", "failed"],
    })
      .default("pending")
      .notNull(),
    failure_reason: text("failure_reason"),
    debug: boolean("debug").notNull().default(false),
    attached_functions: json("attached_functions")
      .$type<string[]>()
      .notNull()
      .default([]),
    test: boolean("test").notNull().default(false),
    test_mocks: json("test_mocks")
      .$type<
        Record<
          string,
          {
            output: Record<string, unknown>;
          }
        >
      >()
      .default({}),
    feedback_comment: text("feedback_comment"),
    feedback_score: integer("feedback_score"),
    agent_id: varchar("agent_id", { length: 128 }),
    agent_version: integer("agent_version"),
    reasoning_traces: boolean("reasoning_traces").default(true).notNull(),
    type: text("type", {
      enum: ["single-step", "multi-step"],
    })
      .default("multi-step")
      .notNull(),
    interactive: boolean("interactive").default(true).notNull(),
    enable_result_grounding: boolean("enable_result_grounding")
      .default(false)
      .notNull(),
    auth_context: json("auth_context").$type<unknown>(),
    context: json("context"),
    workflow_execution_id: varchar("workflow_execution_id", { length: 1024 }),
    workflow_version: integer("workflow_version"),
    workflow_name: varchar("workflow_name", { length: 1024 }),
    provider_model: text("provider_model"),
    provider_url: text("provider_url"),
    provider_key: text("provider_key"),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.id],
      name: "workflows_cluster_id_id",
    }),
  }),
);

export type RunMessageMetadata = {
  displayable: Record<string, string>;
};

export const runMessages = pgTable(
  "run_messages",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    user_id: varchar("user_id", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id").notNull(),
    run_id: varchar("run_id", { length: 1024 }).notNull(),
    created_at: timestamp("created_at", {
      withTimezone: true,
      precision: 6,
    })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", {
      withTimezone: true,
      precision: 6,
    }),
    data: json("data").$type<unknown>().notNull(),
    type: text("type", {
      enum: [
        "human",
        "invocation-result",
        "template",
        "agent",
        "agent-invalid",
        "supervisor",
      ],
    }).notNull(),
    metadata: json("metadata").$type<RunMessageMetadata>(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.run_id, table.id],
      name: "run_messages_cluster_id_run_id_id",
    }),
    runReference: foreignKey({
      columns: [table.run_id, table.cluster_id],
      foreignColumns: [runs.id, runs.cluster_id],
    }).onDelete("cascade"),
  }),
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: varchar("id", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    cluster_id: varchar("cluster_id")
      .references(() => clusters.id)
      .notNull(),
    secret_hash: varchar("secret_hash", { length: 255 }).notNull(),
    // TODO: Remove this field
    type: varchar("type", {
      length: 255,
      enum: ["cluster_manage", "cluster_consume", "cluster_machine"],
    }).notNull(),
    created_by: varchar("created_by", { length: 255 }).notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    revoked_at: timestamp("revoked_at"),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.id],
    }),
    keyHashIndex: uniqueIndex("api_keys_secret_hash_index").on(
      table.secret_hash,
    ),
  }),
);

export const events = pgTable(
  "events",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id").notNull(),
    type: varchar("type", { length: 1024 }).notNull(),
    job_id: varchar("job_id", { length: 1024 }),
    machine_id: varchar("machine_id", { length: 1024 }),
    target_fn: varchar("target_fn", { length: 1024 }),
    result_type: varchar("result_type", { length: 1024 }),
    status: varchar("status", { length: 1024 }),
    run_id: varchar("run_id", { length: 1024 }),
    user_id: varchar("user_id", { length: 1024 }),
    tool_name: varchar("tool_name", { length: 1024 }),
    model_id: varchar("model_id", { length: 1024 }),
    token_usage_input: integer("token_usage_input"),
    token_usage_output: integer("token_usage_output"),
    attention_level: integer("attention_level"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
    meta: json("meta").$type<Record<string, unknown>>().notNull().default({}),
  },
  table => ({
    index: index("timeline_index").on(
      table.cluster_id,
      table.run_id,
      table.attention_level,
    ),
  }),
);

export const workflowExecutions = pgTable(
  "workflow_executions",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    job_id: varchar("job_id", { length: 1024 }).references(() => jobs.id),
    cluster_id: varchar("cluster_id")
      .references(() => clusters.id)
      .notNull(),
    workflow_name: varchar("workflow_name", { length: 1024 }).notNull(),
    workflow_version: integer("version").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.id],
      name: "workflow_executions_pkey",
    }),
  }),
);

export const clusterKV = pgTable(
  "cluster_kv",
  {
    cluster_id: varchar("cluster_id").notNull(),
    key: varchar("key", { length: 1024 }).notNull(),
    value: text("value").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.cluster_id, table.key] }),
  }),
);

export const db = drizzle(pool, {
  schema: {
    runs,
    events,
  },
});

export const isAlive = async () => {
  await db.execute(sql`select 1`).catch(e => {
    logger.error("Database connection is not alive", {
      error: e,
    });
    throw e;
  });
};

export const pg = {
  stop: async () => {
    await pool.end();
  },
};
