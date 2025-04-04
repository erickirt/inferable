import { StateGraphArgs } from "@langchain/langgraph";
import { InferSelectModel } from "drizzle-orm";
import { UnifiedMessage } from "../../contract";
import { RunMessageMetadata, runs } from "../../data";

export type RunGraphStateMessage = UnifiedMessage & {
  persisted?: true;
  clusterId: string;
  runId: string;
  metadata?: RunMessageMetadata;
};

export type RunGraphState = {
  status: InferSelectModel<typeof runs>["status"];
  messages: RunGraphStateMessage[];
  run: {
    id: string;
    clusterId: string;
    resultSchema: unknown | null;
    debug: boolean;
    attachedFunctions: string[] | null;
    status: string;
    systemPrompt: string | null;
    testMocks: Record<string, { output: Record<string, unknown> }> | null;
    test: boolean;
    reasoningTraces: boolean;
    enableResultGrounding: boolean;
    providerUrl?: string | null;
    providerModel?: string | null;
    providerKey?: string | null;
  };
  waitingJobs: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
};

export const createStateGraphChannels = ({
  run,
}: {
  run: {
    id: string;
    clusterId: string;
    resultSchema: unknown | null;
    debug: boolean;
    attachedFunctions: string[] | null;
    status: string;
    systemPrompt: string | null;
    testMocks: Record<string, { output: Record<string, unknown> }> | null;
    test: boolean;
    reasoningTraces: boolean;
    enableResultGrounding: boolean;
    providerUrl?: string | null;
    providerModel?: string | null;
    providerKey?: string | null;
  };
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

    // Accumulate results
    result: {
      reducer: (a, b) => ({
        ...a,
        ...b,
      }),
    },
  };
};
