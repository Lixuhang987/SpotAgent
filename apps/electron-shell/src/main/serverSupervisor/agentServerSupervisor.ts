export type AgentServerHealthEvent = {
  available: boolean;
  message?: string;
};

export type AgentServerSupervisorDescription = {
  mode: "node_child" | "utility_process";
  entry: string;
  coreRuntimeHost: "agent-server";
  utilityProcessBlocker: string | null;
};

export type AgentServerLogSink = (line: string) => void;

export type AgentServerSupervisor = {
  start(): void;
  stop(): void;
  onHealth(listener: (event: AgentServerHealthEvent) => void): () => void;
  describe(): AgentServerSupervisorDescription;
};
