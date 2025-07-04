import type { Message, ToolDefinition } from "@/agent/resources";
import { Mistral } from "@mistralai/mistralai";
import type { AssistantMessage, SystemMessage, ToolMessage, UserMessage } from "@mistralai/mistralai/models/components";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LLMBase, type LLMGenerateMessageJob } from "../base";

// Config
export const mistralLLMConfigSchema = z.object({
  apiKey: z.string().default(process.env.MISTRAL_API_KEY ?? ""),
  model: z.enum([
    "mistral-large-latest",
    "mistral-large-2411",
    "mistral-large-2407",
    "mistral-small-latest",
    "mistral-small-2501",
    "mistral-small-2503",
    "mistral-medium-latest",
    "mistral-medium-2505",
    "pixtral-large-latest",
    "pixtral-large-2411",
    "codestral-latest",
    "codestral-2501",
    "codestral-2405",
    "ministral-3b-latest",
    "ministral-8b-latest",
    "open-mistral-7b",
    "open-mixtral-8x7b",
    "open-mixtral-8x22b",
  ]).default("mistral-small-latest"),
  temperature: z.number().min(0).max(1).default(0.5),
});

// Model
export class MistralLLM extends LLMBase<typeof mistralLLMConfigSchema> {
  #client: Mistral;

  constructor(config: z.input<typeof mistralLLMConfigSchema>) {
    super(mistralLLMConfigSchema, config);
    if (!config.apiKey)
      throw new Error(
        "MISTRAL_API_KEY environment variable or config.apiKey must be provided to use this model.",
      );
    this.#client = new Mistral({ apiKey: config.apiKey });
  }

  /**
   * Format conversion
   */

  #toMistralMessage(message: Message): UserMessage | AssistantMessage | SystemMessage | ToolMessage {
    if (message.role === "user") {
      return { role: "user", content: message.content };
    }

    if (message.role === "agent") {
      return {
        role: "assistant",
        content: message.content,
        toolCalls: message.toolsRequests?.map((request) => ({
          id: request.id,
          function: { 
            name: request.id, 
            arguments: JSON.stringify(request.input) 
          },
          type: "function" as const,
        })),
      };
    }

    if (message.role === "system") {
      return { role: "system", content: message.content };
    }

    if (message.role === "tool-response") {
      return {
        role: "tool",
        name: message.toolId,
        content: JSON.stringify(message.output),
      };
    }

    return null as never;
  }

  #toMistralMessages(messages: Message[]): Array<UserMessage | AssistantMessage | SystemMessage | ToolMessage> {
    return messages.map(this.#toMistralMessage.bind(this));
  }

  #toMistralTool(tool: ToolDefinition) {
    return {
      type: "function" as const,
      function: {
        name: tool.id,
        description: tool.description,
        parameters: zodToJsonSchema(tool.inputSchema),
      },
    };
  }

  #toMistralTools(tools: ToolDefinition[]) {
    return tools.map(this.#toMistralTool);
  }

  /**
   * Generate a message with job management - returns jobId along with stream
   */
  async generateMessage(
    params: Parameters<typeof LLMBase.prototype.generateMessage>[0],
  ): Promise<LLMGenerateMessageJob> {
    // Create a new job
    const job = this.createGenerateMessageJob();

    // Prepare tools and messages in Mistral format
    const mistralTools = params.tools.length > 0 ? this.#toMistralTools(params.tools) : undefined;
    const mistralMessages = this.#toMistralMessages(params.messages);

    try {
      // Create the stream
      const stream = await this.#client.chat.stream({
        model: this.config.model,
        temperature: this.config.temperature,
        messages: mistralMessages,
        ...(mistralTools?.length ? { tools: mistralTools } : {}),
      });

      // Process the stream
      (async () => {
        let pendingToolCalls: Record<
          string,
          {
            id: string;
            name: string;
            arguments: string;
          }
        > = {};

        try {
          for await (const chunk of stream) {
            // Ignore chunks if job was cancelled
            if (job.raw.abortController.signal.aborted) break;

            // Handle content tokens
            if (chunk.data.choices[0]?.delta?.content) {
              job.raw.receiveChunk({ 
                type: "content", 
                content: chunk.data.choices[0].delta.content 
              });
              continue;
            }

            // Handle tool calls tokens
            const toolCalls = chunk.data.choices[0]?.delta?.toolCalls;
            if (toolCalls) {
              for (const toolCall of toolCalls) {
                // Retrieve the tool call ID
                const id = toolCall.id ?? Object.keys(pendingToolCalls).at(-1);
                if (!id) throw new Error("No tool call ID");

                // Ensure the tool call is tracked
                if (!pendingToolCalls[id]) {
                  pendingToolCalls[id] = { id, name: "", arguments: "" };
                }

                // Compound name tokens
                if (toolCall.function?.name) {
                  pendingToolCalls[id].name += toolCall.function.name;
                }

                // Compound arguments tokens
                if (toolCall.function?.arguments) {
                  pendingToolCalls[id].arguments += toolCall.function.arguments;
                }
              }
            }

            // Handle finish reasons
            const finishReason = chunk.data.choices[0]?.finishReason;
            
            // Handle tool call completion
            if (finishReason === "tool_calls") {
              for (const toolCall of Object.values(pendingToolCalls)) {
                job.raw.receiveChunk({
                  type: "tool",
                  toolId: toolCall.name || toolCall.id,
                  toolInput: JSON.parse(toolCall.arguments || "{}"),
                });
              }
              pendingToolCalls = {};
            }

            // Handle end of stream
            if (finishReason === "stop") {
              job.raw.receiveChunk({ type: "end" });
            }
          }
        } catch (error) {
          job.raw.receiveChunk({ 
            type: "error", 
            error: error instanceof Error ? error.message : "Unknown error" 
          });
        }
      })();

      // Return the job
      return job;
    } catch (error) {
      job.raw.receiveChunk({ 
        type: "error", 
        error: error instanceof Error ? error.message : "Failed to create stream" 
      });
      return job;
    }
  }

  async generateObject(
    params: Parameters<typeof LLMBase.prototype.generateObject>[0],
  ): ReturnType<typeof LLMBase.prototype.generateObject> {
    try {
      // Prepare messages in Mistral format
      const mistralMessages = this.#toMistralMessages(params.messages);

      // Prepare JSON schema
      const jsonSchema = zodToJsonSchema(params.schema);

      // Generate the object
      const response = await this.#client.chat.complete({
        model: this.config.model,
        messages: mistralMessages,
        temperature: this.config.temperature,
        responseFormat: {
          type: "json_object",
        },
      });

      // Extract content
      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return { success: false, error: "No content in response" };
      }

      // Parse the response
      const obj = JSON.parse(content);

      // Validate against schema
      const parseResult = params.schema.safeParse(obj);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.message };
      }

      // Return the object
      return { success: true, data: parseResult.data };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to generate object" 
      };
    }
  }
}