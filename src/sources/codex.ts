import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createUsageRecord, type SourceInfo, type UsageRecord } from "../types.js";

export function resolveSessionDirs(): string[] {
  const dirs: string[] = [];

  const env = (process.env.CODEX_HOME ?? "").trim();
  if (env) {
    for (const part of env.split(",")) {
      const p = path.join(part.trim().replace(/^~/, os.homedir()), "sessions");
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        dirs.push(p);
      }
    }
    return dirs;
  }

  const sessionsDir = path.join(os.homedir(), ".codex", "sessions");
  if (fs.existsSync(sessionsDir) && fs.statSync(sessionsDir).isDirectory()) {
    dirs.push(sessionsDir);
  }

  return dirs;
}

export class CodexSource implements SourceInfo {
  name = "codex";

  isAvailable(): boolean {
    return resolveSessionDirs().length > 0;
  }

  async readAll(): Promise<UsageRecord[]> {
    const dirs = resolveSessionDirs();
    if (dirs.length === 0) return [];

    const seenFiles = new Set<string>();
    const records: UsageRecord[] = [];

    for (const sessionsDir of dirs) {
      let files: string[];
      try {
        files = (fs.readdirSync(sessionsDir, { recursive: true }) as string[])
          .filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }

      for (const relPath of files) {
        const fullPath = path.join(sessionsDir, relPath);
        let realPath: string;
        try {
          realPath = fs.realpathSync(fullPath);
        } catch {
          continue;
        }

        if (seenFiles.has(realPath)) continue;
        seenFiles.add(realPath);

        let content: string;
        try {
          content = fs.readFileSync(fullPath, "utf-8");
        } catch {
          continue;
        }

        let sessionId = path.basename(fullPath, ".jsonl");
        let project = "";
        let model = "unknown";

        for (const line of content.split("\n")) {
          if (!line.trim()) continue;

          let d: Record<string, unknown>;
          try {
            d = JSON.parse(line);
          } catch {
            continue;
          }

          const payload = d.payload as Record<string, unknown> | undefined;
          if (!payload) continue;

          if (d.type === "session_meta") {
            if (typeof payload.id === "string") sessionId = payload.id;
            if (typeof payload.cwd === "string") project = path.basename(payload.cwd);
            continue;
          }

          if (d.type === "turn_context") {
            if (typeof payload.model === "string") model = payload.model;
            continue;
          }

          if (d.type === "event_msg" && payload.type === "token_count") {
            const info = payload.info as Record<string, unknown> | undefined;
            if (!info) continue;

            const usage = info.last_token_usage as Record<string, number> | undefined;
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
                model,
                inputTokens: usage.input_tokens ?? 0,
                outputTokens: usage.output_tokens ?? 0,
                cacheReadTokens: usage.cached_input_tokens ?? 0,
                project,
              })
            );
          }
        }
      }
    }

    return records;
  }
}
