# AgentLens — Design Specification

**Date**: 2026-05-23
**Status**: Draft
**Version**: 0.1

## Overview

AgentLens is a zero-config LLM observability TUI for developers. It wraps any AI application with a local proxy, intercepts all LLM API calls, and displays a beautiful real-time terminal dashboard showing tokens, costs, latency, and full request/response traces.

**Tagline**: "See everything your AI agent does — zero config, zero code changes."

**Target audience**: Any developer using LLM APIs (via OpenAI, Anthropic, Google SDKs) who wants visibility into what their agent is doing, how much it costs, and where time is spent.

**Key differentiator**: Unlike Langfuse, LangSmith, or other observability platforms that require SDK integration, cloud setup, or infrastructure — AgentLens is a single `pip install` and one command. Everything runs locally, nothing leaves your machine.

## Usage

### Primary flow — one-command wrapper

```bash
pip install agentlens
agentlens run python my_agent.py
```

This single command:
1. Starts a local reverse proxy on a random available port
2. Injects provider-specific base URL env vars into the subprocess
3. Runs the user's command as a child process
4. Displays a live-updating TUI dashboard with the app's output embedded

### Additional commands

```bash
agentlens history                  # List past sessions (shows command + timestamp)
agentlens replay <session-id>     # Re-open a past session in the TUI
agentlens export <session-id>     # Export session as JSON
agentlens config pricing           # Add/edit custom model pricing
agentlens update-pricing           # Fetch latest pricing from GitHub repo
```

## Architecture

```
┌───────────────────────────────────────────────────────┐
│                 agentlens run <cmd>                    │
│                                                       │
│  ┌──────────┐   ┌──────────────┐   ┌───────────────┐  │
│  │ User App │──▸│ Reverse Proxy│──▸│  LLM APIs     │  │
│  │ (child   │   │  (aiohttp)   │◂──│  OpenAI       │  │
│  │ process) │◂──│ localhost:   │   │  Anthropic    │  │
│  │          │   │   PORT       │   │  Google       │  │
│  └──────────┘   └──────┬───────┘   └───────────────┘  │
│                        │ log                          │
│                   ┌────▼─────┐                        │
│                   │  SQLite  │                        │
│                   │  Store   │                        │
│                   └────┬─────┘                        │
│                        │ query                        │
│                   ┌────▼──────────────────────┐       │
│                   │   Textual TUI Dashboard   │       │
│                   │   + App Output Panel      │       │
│                   └───────────────────────────┘       │
└───────────────────────────────────────────────────────┘
```

### Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| CLI | `click` | Command parsing: `run`, `history`, `replay`, `export` |
| Proxy | `aiohttp` | Reverse proxy forwarding to real LLM APIs |
| Parsers | Custom per-provider | Extract tokens, model, cost from each provider's API format |
| Store | `aiosqlite` + SQLite | Persist sessions and calls to `~/.agentlens/data.db` |
| Pricing | Bundled JSON | Per-model token pricing for top 20-30 models |
| TUI | `textual` | Live dashboard with 3 tabs + app output panel |

### Proxy mechanism

The proxy runs as a local HTTP server. When `agentlens run` starts the user's app, it injects environment variables that redirect LLM SDK traffic to the local proxy:

| Provider | Env var injected | Forwards to |
|----------|-----------------|-------------|
| OpenAI | `OPENAI_BASE_URL=http://localhost:PORT/openai/v1` | `https://api.openai.com/v1` |
| Anthropic | `ANTHROPIC_BASE_URL=http://localhost:PORT/anthropic` | `https://api.anthropic.com` |
| Google | `GEMINI_BASE_URL=http://localhost:PORT/gemini` | `https://generativelanguage.googleapis.com` |

Request flow:
1. User app sends request to `http://localhost:PORT/<provider>/...`
2. Proxy extracts the auth header and request body
3. Proxy determines real upstream URL from the path prefix
4. Proxy forwards the request to the real API with original auth
5. Proxy captures the response (including streaming SSE chunks)
6. Proxy calculates tokens and cost, logs to SQLite
7. Proxy returns the response to the user app
8. TUI updates in real-time via reactive data binding

