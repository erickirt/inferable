import { z } from "zod";
import {
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
} from "../integrations/integration-events";
import { logger } from "../observability/logger";
import { BaseMessage } from "../queues/observability";

const eventSchema = z.discriminatedUnion("type", [
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
]);

export type CustomerTelemetryMessage = BaseMessage &
  z.infer<typeof eventSchema>;

export class CustomerTelemetryListeners {
  private static listeners: ((
    data: CustomerTelemetryMessage,
  ) => Promise<void>)[] = [];

  public static addListener(
    listener: (data: CustomerTelemetryMessage) => Promise<void>,
  ) {
    this.listeners.push(listener);
  }

  public static async notify(data: CustomerTelemetryMessage) {
    for (const listener of this.listeners) {
      await listener(data);
    }
  }
}

export const handleCustomerTelemetry = async (data: unknown): Promise<void> => {
  const zodResult = eventSchema.safeParse(data);

  if (!zodResult.success) {
    logger.error(
      "Received customer telemetry message that does not conform to expected schema",
      {
        message: data,
      },
    );

    return;
  }

  await CustomerTelemetryListeners.notify(zodResult.data);
};
