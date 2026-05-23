import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

let tmpDir: string;
let originalHome: string | undefined;
let originalClaudeDir: string | undefined;
let originalCodexHome: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "toktax-test-"));
  originalHome = process.env.HOME;
  originalClaudeDir = process.env.CLAUDE_CONFIG_DIR;
  originalCodexHome = process.env.CODEX_HOME;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;
  if (originalClaudeDir !== undefined) process.env.CLAUDE_CONFIG_DIR = originalClaudeDir;
  else delete process.env.CLAUDE_CONFIG_DIR;
  if (originalCodexHome !== undefined) process.env.CODEX_HOME = originalCodexHome;
  else delete process.env.CODEX_HOME;
});

function makeClaudeJsonl(baseDir: string): string {
  const projectDir = path.join(baseDir, "test-project");
  fs.mkdirSync(projectDir, { recursive: true });
  const jsonlPath = path.join(projectDir, "session-abc.jsonl");

  const entries = [
    JSON.stringify({ type: "user", message: { content: "hello" } }),
    JSON.stringify({
      type: "assistant",
      uuid: "uuid-1",
      timestamp: "2025-05-20T10:00:00Z",
      message: {
        id: "msg-1",
        model: "claude-opus-4-6",
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_input_tokens: 5000,
          cache_creation_input_tokens: 200,
          speed: "standard",
        },
      },
    }),
    JSON.stringify({
      type: "assistant",
      uuid: "uuid-2",
      timestamp: "2025-05-20T10:05:00Z",
      message: {
        id: "msg-2",
        model: "claude-opus-4-6",
        usage: { input_tokens: 2000, output_tokens: 800 },
      },
    }),
    JSON.stringify({ type: "assistant", message: { content: "no usage" } }),
    JSON.stringify({
      type: "assistant",
      timestamp: "bad-date",
      message: { usage: { input_tokens: 1 } },
    }),
    "not valid json line",
  ];

  fs.writeFileSync(jsonlPath, entries.join("\n") + "\n");
  return baseDir;
}

function makeCodexSession(sessionsDir: string, filename = "rollout-test.jsonl"): string {
  fs.mkdirSync(sessionsDir, { recursive: true });
  const filePath = path.join(sessionsDir, filename);

  const lines = [
    JSON.stringify({
      timestamp: "2025-06-01T10:00:00Z",
      type: "session_meta",
      payload: { id: "session-1", timestamp: "2025-06-01T10:00:00Z", cwd: "/home/user/project" },
    }),
    JSON.stringify({
      timestamp: "2025-06-01T10:01:00Z",
      type: "turn_context",
      payload: { turn_id: "turn-1", model: "gpt-5.5", cwd: "/home/user/project" },
    }),
    JSON.stringify({
      timestamp: "2025-06-01T10:01:05Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: { input_tokens: 3000, cached_input_tokens: 1000, output_tokens: 500, total_tokens: 3500 },
          total_token_usage: { input_tokens: 3000, cached_input_tokens: 1000, output_tokens: 500, total_tokens: 3500 },
        },
      },
    }),
    JSON.stringify({
      timestamp: "2025-06-01T10:02:00Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: { input_tokens: 2000, cached_input_tokens: 800, output_tokens: 300, total_tokens: 2300 },
          total_token_usage: { input_tokens: 5000, cached_input_tokens: 1800, output_tokens: 800, total_tokens: 5800 },
        },
      },
    }),
    JSON.stringify({
      timestamp: "2025-06-01T10:03:00Z",
      type: "event_msg",
      payload: { type: "token_count", info: null },
    }),
  ];

  fs.writeFileSync(filePath, lines.join("\n") + "\n");
  return filePath;
}

