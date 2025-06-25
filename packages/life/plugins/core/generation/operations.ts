import { messageSchema, resourcesSchema, toolResponseMessage } from "@/agent/resources";
import { z } from "zod";

// - Insert policy
export const insertPolicySchema = {
  interrupt: z.enum(["abrupt", "smooth"]).or(z.literal(false)).optional(),
  preventInterruption: z.boolean().optional(),
};

// - Continue
export const continueOperationSchema = z.object({
  type: z.literal("continue"),
  ...insertPolicySchema,
});

export type ContinueOperation = z.infer<typeof continueOperationSchema>;

// - Say
export const sayOperationSchema = z.object({
  type: z.literal("say"),
  text: z.string(),
  ...insertPolicySchema,
});

export type SayOperation = z.infer<typeof sayOperationSchema>;

// - Decide
export const decideOperationSchema = z.object({
  type: z.literal("decide"),
  messages: z.array(messageSchema),
  ...insertPolicySchema,
});

export type DecideOperation = z.infer<typeof decideOperationSchema>;

// - Interrupt
export const interruptOperationSchema = z.object({
  type: z.literal("interrupt"),
  reason: z.string(),
  author: z.enum(["user", "application"]),
  force: z.boolean().optional(),
});

export type InterruptOperation = z.infer<typeof interruptOperationSchema>;

// - Resources response
export const resourcesResponseOperationSchema = z.object({
  type: z.literal("resources-response"),
  resources: resourcesSchema,
});

export type ResourcesResponseOperation = z.infer<typeof resourcesResponseOperationSchema>;

// - Tool response
export const toolResponseOperationSchema = z.object({
  type: z.literal("tool-response"),
  message: toolResponseMessage,
});

export type ToolResponseOperation = z.infer<typeof toolResponseOperationSchema>;

// - Schedule
export const scheduleOperationSchema = z.object({
  type: z.literal("schedule"),
});

export type ScheduleOperation = z.infer<typeof scheduleOperationSchema>;

// - Union
export const generationOperationSchema = z.discriminatedUnion("type", [
  continueOperationSchema,
  sayOperationSchema,
  decideOperationSchema,
  interruptOperationSchema,
  resourcesResponseOperationSchema,
  toolResponseOperationSchema,
  scheduleOperationSchema,
]);

export type GenerationOperation = z.infer<typeof generationOperationSchema>;
