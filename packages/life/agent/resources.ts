import { z } from "zod";

// Base message
export const messageBaseSchema = {
  id: z.string(),
  createdAt: z.number(),
  lastUpdated: z.number(),
};

// User message
export const userMessageSchema = z.object({
  ...messageBaseSchema,
  role: z.literal("user"),
  content: z.string(),
});

export type UserMessage = z.infer<typeof userMessageSchema>;

// System message
export const systemMessageSchema = z.object({
  ...messageBaseSchema,
  role: z.literal("system"),
  content: z.string(),
});

export type SystemMessage = z.infer<typeof systemMessageSchema>;

// Tool request
export const toolRequestSchema = z.object({
  id: z.string(),
  input: z.record(z.any()),
});

export type ToolRequest = z.infer<typeof toolRequestSchema>;

// Agent message
export const agentMessageSchema = z.object({
  ...messageBaseSchema,
  role: z.literal("agent"),
  content: z.string(),
  toolsRequests: z.array(toolRequestSchema).optional(),
});

export type AgentMessage = z.infer<typeof agentMessageSchema>;

// Tool response message
export const toolResponseMessage = z.object({
  ...messageBaseSchema,
  role: z.literal("tool-response"),
  toolId: z.string(),
  success: z.boolean(),
  output: z.string().optional(),
  error: z.string().optional(),
  hint: z.string().optional(),
});

export type ToolResponseMessage = z.infer<typeof toolResponseMessage>;

// Message
export const messageSchema = z.discriminatedUnion("role", [
  userMessageSchema,
  systemMessageSchema,
  agentMessageSchema,
  toolResponseMessage,
]);

export type Message = z.infer<typeof messageSchema>;

// Create message input
const omitFields = { createdAt: true, lastUpdated: true } as const;
export const createMessageInputSchema = z.discriminatedUnion("role", [
  userMessageSchema.omit(omitFields).extend({ id: z.string().optional() }),
  systemMessageSchema.omit(omitFields).extend({ id: z.string().optional() }),
  agentMessageSchema.omit(omitFields).extend({ id: z.string().optional() }),
  toolResponseMessage.omit(omitFields).extend({ id: z.string().optional() }),
]);

export type CreateMessageInput = z.infer<typeof createMessageInputSchema>;

// Update message input
export const updateMessageInputSchema = z.discriminatedUnion("role", [
  userMessageSchema.omit(omitFields),
  systemMessageSchema.omit(omitFields),
  agentMessageSchema.omit(omitFields),
  toolResponseMessage.omit(omitFields),
]);

export type UpdateMessageInput = z.infer<typeof updateMessageInputSchema>;

// Tool definition
export const toolDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  inputSchema: z.instanceof(z.ZodObject),
  outputSchema: z.instanceof(z.ZodObject),
  run: z.function().args(z.object({})).returns(z.object({})),
});

export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;

// Resources
export const resourcesSchema = z.object({
  messages: z.array(messageSchema),
  tools: z.array(toolDefinitionSchema),
});

export type Resources = z.infer<typeof resourcesSchema>;
