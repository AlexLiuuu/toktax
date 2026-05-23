import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createUsageRecord, type SourceInfo, type UsageRecord } from "../types.js";

export function resolveProjectsDirs(): string[] {
  const dirs: string[] = [];

  const env = (process.env.CLAUDE_CONFIG_DIR ?? "").trim();
  if (env) {
    for (const part of env.split(",")) {
      const p = part.trim().replace(/^~/, os.homedir());
      const projects = path.join(p, "projects");
      if (fs.existsSync(projects) && fs.statSync(projects).isDirectory()) {
        dirs.push(projects);
      }
    }
  }

  if (env) return dirs;

  const home = os.homedir();
  for (const base of [
    path.join(home, ".claude"),
    path.join(home, ".config", "claude"),
  ]) {
    const projects = path.join(base, "projects");
    if (fs.existsSync(projects) && fs.statSync(projects).isDirectory()) {
      dirs.push(projects);
    }
  }

  return dirs;
}

export class ClaudeCodeSource implements SourceInfo {
  name = "claude-code";

  isAvailable(): boolean {
    return resolveProjectsDirs().length > 0;
  }

  async readAll(): Promise<UsageRecord[]> {
    const dirs = resolveProjectsDirs();
    if (dirs.length === 0) return [];

    const seenFiles = new Set<string>();
    const records: UsageRecord[] = [];

    for (const projectsDir of dirs) {
      let entries: string[];
      try {
        entries = fs.readdirSync(projectsDir, { recursive: true }) as string[];
      } catch {
        continue;
      }

      const jsonlFiles = entries.filter((e) => e.endsWith(".jsonl"));

      for (const relPath of jsonlFiles) {
        const fullPath = path.join(projectsDir, relPath);
        let realPath: string;
        try {
          realPath = fs.realpathSync(fullPath);
        } catch {
          continue;
        }

        if (seenFiles.has(realPath)) continue;
        seenFiles.add(realPath);

        const project = path.basename(path.dirname(fullPath));
        const sessionId = path.basename(fullPath, ".jsonl");

        let content: string;
        try {
          content = fs.readFileSync(fullPath, "utf-8");
        } catch {
          continue;
        }

        for (const line of content.split("\n")) {
          if (!line.trim()) continue;

          let d: Record<string, unknown>;
          try {
            d = JSON.parse(line);
          } catch {
            continue;
          }

          if (d.type !== "assistant") continue;

          const msg = (d.message ?? {}) as Record<string, unknown>;
          const usage = msg.usage as Record<string, number> | undefined;
          if (!usage) continue;

          const tsStr = d.timestamp as string | undefined;
          if (!tsStr) continue;

          const ts = new Date(tsStr);
          if (isNaN(ts.getTime())) continue;

          records.push(
            createUsageRecord({
              timestamp: ts,
              source: this.name,
              sessionId,
              model: (msg.model as string) ?? "unknown",
              inputTokens: usage.input_tokens ?? 0,
              outputTokens: usage.output_tokens ?? 0,
              cacheReadTokens: usage.cache_read_input_tokens ?? 0,
              cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
              project,
            })
          );
        }
      }
    }

    return records;
  }
}
