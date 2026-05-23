import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createUsageRecord,
  type SourceInfo,
  type UsageRecord,
} from "../types.js";

export function resolveGeminiDirs(): string[] {
  const dirs: string[] = [];

  const env = (process.env.GEMINI_DATA_DIR ?? "").trim();
  if (env) {
    for (const part of env.split(",")) {
      const p = part.trim().replace(/^~/, os.homedir());
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        dirs.push(p);
      }
    }
    return dirs;
  }

  const tmpDir = path.join(os.homedir(), ".gemini", "tmp");
  if (fs.existsSync(tmpDir) && fs.statSync(tmpDir).isDirectory()) {
    dirs.push(tmpDir);
  }

  return dirs;
}

export class GeminiSource implements SourceInfo {
  name = "gemini";

  isAvailable(): boolean {
    return resolveGeminiDirs().length > 0;
  }

  async readAll(): Promise<UsageRecord[]> {
    const dirs = resolveGeminiDirs();
    if (dirs.length === 0) return [];

    const seenFiles = new Set<string>();
    const seenIds = new Set<string>();
    const records: UsageRecord[] = [];

    for (const tmpDir of dirs) {
      let userDirs: string[];
      try {
        userDirs = fs
          .readdirSync(tmpDir)
          .map((d) => path.join(tmpDir, d, "chats"))
          .filter(
            (d) => fs.existsSync(d) && fs.statSync(d).isDirectory()
          );
      } catch {
        continue;
      }

      for (const chatsDir of userDirs) {
        let files: string[];
        try {
          files = fs
            .readdirSync(chatsDir)
            .filter((f) => f.endsWith(".jsonl") || f.endsWith(".json"));
        } catch {
          continue;
        }

        for (const file of files) {
          const fullPath = path.join(chatsDir, file);
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

          const ext = path.extname(file);
          let sessionId = path.basename(file, ext);
          let project = "";

          const lines = content.split("\n");
          for (const line of lines) {
            if (!line.trim()) continue;

            let d: Record<string, unknown>;
            try {
              d = JSON.parse(line);
            } catch {
              continue;
            }

            if (d.sessionId && typeof d.sessionId === "string") {
              sessionId = d.sessionId;
              if (d.projectHash && typeof d.projectHash === "string") {
                project = d.projectHash;
              }
              continue;
            }

            if (d.type !== "gemini") continue;

            const msgId = d.id as string | undefined;
            if (msgId) {
              if (seenIds.has(msgId)) continue;
              seenIds.add(msgId);
            }

            const tokens = d.tokens as Record<string, number> | undefined;
            if (!tokens) continue;

            const tsStr = d.timestamp as string | undefined;
            if (!tsStr) continue;

            const ts = new Date(tsStr);
            if (isNaN(ts.getTime())) continue;

            const rawInput = tokens.input ?? tokens.prompt ?? tokens.input_tokens ?? tokens.prompt_tokens ?? 0;
            const rawOutput = tokens.output ?? tokens.candidates ?? tokens.output_tokens ?? tokens.candidates_tokens ?? 0;
            const cached = tokens.cached ?? tokens.cached_tokens ?? 0;
            const thoughts = tokens.thoughts ?? tokens.reasoning ?? tokens.thoughts_tokens ?? tokens.reasoning_tokens ?? 0;

            const inputTokens = rawInput - Math.min(rawInput, cached);
            const outputTokens = rawOutput + thoughts;

            if (inputTokens === 0 && outputTokens === 0 && cached === 0) continue;

            records.push(
              createUsageRecord({
                timestamp: ts,
                source: this.name,
                sessionId,
                model: (d.model as string) ?? "unknown",
                inputTokens,
                outputTokens,
                cacheReadTokens: cached,
                cacheWriteTokens: 0,
                project,
                extra: thoughts > 0 ? { thoughtsTokens: thoughts } : {},
              })
            );
          }
        }
      }
    }

    return records;
  }
}