### Streaming SSE handling

Many LLM calls use streaming (Server-Sent Events). The proxy must:
1. Forward each SSE chunk to the client immediately (no buffering)
2. Accumulate chunks in memory to reconstruct the full response
3. On stream end, parse the final `usage` object and log the complete call
4. For Anthropic, handle `message_start`, `content_block_delta`, `message_delta` events
5. For OpenAI, handle `data: {...}` chunks and `data: [DONE]` sentinel

## Data Model

### Session

```python
@dataclass
class Session:
    id: str              # UUID
    command: str          # the wrapped command string
    started_at: datetime
    ended_at: datetime | None
    total_input_tokens: int
    total_output_tokens: int
    total_cost: float    # sum of known costs
    has_unknown_pricing: bool
```

### Call

```python
@dataclass
class Call:
    id: str              # UUID
    session_id: str
    provider: str        # "openai" | "anthropic" | "google"
    model: str           # "gpt-4o", "claude-sonnet-4-6", etc.
    endpoint: str        # "chat/completions", "messages", etc.
    request_body: str    # JSON string
    response_body: str   # JSON string (full accumulated for streaming)
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    cost: float | None   # None if model not in pricing table
    latency_ms: int
    status_code: int
    is_streaming: bool
    created_at: datetime
```

## Token & Cost Tracking

### Token extraction

Tokens are extracted from the actual API response — always accurate:

| Provider | Fields |
|----------|--------|
| OpenAI | `usage.prompt_tokens`, `usage.completion_tokens` |
| Anthropic | `usage.input_tokens`, `usage.output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` |
| Google | `usageMetadata.promptTokenCount`, `usageMetadata.candidatesTokenCount` |

### Cost calculation

A bundled `pricing/data.json` maps `(provider, model) → per-token pricing`. Pricing includes input, output, cache read, and cache write rates where applicable.

If a model is not in the pricing table, tokens are still shown but cost displays as `~` (unknown). The total cost shows a `+` suffix to indicate incomplete cost data.

Users can:
- Add custom pricing via CLI: `agentlens config pricing`
- Update bundled pricing: `agentlens update-pricing`
- Contribute pricing data via GitHub PR

## TUI Design

Built with Textual. Three tabs plus an embedded app output panel.

### Tab 1: Overview (default)

- Header bar: recording status, command name, elapsed time
- 4 stat cards: total calls, total tokens, total cost, average latency
- Scrollable call table: #, provider, model, input tokens, output tokens, cost, latency, status
- Selecting a row navigates to Trace Detail
- Bottom panel: live app stdout/stderr output

### Tab 2: Trace Detail

- Split view: request body (left) and response body (right)
- Syntax-highlighted JSON with collapsible sections
- Footer: token breakdown, latency, cache stats, HTTP status

### Tab 3: Costs

- Cost by provider (horizontal bar chart)
- Cost by model (table)
- Token distribution (input vs output breakdown)
- Cache savings estimate

### Key bindings

| Key | Action |
|-----|--------|
| `Tab` / `1-3` | Switch tabs |
| `↑↓` / `j/k` | Navigate call list |
| `Enter` | Inspect selected call |
| `Esc` | Back to overview |
| `/` | Filter calls by model/provider |
| `e` | Export current session |
| `q` | Quit (session auto-saved) |
| `?` | Show help |

### Textual CSS theme

Dark theme by default with accent colors for providers:
- Anthropic: amber/orange
- OpenAI: green
- Google: blue
- Status success: green checkmark
- Status error: red X

## Project Structure

