export interface UsageRecord {
  timestamp: Date;
  source: string;
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
  project: string;
  extra: Record<string, unknown>;
}

export interface SourceInfo {
  name: string;
  isAvailable(): boolean;
  readAll(): Promise<UsageRecord[]>;
}

export function createUsageRecord(
  fields: Partial<UsageRecord> &
    Pick<UsageRecord, "timestamp" | "source" | "sessionId" | "model">
): UsageRecord {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCostUsd: 0,
    project: "",
    extra: {},
    ...fields,
  };
}
