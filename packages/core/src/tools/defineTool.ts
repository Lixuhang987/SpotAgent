import { z } from "zod";
import type { AgentTool, AgentToolInputSchema } from "./AgentTool.ts";

export interface DefineToolOptions<TInput, TOutput, TDeps> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  stubByDefault?: boolean;
  run: (input: TInput, deps: TDeps) => Promise<TOutput>;
}

export type ToolFactory<TInput, TOutput, TDeps> = {
  name: string;
  schema: z.ZodType<TInput>;
  jsonSchema: AgentToolInputSchema;
  create: (deps: TDeps) => AgentTool<TInput, TOutput>;
};

export function defineTool<TInput, TOutput, TDeps = unknown>(
  options: DefineToolOptions<TInput, TOutput, TDeps>,
): ToolFactory<TInput, TOutput, TDeps> {
  const jsonSchema = z.toJSONSchema(options.inputSchema, {
    target: "jsonSchema2019-09",
  }) as AgentToolInputSchema;

  return {
    name: options.name,
    schema: options.inputSchema,
    jsonSchema,
    create: (deps: TDeps): AgentTool<TInput, TOutput> => ({
      name: options.name,
      description: options.description,
      inputSchema: jsonSchema,
      stubByDefault: options.stubByDefault,
      call: (input: TInput) => options.run(input, deps),
    }),
  };
}
