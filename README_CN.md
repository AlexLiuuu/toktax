# TokTax

**一条命令查看所有 AI 编程工具的 Token 消耗和费用 — 零配置。**

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

## 安装

```bash
npm install -g toktax
```

或直接运行，无需安装：

```bash
npx toktax
```

不需要 API Key，不需要配置文件，不需要改任何代码。

## 为什么选 TokTax

- **一条命令，全局总览** — 不用记子命令和参数，所有数据一屏展示
- **可视化活动图** — 终端内柱状图，用量高峰一目了然
- **完全离线** — 内置 223 个模型定价，无需联网，数据不离开本地

## 工作原理

TokTax 自动发现本地文件系统中的使用数据：

| 工具 | 数据来源 | 追踪内容 |
|------|---------|----------|
| [Claude Code](https://github.com/anthropics/claude-code) | `~/.claude/projects/**/*.jsonl` | Token、模型、缓存、会话 |
| [Codex CLI](https://github.com/openai/codex) | `~/.codex/state_5.sqlite` | Token、模型、会话 |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `~/.gemini/tmp/*/chats/*.jsonl` | Token、模型、缓存、会话 |

所有数据都在本地处理，不会发送到任何外部服务。

## 功能

- **多来源汇总** — 一眼看清每个工具的消耗
- **时间维度统计** — 今日、7 天、30 天及日均数据
- **每日活动图** — 直观发现用量高峰
- **模型分布** — 哪些模型消耗最多
- **项目维度** — 按项目/仓库统计消耗
- **缓存命中率** — Prompt Caching 效果一目了然
- **费用估算** — 内置 223 个模型定价，覆盖 10 家厂商（Anthropic、OpenAI、Google、xAI、DeepSeek、Meta、Mistral、Qwen、Cohere、Amazon）

## 命令

```bash
toktax              # 仪表盘（默认）
toktax sessions     # 列出最近的会话
toktax sessions -d 7  # 最近 7 天的会话
```

## 配置

TokTax 开箱即用。如果你的工具安装在非默认路径，可以通过环境变量指定：

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Claude Code 数据目录（支持逗号分隔多路径） |
| `CODEX_HOME` | `~/.codex` | Codex CLI 数据目录 |
| `CODEX_SQLITE_HOME` | 同 `CODEX_HOME` | Codex SQLite 数据库目录 |

## 定价数据

费用估算数据内置在包中，离线可用。维护者可从 [OpenRouter](https://openrouter.ai) 同步最新价格：

```bash
npx tsx scripts/sync-pricing.ts          # 预览变更
npx tsx scripts/sync-pricing.ts --write  # 应用更新
```

费用为基于标准 API 公开定价的估算值，实际费用因套餐、层级和计费方式而异。

## 环境要求

- Node.js 18+
- 依赖自动安装

## 许可证

MIT

---

[English](README.md)
