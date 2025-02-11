import { StateGraphArgs } from "@langchain/langgraph";
import { InferSelectModel } from "drizzle-orm";
import { UnifiedMessage } from "../../contract";
import { RunMessageMetadata, runs } from "../../data";
import { ChatIdentifiers } from "../../models/routing";

export type RunGraphStateMessage = UnifiedMessage & {
  persisted?: true;
  clusterId: string;
  runId: string;
  metadata?: RunMessageMetadata;
};

export type RunGraphState = {
  status: InferSelectModel<typeof runs>["status"];
  messages: RunGraphStateMessage[];
  additionalContext?: string;
  run: {
    id: string;
    clusterId: string;
    modelIdentifier: ChatIdentifiers | null;
    resultSchema: unknown | null;
    debug: boolean;
    attachedFunctions: string[] | null;
    status: string;
    systemPrompt: string | null;
    testMocks: Record<string, { output: Record<string, unknown> }> | null;
    test: boolean;
    reasoningTraces: boolean;
    enableResultGrounding: boolean;
  };
  waitingJobs: string[];
  allAvailableTools: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
};

export const createStateGraphChannels = ({
  run,
  additionalContext,
  allAvailableTools,
}: {
  run: {
    id: string;
    clusterId: string;
    modelIdentifier: ChatIdentifiers | null;
    resultSchema: unknown | null;
    debug: boolean;
    attachedFunctions: string[] | null;
    status: string;
    systemPrompt: string | null;
    testMocks: Record<string, { output: Record<string, unknown> }> | null;
    test: boolean;
    reasoningTraces: boolean;
    enableResultGrounding: boolean;
  };
  allAvailableTools: string[];
  additionalContext?: string;
}): StateGraphArgs<RunGraphState>["channels"] => {
  return {
    // Accumulate messages
    messages: {
      reducer: (a, b) => [...a, ...b],
      default: () => [],
    },

    // Run state is immutable
    run: {
      reducer: () => run,
      default: () => run,
    },

    // Always take the latest status
    status: {
      reducer: (_a, b) => b,
      default: () => "pending",
    },

    // Accumulate waiting jobs
    waitingJobs: {
      reducer: (a?: string[], b?: string[]) => {
        if (a == undefined || b == undefined) {
          return [];
        }

        return [...a, ...b];
      },
      default: () => [],
    },

    // Additional context is immutable
    additionalContext: {
      reducer: () => additionalContext,
      default: () => additionalContext,
    },

    // All available tool names. immutable.
    allAvailableTools: {
      reducer: () => allAvailableTools,
      default: () => allAvailableTools,
    },

    // Accumulate results
    result: {
      reducer: (a, b) => ({
        ...a,
        ...b,
      }),
    },
  };
};
