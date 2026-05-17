export type NetworkLogDirection = "request" | "response";

export type NetworkLogEntry = {
  timestamp: string;
  direction: NetworkLogDirection;
  url: string;
  method?: string;
  status?: number;
  body: unknown;
};

export interface NetworkLogger {
  log(entry: NetworkLogEntry): Promise<void>;
}
