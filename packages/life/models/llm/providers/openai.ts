import type { Message, ToolDefinition } from "@/agent/resources";
import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LLMBase, type LLMGenerateMessageJob } from "../base";

// Config
export const openAILLMConfigSchema = z.object({
  apiKey: z.string().default(process.env.OPENAI_API_KEY ?? ""),
  model: z.enum(["gpt-4o-mini", "gpt-4o"]).default("gpt-4o-mini"),
  temperature: z.number().default(0.5),
});

// Model
export class OpenAILLM extends LLMBase<typeof openAILLMConfigSchema> {
  #client: OpenAI;

  constructor(config: z.input<typeof openAILLMConfigSchema>) {
    super(openAILLMConfigSchema, config);
    if (!config.apiKey)
      throw new Error(
        "OPENAI_API_KEY environment variable or config.apiKey must be provided to use this model.",
      );
    this.#client = new OpenAI({ apiKey: config.apiKey });
  }

  /**
   * Format conversion
   */

  #toOpenAIMessage(message: Message): ChatCompletionMessageParam {
    if (message.role === "user") {
      return { role: "user", content: message.content };
    }

    if (message.role === "agent") {
      return {
        role: "assistant",
        content: message.content,
        tool_calls: message.toolsRequests?.map((request) => ({
          id: request.id,
          function: { name: request.id, arguments: JSON.stringify(request.input) },
          type: "function",
        })),
      };
    }

    if (message.role === "system") {
      return { role: "system", content: message.content };
    }

    if (message.role === "tool-response") {
      return {
        role: "tool",
        tool_call_id: message.id,
        content: JSON.stringify(message.output),
      };
    }

    return null as never;
  }

  #toOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
    return messages.map(this.#toOpenAIMessage);
  }

  #toOpenAITool(tool: ToolDefinition): OpenAI.Chat.Completions.ChatCompletionTool {
    return {
      type: "function",
      function: {
        name: tool.id,
        description: tool.description,
        parameters: zodToJsonSchema(tool.inputSchema),
      },
    };
  }

  #toOpenAITools(tools: ToolDefinition[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map(this.#toOpenAITool);
  }

  /**
   * Generate a message with job management - returns jobId along with stream
   */
  async generateMessage(
    params: Parameters<typeof LLMBase.prototype.generateMessage>[0],
  ): Promise<LLMGenerateMessageJob> {
    // Create a new job
    const job = this.createGenerateMessageJob();

    // Prepare tools and messages in OpenAI format
    const openaiTools = params.tools.length > 0 ? this.#toOpenAITools(params.tools) : undefined;
    const openaiMessages = this.#toOpenAIMessages(params.messages);

    // Prepare job stream
    const stream = await this.#client.chat.completions.create(
      {
        model: this.config.model,
        temperature: this.config.temperature,
        messages: openaiMessages,
        tools: openaiTools,
        stream: true,
      },
      { signal: job.raw.abortController.signal }, // Allows the stream to be cancelled
    );

    for await (const chunk of stream) {
      // Ignore chunks if job was cancelled
      if (job.raw.abortController.signal.aborted) continue;

      // Extract the choice and delta (if any)
      const choice = chunk.choices[0];
      if (!choice) throw new Error("No choice");
      const delta = choice.delta;

      // Handle content tokens
      if (delta.content) {
        job.raw.receiveChunk({ type: "content", content: delta.content });
        continue;
      }

      // Handle tool calls tokens
      if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          if (toolCall.function?.name && toolCall.function?.arguments) {
            job.raw.receiveChunk({
              type: "tool",
              toolId: toolCall.id as string,
              toolInput: JSON.parse(toolCall.function.arguments || "{}"),
            });
          }
        }
      }

      // Handle end of stream
      if (chunk.choices[0]?.finish_reason === "stop") job.raw.receiveChunk({ type: "end" });
    }

    // Return the job
    return job;
  }

  async generateObject(
    params: Parameters<typeof LLMBase.prototype.generateObject>[0],
  ): ReturnType<typeof LLMBase.prototype.generateObject> {
    // Prepare messages in OpenAI format
    const openaiMessages = this.#toOpenAIMessages(params.messages);

    // Prepare JSON schema
    const jsonSchema = zodToJsonSchema(params.schema, { name: "mySchema" });

    // Generate the object
    const response = await this.#client.chat.completions.create({
      model: this.config.model,
      messages: openaiMessages,
      temperature: this.config.temperature,
      response_format: {
        type: "json_schema",
        json_schema: { name: "avc", schema: jsonSchema },
      },
    });

    // Parse the response
    const obj = JSON.parse(response.choices[0]?.message?.content || "{}");

    // Return the object
    return { success: true, data: obj };
  }
}
