# TokTax

**See how much your AI coding agents actually cost — zero config, zero code changes.**

Quickly see your total token usage and costs across Claude Code and Codex — one command, zero config.

```
$ toktax

 TokTax v0.1.0  ✓ Claude Code  ✓ Codex

  Source        Calls  Tokens    ~Cost
  Claude Code   4,218  892.5M  $1,482.30
  Codex           156   12.4M     $38.90

  Period     Calls  Tokens  w/ Cache    ~Cost
  Today        187   38.2M    142.7M    $68.50
  Last 7d    1,432  298.6M      1.2B   $512.40
  Last 30d   4,374  904.9M      3.8B $1,521.20

  Avg/day    Calls  Tokens  w/ Cache
  Last 7d      204   42.7M    171.4M
  Last 30d     145   30.2M    126.7M

 Daily Activity (last 7d)
  05-17  ███████████████████     156 calls  28.4M tok
  05-18  ████████████████████████████ 231 calls  48.1M tok
  05-19  ████████████████████████ 198 calls  41.2M tok
  05-20  ██████████████████████████████ 245 calls  52.8M tok
  05-21  █████████████████████   178 calls  36.9M tok
  05-22  █████████████████████████████ 237 calls  49.5M tok
  05-23  ██████████████████████  187 calls  38.2M tok

 ╭─────────────── Models (last 7d) ───────────────╮
 │ Model              Calls     In    Out   ~Cost │
 │ claude-opus-4-6      876 198.2M  42.1M $382.10 │
 │ claude-sonnet-4-6    412  62.8M  18.4M  $98.40 │
 │ gpt-5.4               98   8.2M   2.1M  $24.30 │
 │ claude-haiku-4-5      46   3.4M   0.8M   $7.60 │
 ╰────────────────────────────────────────────────╯

 Cache  hit rate: 79%  reads: 938.0M  input: 298.6M
```

## Install

```bash
npm install -g toktax
```

Or run directly without installing:

```bash
npx toktax
```

That's it. No API keys, no config files, no code changes.

## How It Works

TokTax auto-discovers usage data from your local filesystem:

| Tool | Data Source | What's Tracked |
|------|-----------|----------------|
| [Claude Code](https://github.com/anthropics/claude-code) | `~/.claude/projects/**/*.jsonl` | Tokens, models, cache, sessions |
| [Codex CLI](https://github.com/openai/codex) | `~/.codex/state_5.sqlite` | Tokens, models, sessions |

Everything stays on your machine. No data is sent anywhere.

## What You Get

- **Per-source breakdown** — see which tool costs what
- **Period summaries** — today, 7d, 30d with daily averages
- **Daily activity chart** — spot usage spikes at a glance
- **Model breakdown** — which models burn the most tokens
- **Project breakdown** — cost per project/repo
- **Cache hit rate** — how well prompt caching is working
- **Cost estimates** — 223 models across 10 providers (Anthropic, OpenAI, Google, xAI, DeepSeek, Meta, Mistral, Qwen, Cohere, Amazon)

## Commands

```bash
toktax              # Dashboard (default)
toktax sessions     # List recent sessions
toktax sessions -d 7  # Sessions from last 7 days
```

## Configuration

TokTax works out of the box. For non-default install paths, set environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Claude Code data directory (comma-separated for multiple) |
| `CODEX_HOME` | `~/.codex` | Codex CLI data directory |
| `CODEX_SQLITE_HOME` | same as `CODEX_HOME` | Codex SQLite database directory |

## Pricing Data

Cost estimates are bundled and work offline. Maintainers can update pricing from [OpenRouter](https://openrouter.ai):

```bash
npx tsx scripts/sync-pricing.ts          # Preview changes
npx tsx scripts/sync-pricing.ts --write  # Apply updates
```

Costs are estimates based on standard API list prices. Actual costs vary by plan, tier, and billing method.

## Requirements

- Node.js 18+
- Dependencies installed automatically

## License

MIT

---

[中文文档](README_CN.md)
