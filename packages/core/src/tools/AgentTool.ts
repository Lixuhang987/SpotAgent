export type AgentToolInputSchema = Record<string, unknown>;

export interface AgentTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: AgentToolInputSchema;
  stubByDefault?: boolean;
  call(input: TInput): Promise<TOutput>;
}
