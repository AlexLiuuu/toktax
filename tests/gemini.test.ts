import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

let tmpDir: string;
let originalGeminiDataDir: string | undefined;
let originalHome: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "toktax-gemini-test-"));
  originalGeminiDataDir = process.env.GEMINI_DATA_DIR;
  originalHome = process.env.HOME;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (originalGeminiDataDir !== undefined) process.env.GEMINI_DATA_DIR = originalGeminiDataDir;
  else delete process.env.GEMINI_DATA_DIR;
  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;
});

function makeGeminiSession(chatsDir: string, filename = "session-test.jsonl"): string {
  fs.mkdirSync(chatsDir, { recursive: true });
  const filePath = path.join(chatsDir, filename);

  const lines = [
    JSON.stringify({
      sessionId: "abc-123",
      projectHash: "proj-hash-1",
      startTime: "2025-06-01T10:00:00Z",
      lastUpdated: "2025-06-01T10:05:00Z",
      kind: "main",
    }),
    JSON.stringify({
      id: "msg-1",
      timestamp: "2025-06-01T10:01:00Z",
      type: "user",
      content: "hello",
    }),
    JSON.stringify({
      id: "msg-2",
      timestamp: "2025-06-01T10:01:05Z",
      type: "gemini",
      content: "hi there",
      model: "gemini-2.5-pro",
      tokens: { input: 100, output: 50, cached: 30, total: 180 },
    }),
    JSON.stringify({ $set: { lastUpdated: "2025-06-01T10:01:05Z" } }),
    JSON.stringify({
      id: "msg-3",
      timestamp: "2025-06-01T10:02:00Z",
      type: "gemini",
      content: "another response",
      model: "gemini-2.5-pro",
      tokens: { input: 200, output: 80, cached: 0, thoughts: 50, total: 330 },
    }),
    JSON.stringify({
      id: "msg-4",
      timestamp: "2025-06-01T10:03:00Z",
      type: "gemini",
      content: "no tokens here",
    }),
    "not valid json",
    JSON.stringify({
      id: "msg-5",
      timestamp: "bad-date",
      type: "gemini",
      tokens: { input: 10, output: 5, cached: 0, total: 15 },
    }),
  ];

  fs.writeFileSync(filePath, lines.join("\n") + "\n");
  return filePath;
}

describe("GeminiSource", () => {
  it("reads valid records", async () => {
    const chatsDir = path.join(tmpDir, "user1", "chats");
    makeGeminiSession(chatsDir);
    process.env.GEMINI_DATA_DIR = tmpDir;

    const { GeminiSource } = await import("../src/sources/gemini.js");
    const source = new GeminiSource();
    expect(source.isAvailable()).toBe(true);

    const records = await source.readAll();
    expect(records).toHaveLength(2);
  });

  it("parses first record fields correctly", async () => {
    const chatsDir = path.join(tmpDir, "user1", "chats");
    makeGeminiSession(chatsDir);
    process.env.GEMINI_DATA_DIR = tmpDir;

    const { GeminiSource } = await import("../src/sources/gemini.js");
    const records = await new GeminiSource().readAll();
    const r = records[0];
    expect(r.source).toBe("gemini");
    expect(r.model).toBe("gemini-2.5-pro");
    expect(r.inputTokens).toBe(100);
    expect(r.outputTokens).toBe(50);
    expect(r.cacheReadTokens).toBe(30);
    expect(r.sessionId).toBe("abc-123");
    expect(r.project).toBe("proj-hash-1");
  });

  it("handles records without cache tokens", async () => {
    const chatsDir = path.join(tmpDir, "user1", "chats");
    makeGeminiSession(chatsDir);
    process.env.GEMINI_DATA_DIR = tmpDir;

    const { GeminiSource } = await import("../src/sources/gemini.js");
    const records = await new GeminiSource().readAll();
    const r = records[1];
    expect(r.inputTokens).toBe(200);
    expect(r.outputTokens).toBe(80);
    expect(r.cacheReadTokens).toBe(0);
  });

  it("returns unavailable when no dirs exist", async () => {
    process.env.GEMINI_DATA_DIR = path.join(tmpDir, "nonexistent");

    const { GeminiSource } = await import("../src/sources/gemini.js");
    const source = new GeminiSource();
    expect(source.isAvailable()).toBe(false);
    expect(await source.readAll()).toEqual([]);
  });

  it("respects GEMINI_DATA_DIR env var", async () => {
    const customDir = path.join(tmpDir, "custom-gemini");
    const chatsDir = path.join(customDir, "user1", "chats");
    makeGeminiSession(chatsDir);

    process.env.GEMINI_DATA_DIR = customDir;

    const { GeminiSource } = await import("../src/sources/gemini.js");
    const source = new GeminiSource();
    expect(source.isAvailable()).toBe(true);
    const records = await source.readAll();
    expect(records).toHaveLength(2);
  });

  it("skips gemini messages without tokens", async () => {
    const chatsDir = path.join(tmpDir, "user1", "chats");
    fs.mkdirSync(chatsDir, { recursive: true });
    const filePath = path.join(chatsDir, "session-notokens.jsonl");
    const lines = [
      JSON.stringify({ sessionId: "s1", projectHash: "p1", startTime: "2025-06-01T10:00:00Z", lastUpdated: "2025-06-01T10:00:00Z" }),
      JSON.stringify({ id: "m1", timestamp: "2025-06-01T10:01:00Z", type: "gemini", content: "response without tokens" }),
    ];
    fs.writeFileSync(filePath, lines.join("\n") + "\n");
    process.env.GEMINI_DATA_DIR = tmpDir;

    const { GeminiSource } = await import("../src/sources/gemini.js");
    const records = await new GeminiSource().readAll();
    expect(records).toHaveLength(0);
  });

  it("handles empty chats directory", async () => {
    const chatsDir = path.join(tmpDir, "user1", "chats");
    fs.mkdirSync(chatsDir, { recursive: true });
    process.env.GEMINI_DATA_DIR = tmpDir;

    const { GeminiSource } = await import("../src/sources/gemini.js");
    const records = await new GeminiSource().readAll();
    expect(records).toHaveLength(0);
  });
});
