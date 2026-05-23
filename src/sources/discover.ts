import type { SourceInfo, UsageRecord } from "../types.js";
import { ClaudeCodeSource } from "./claude-code.js";
import { CodexSource } from "./codex.js";
import { GeminiSource } from "./gemini.js";

const ALL_SOURCES: SourceInfo[] = [new ClaudeCodeSource(), new CodexSource(), new GeminiSource()];

export function discoverSources(): SourceInfo[] {
  return ALL_SOURCES.filter((s) => s.isAvailable());
}

export async function readAllSources(): Promise<UsageRecord[]> {
  const sources = discoverSources();
  const arrays = await Promise.all(sources.map((s) => s.readAll()));
  const records = arrays.flat();
  records.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return records;
}
