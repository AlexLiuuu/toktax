import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createUsageRecord, type SourceInfo, type UsageRecord } from "../types.js";

const STATE_DB_FILENAME = "state_5.sqlite";

export function resolveStateDb(): string | null {
  const sqliteHome = (process.env.CODEX_SQLITE_HOME ?? "").trim();
  if (sqliteHome) {
    const db = path.join(
      sqliteHome.replace(/^~/, os.homedir()),
      STATE_DB_FILENAME
    );
    if (fs.existsSync(db) && fs.statSync(db).isFile()) return db;
    return null;
  }

  const codexHome = (process.env.CODEX_HOME ?? "").trim();
  if (codexHome) {
    const db = path.join(
      codexHome.replace(/^~/, os.homedir()),
      STATE_DB_FILENAME
    );
    if (fs.existsSync(db) && fs.statSync(db).isFile()) return db;
    return null;
  }

  const db = path.join(os.homedir(), ".codex", STATE_DB_FILENAME);
  if (fs.existsSync(db) && fs.statSync(db).isFile()) return db;

  return null;
}

export class CodexSource implements SourceInfo {
  name = "codex";

  isAvailable(): boolean {
    return resolveStateDb() !== null;
  }

  async readAll(): Promise<UsageRecord[]> {
    const dbPath = resolveStateDb();
    if (!dbPath) return [];

    try {
      const initSqlJs = (await import("sql.js")).default;
      const SQL = await initSqlJs();
      const fileBuffer = fs.readFileSync(dbPath);
      const db = new SQL.Database(fileBuffer);

      const results = db.exec(
        "SELECT id, model_provider, model, tokens_used, title, created_at, cwd FROM threads ORDER BY created_at"
      );
      db.close();

      if (!results.length) return [];

      const records: UsageRecord[] = [];
      for (const row of results[0].values) {
        const [threadId, provider, model, tokensUsed, title, createdAt, cwd] =
          row as [string, string, string, number, string, number, string];

        const ts = new Date((createdAt ?? 0) * 1000);
        const project = cwd ? path.basename(cwd) : "";

        records.push(
          createUsageRecord({
            timestamp: ts,
            source: this.name,
            sessionId: threadId ?? "",
            model: model ?? "unknown",
            inputTokens: tokensUsed ?? 0,
            project,
            extra: { provider, title },
          })
        );
      }

      return records;
    } catch {
      return [];
    }
  }
}