describe("ClaudeCodeSource", () => {
  it("reads valid records", async () => {
    const projects = path.join(tmpDir, "projects");
    makeClaudeJsonl(projects);
    process.env.CLAUDE_CONFIG_DIR = tmpDir;

    const { ClaudeCodeSource } = await import("../src/sources/claude-code.js");
    const source = new ClaudeCodeSource();
    expect(source.isAvailable()).toBe(true);

    const records = await source.readAll();
    expect(records).toHaveLength(2);
  });

  it("parses first record fields correctly", async () => {
    const projects = path.join(tmpDir, "projects");
    makeClaudeJsonl(projects);
    process.env.CLAUDE_CONFIG_DIR = tmpDir;

    const { ClaudeCodeSource } = await import("../src/sources/claude-code.js");
    const records = await new ClaudeCodeSource().readAll();
    const r = records[0];
    expect(r.source).toBe("claude-code");
    expect(r.model).toBe("claude-opus-4-6");
    expect(r.inputTokens).toBe(1000);
    expect(r.outputTokens).toBe(500);
    expect(r.cacheReadTokens).toBe(5000);
    expect(r.cacheWriteTokens).toBe(200);
    expect(r.sessionId).toBe("session-abc");
  });

  it("handles records without cache tokens", async () => {
    const projects = path.join(tmpDir, "projects");
    makeClaudeJsonl(projects);
    process.env.CLAUDE_CONFIG_DIR = tmpDir;

    const { ClaudeCodeSource } = await import("../src/sources/claude-code.js");
    const records = await new ClaudeCodeSource().readAll();
    const r = records[1];
    expect(r.inputTokens).toBe(2000);
    expect(r.outputTokens).toBe(800);
    expect(r.cacheReadTokens).toBe(0);
    expect(r.cacheWriteTokens).toBe(0);
  });

  it("returns unavailable when no dirs exist", async () => {
    process.env.CLAUDE_CONFIG_DIR = path.join(tmpDir, "nonexistent");

    const { ClaudeCodeSource } = await import("../src/sources/claude-code.js");
    const source = new ClaudeCodeSource();
    expect(source.isAvailable()).toBe(false);
    expect(await source.readAll()).toEqual([]);
  });

  it("respects CLAUDE_CONFIG_DIR env var", async () => {
    const customDir = path.join(tmpDir, "custom-claude");
    const projects = path.join(customDir, "projects");
    makeClaudeJsonl(projects);

    process.env.CLAUDE_CONFIG_DIR = customDir;
    process.env.HOME = path.join(tmpDir, "fakehome");

    const { ClaudeCodeSource } = await import("../src/sources/claude-code.js");
    const source = new ClaudeCodeSource();
    expect(source.isAvailable()).toBe(true);
    const records = await source.readAll();
    expect(records).toHaveLength(2);
  });

  it("supports comma-separated CLAUDE_CONFIG_DIR", async () => {
    const dir1 = path.join(tmpDir, "dir1");
    const dir2 = path.join(tmpDir, "dir2");
    makeClaudeJsonl(path.join(dir1, "projects"));
    makeClaudeJsonl(path.join(dir2, "projects"));

    process.env.CLAUDE_CONFIG_DIR = `${dir1},${dir2}`;

    const { ClaudeCodeSource } = await import("../src/sources/claude-code.js");
    const records = await new ClaudeCodeSource().readAll();
    // Same uuids in both dirs → deduplicated to 2
    expect(records).toHaveLength(2);
  });

  it("deduplicates symlinked files", async () => {
    const realDir = path.join(tmpDir, "real", "projects");
    makeClaudeJsonl(realDir);
    const linkDir = path.join(tmpDir, "link", "projects");
    fs.mkdirSync(path.join(tmpDir, "link"), { recursive: true });
    fs.symlinkSync(realDir, linkDir);

    process.env.CLAUDE_CONFIG_DIR = `${path.join(tmpDir, "real")},${path.join(tmpDir, "link")}`;

    const { ClaudeCodeSource } = await import("../src/sources/claude-code.js");
    const records = await new ClaudeCodeSource().readAll();
    expect(records).toHaveLength(2);
  });

  it("deduplicates records by uuid", async () => {
    const projects = path.join(tmpDir, "projects");
    const projectDir = path.join(projects, "test-project");
    fs.mkdirSync(projectDir, { recursive: true });

    const entry = JSON.stringify({
      type: "assistant",
      uuid: "dup-uuid",
      timestamp: "2025-05-20T10:00:00Z",
      message: {
        id: "msg-dup",
        model: "claude-opus-4-6",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    });

    fs.writeFileSync(path.join(projectDir, "session-1.jsonl"), entry + "\n");
    fs.writeFileSync(path.join(projectDir, "session-2.jsonl"), entry + "\n");

    process.env.CLAUDE_CONFIG_DIR = tmpDir;

    const { ClaudeCodeSource } = await import("../src/sources/claude-code.js");
    const records = await new ClaudeCodeSource().readAll();
    expect(records).toHaveLength(1);
  });

  it("uses costUSD when available", async () => {
    const projects = path.join(tmpDir, "projects");
    const projectDir = path.join(projects, "test-project");
    fs.mkdirSync(projectDir, { recursive: true });

    const entry = JSON.stringify({
      type: "assistant",
      uuid: "cost-uuid",
      timestamp: "2025-05-20T10:00:00Z",
      costUSD: 0.42,
      message: {
        id: "msg-cost",
        model: "claude-opus-4-6",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    });
    fs.writeFileSync(path.join(projectDir, "session-cost.jsonl"), entry + "\n");
    process.env.CLAUDE_CONFIG_DIR = tmpDir;

    const { ClaudeCodeSource } = await import("../src/sources/claude-code.js");
    const records = await new ClaudeCodeSource().readAll();
    expect(records[0].estimatedCostUsd).toBe(0.42);
  });

  it("captures speed from usage field", async () => {
    const projects = path.join(tmpDir, "projects");
    const projectDir = path.join(projects, "test-project");
    fs.mkdirSync(projectDir, { recursive: true });

    const entry = JSON.stringify({
      type: "assistant",
      uuid: "fast-uuid",
      timestamp: "2025-05-20T10:00:00Z",
      message: {
        id: "msg-fast",
        model: "claude-opus-4-6",
        usage: { input_tokens: 100, output_tokens: 50, speed: "fast" },
      },
    });
    fs.writeFileSync(path.join(projectDir, "session-fast.jsonl"), entry + "\n");
    process.env.CLAUDE_CONFIG_DIR = tmpDir;

    const { ClaudeCodeSource } = await import("../src/sources/claude-code.js");
    const records = await new ClaudeCodeSource().readAll();
    expect(records[0].extra.speed).toBe("fast");
  });

  it("filters out synthetic model entries", async () => {
    const projects = path.join(tmpDir, "projects");
    const projectDir = path.join(projects, "test-project");
    fs.mkdirSync(projectDir, { recursive: true });

    const entry = JSON.stringify({
      type: "assistant",
      uuid: "synth-uuid",
      timestamp: "2025-05-20T10:00:00Z",
      message: {
        id: "msg-synth",
        model: "<synthetic>",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    });
    fs.writeFileSync(path.join(projectDir, "session-synth.jsonl"), entry + "\n");
    process.env.CLAUDE_CONFIG_DIR = tmpDir;

    const { ClaudeCodeSource } = await import("../src/sources/claude-code.js");
    const records = await new ClaudeCodeSource().readAll();
    expect(records).toHaveLength(0);
  });

  it("falls back to ~/.config/claude/projects/", async () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    const fakeHome = path.join(tmpDir, "fakehome");
    const configProjects = path.join(fakeHome, ".config", "claude", "projects");
    makeClaudeJsonl(configProjects);

    process.env.HOME = fakeHome;

    const { ClaudeCodeSource } = await import("../src/sources/claude-code.js");
    const source = new ClaudeCodeSource();
    expect(source.isAvailable()).toBe(true);
    const records = await source.readAll();
    expect(records).toHaveLength(2);
  });
});

describe("CodexSource", () => {
  it("reads valid records", async () => {
    const sessionsDir = path.join(tmpDir, "sessions");
    makeCodexSession(sessionsDir);
    process.env.CODEX_HOME = tmpDir;

    const { CodexSource } = await import("../src/sources/codex.js");
    const source = new CodexSource();
    expect(source.isAvailable()).toBe(true);

    const records = await source.readAll();
    expect(records).toHaveLength(2);
  });

  it("parses record fields correctly", async () => {
    const sessionsDir = path.join(tmpDir, "sessions");
    makeCodexSession(sessionsDir);
    process.env.CODEX_HOME = tmpDir;

    const { CodexSource } = await import("../src/sources/codex.js");
    const records = await new CodexSource().readAll();
    const r = records[0];
    expect(r.source).toBe("codex");
    expect(r.model).toBe("gpt-5.5");
    expect(r.inputTokens).toBe(3000);
    expect(r.outputTokens).toBe(500);
    expect(r.cacheReadTokens).toBe(1000);
    expect(r.sessionId).toBe("session-1");
    expect(r.project).toBe("project");
  });

  it("returns unavailable when no sessions dir exists", async () => {
    process.env.CODEX_HOME = path.join(tmpDir, "nonexistent");

    const { CodexSource } = await import("../src/sources/codex.js");
    const source = new CodexSource();
    expect(source.isAvailable()).toBe(false);
    expect(await source.readAll()).toEqual([]);
  });

  it("respects CODEX_HOME env var", async () => {
    const customDir = path.join(tmpDir, "custom-codex");
    const sessionsDir = path.join(customDir, "sessions");
    makeCodexSession(sessionsDir);

    process.env.CODEX_HOME = customDir;

    const { CodexSource } = await import("../src/sources/codex.js");
    const source = new CodexSource();
    expect(source.isAvailable()).toBe(true);
    expect(await source.readAll()).toHaveLength(2);
  });

  it("skips token_count events without info", async () => {
    const sessionsDir = path.join(tmpDir, "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    const lines = [
      JSON.stringify({ timestamp: "2025-06-01T10:00:00Z", type: "session_meta", payload: { id: "s1", cwd: "/tmp" } }),
      JSON.stringify({ timestamp: "2025-06-01T10:01:00Z", type: "event_msg", payload: { type: "token_count", info: null } }),
    ];
    fs.writeFileSync(path.join(sessionsDir, "test.jsonl"), lines.join("\n") + "\n");
    process.env.CODEX_HOME = tmpDir;

    const { CodexSource } = await import("../src/sources/codex.js");
    const records = await new CodexSource().readAll();
    expect(records).toHaveLength(0);
  });
});
