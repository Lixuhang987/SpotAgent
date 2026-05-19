import { z } from "zod";
import type { AgentTool, AgentToolCallContext, AgentToolInputSchema } from "./AgentTool.ts";

export interface DefineToolOptions<TInput, TOutput, TDeps> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  stubByDefault?: boolean;
  run: (input: TInput, deps: TDeps, context: AgentToolCallContext) => Promise<TOutput>;
}

export type ToolFactory<TInput, TOutput, TDeps> = {
  name: string;
  schema: z.ZodType<TInput>;
  jsonSchema: AgentToolInputSchema;
  create: (deps: TDeps) => AgentTool<TInput, TOutput>;
};

function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? "$" : path.map(String).join(".");
}

function formatIssuePaths(issue: z.ZodIssue): string {
  if (issue.code === "unrecognized_keys") {
    const parentPath = formatIssuePath(issue.path);
    return issue.keys
      .map((key) => (parentPath === "$" ? key : `${parentPath}.${key}`))
      .join(", ");
  }

  return formatIssuePath(issue.path);
}

function formatValidationError(toolName: string, error: z.ZodError): string {
  const details = error.issues
    .map((issue) => `${formatIssuePaths(issue)}: ${issue.message}`)
    .join("; ");

  return `Invalid input for tool "${toolName}": ${details}`;
}

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
      call: async (input: TInput, context: AgentToolCallContext = {}) => {
        const parsed = options.inputSchema.safeParse(input);
        if (!parsed.success) {
          throw new Error(formatValidationError(options.name, parsed.error));
        }

        return options.run(parsed.data, deps, context);
      },
    }),
  };
}