```
agentlens/
├── pyproject.toml
├── README.md
├── LICENSE                  # MIT
├── src/
│   └── agentlens/
│       ├── __init__.py
│       ├── cli.py           # Click CLI entry point
│       ├── proxy/
│       │   ├── __init__.py
│       │   ├── server.py    # aiohttp proxy server
│       │   ├── handlers.py  # per-provider request routing
│       │   └── streaming.py # SSE stream forwarding + accumulation
│       ├── parsers/
│       │   ├── __init__.py
│       │   ├── base.py      # Parser interface
│       │   ├── openai.py    # OpenAI response parser
│       │   ├── anthropic.py # Anthropic response parser
│       │   └── google.py    # Google AI response parser
│       ├── store/
│       │   ├── __init__.py
│       │   ├── db.py        # SQLite schema, migrations, queries
│       │   └── models.py    # Session, Call dataclasses
│       ├── pricing/
│       │   ├── __init__.py
│       │   ├── calculator.py
│       │   └── data.json    # bundled pricing table
│       └── tui/
│           ├── __init__.py
│           ├── app.py       # Main Textual application
│           ├── screens/
│           │   ├── overview.py   # Overview tab
│           │   ├── trace.py      # Trace detail tab
│           │   └── costs.py      # Costs tab
│           ├── widgets/
│           │   ├── call_table.py  # Scrollable call list
│           │   ├── stat_card.py   # Summary stat widget
│           │   ├── cost_chart.py  # Bar chart for costs
│           │   └── output_log.py  # App output panel
│           └── theme.css          # Textual CSS styling
└── tests/
    ├── test_proxy.py
    ├── test_parsers.py
    ├── test_store.py
    └── test_pricing.py
```

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `textual` | `>=2.0` | TUI framework |
| `aiohttp` | `>=3.9` | Async HTTP reverse proxy |
| `aiosqlite` | `>=0.20` | Async SQLite access |
| `click` | `>=8.0` | CLI framework |

No heavy dependencies. Total install size should be minimal.

## v0.1 Scope

### In scope

- `agentlens run <command>` — proxy + TUI wrapper
- Local reverse proxy for OpenAI, Anthropic, Google APIs
- Streaming SSE support
- Live TUI with 3 tabs: Overview, Trace Detail, Costs
- App output panel
- SQLite persistence in `~/.agentlens/`
- `agentlens history` — list past sessions
- `agentlens replay <id>` — re-open past session in TUI
- `agentlens export <id>` — export as JSON
- Bundled pricing for top 20-30 models

### Out of scope (future versions)

- Agent-aware intelligence (loop detection, tool-use chain visualization)
- Session comparison / diffing
- HTML/PDF export
- Plugin system
- Providers beyond OpenAI, Anthropic, Google
- Web UI alternative to TUI
- Team/collaboration features
- CI/CD integration

## Success Criteria

- A developer can go from `pip install agentlens` to seeing their first live dashboard in under 60 seconds
- Works with any Python or Node.js app that uses standard LLM SDKs
- Streaming calls show real-time progress in the TUI
- Session data persists and can be replayed after the app exits
- The TUI is visually polished enough to screenshot for the README

## Behavioral Details

### Error handling

When the upstream LLM API returns an error (4xx/5xx), the proxy forwards the error response as-is to the user app. The error is logged as a call with the corresponding status code and displayed with a red indicator in the TUI.

### Child process lifecycle

When the wrapped child process exits, the TUI remains open so the user can inspect the final session data. The header changes from "RECORDING" to "COMPLETED". The user presses `q` to quit.

### Session identification

Sessions are identified by UUID. In `agentlens history`, they display as: `<short-id> | <command> | <timestamp> | <calls> calls | <cost>`.

### Database location

All data persists in `~/.agentlens/data.db` (SQLite). The directory is created on first run.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SDK doesn't respect `*_BASE_URL` env vars | App bypasses proxy, no data | Document which SDK versions are supported; test with latest |
| Streaming SSE parsing is fragile | Incomplete/corrupt call data | Extensive testing with real API responses from each provider |
| Textual rendering on different terminals | Visual glitches | Test on iTerm2, Terminal.app, Windows Terminal, kitty |
| pricing.json gets outdated | Inaccurate costs | Easy update mechanism + community PRs |
| App needs interactive stdin | Can't use wrapper mode | Document limitation; suggest two-terminal mode for interactive apps |
