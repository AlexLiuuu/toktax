# TokTax

**Track your total token usage and costs across all AI coding agents — one command, zero config.**

![toktax demo](./assets/image.png)

## Quick Start

```bash
npx toktax
```

## Supported Tools

| Tool | Data Source |
| ---- | ---------- |
| [Claude Code](https://github.com/anthropics/claude-code) | `~/.claude/projects/**/*.jsonl` |
| [Codex CLI](https://github.com/openai/codex) | `~/.codex/sessions/**/*.jsonl` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `~/.gemini/tmp/*/chats/*.jsonl` |

All data is read locally. Nothing is sent anywhere.

## License

MIT