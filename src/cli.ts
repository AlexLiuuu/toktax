import { Command } from "commander";
import chalk from "chalk";
import { discoverSources, readAllSources } from "./sources/discover.js";
import { PricingCalculator } from "./pricing/calculator.js";
import type { UsageRecord } from "./types.js";

const VERSION = "0.1.0";

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(c: number): string {
  if (c === 0) return "-";
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(2)}`;
}

function sourceLabel(name: string): string {
  const labels: Record<string, string> = {
    "claude-code": chalk.hex("#FF8700")("Claude Code"),
    codex: chalk.green("Codex"),
    cursor: chalk.hex("#1E90FF")("Cursor"),
  };
  return labels[name] ?? name;
}

function applyPricing(records: UsageRecord[], pricing: PricingCalculator): void {
  for (const r of records) {
    if (r.estimatedCostUsd === 0 && (r.inputTokens > 0 || r.outputTokens > 0)) {
      const provider =
        (r.extra.provider as string) || pricing.guessProvider(r.model);
      if (!provider) continue;
      const cost = pricing.calculate(
        provider, r.model, r.inputTokens, r.outputTokens,
        r.cacheReadTokens, r.cacheWriteTokens,
      );
      if (cost !== null) r.estimatedCostUsd = cost;
    }
  }
}

// ── Table rendering utilities ──

type Align = "left" | "right";

function stripAnsi(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function pad(s: string, width: number, align: Align): string {
  const visible = stripAnsi(s);
  const diff = width - visible;
  if (diff <= 0) return s;
  return align === "right" ? " ".repeat(diff) + s : s + " ".repeat(diff);
}

function colWidths(
  headers: string[],
  rows: string[][],
  padding: number,
): number[] {
  return headers.map((h, i) => {
    let max = stripAnsi(h);
    for (const row of rows) {
      if (row[i]) max = Math.max(max, stripAnsi(row[i]));
    }
    return max + padding;
  });
}

function printSimpleTable(
  headers: string[],
  rows: string[][],
  aligns: Align[],
  headerStyle: (s: string) => string = chalk.bold,
): void {
  const widths = colWidths(headers, rows, 2);
  const headerLine = "  " + headers.map((h, i) => pad(headerStyle(h), widths[i], aligns[i])).join("  ");
  const separator = "  " + widths.map((w) => "─".repeat(w)).join("──");
  console.log(headerLine);
  console.log(separator);
  for (const row of rows) {
    console.log("  " + row.map((c, i) => pad(c, widths[i], aligns[i])).join("  "));
  }
}

function printRoundedTable(
  title: string,
  headers: string[],
  rows: string[][],
  aligns: Align[],
): void {
  const widths = colWidths(headers, rows, 2);
  const totalWidth = widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * 3 + 4;

  const titlePad = Math.max(0, Math.floor((totalWidth - stripAnsi(title)) / 2));
  console.log(" ".repeat(titlePad) + chalk.bold(title));

  const topLine = "╭" + widths.map((w) => "─".repeat(w + 2)).join("┬") + "╮";
  const midLine = "├" + widths.map((w) => "─".repeat(w + 2)).join("┼") + "┤";
  const botLine = "╰" + widths.map((w) => "─".repeat(w + 2)).join("┴") + "╯";

  const fmtRow = (cells: string[], style?: (s: string) => string) =>
    "│" +
    cells.map((c, i) => " " + pad(style ? style(c) : c, widths[i], aligns[i]) + " ").join("│") +
    "│";

  console.log(topLine);
  console.log(fmtRow(headers, chalk.bold));
  console.log(midLine);
  for (const row of rows) {
    console.log(fmtRow(row));
  }
  console.log(botLine);
}

// ── Dashboard ──

async function showDashboard(): Promise<void> {
  const sources = discoverSources();
  if (sources.length === 0) {
    console.log(chalk.dim("No AI tool data found."));
    console.log("  TokTax looks for:");
    console.log("  • Claude Code  (~/.claude/projects/)");
    console.log("  • Codex CLI    (~/.codex/state_5.sqlite)");
    return;
  }

  const sourceNames = sources
    .map((s) => `${chalk.green("✓")} ${sourceLabel(s.name)}`)
    .join("  ");
  console.log(`\n ${chalk.bold(`TokTax v${VERSION}`)}  ${sourceNames}\n`);

  const records = await readAllSources();
  if (records.length === 0) {
    console.log(chalk.dim("  No usage data yet."));
    return;
  }

  const pricing = new PricingCalculator();
  applyPricing(records, pricing);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const last7d = records.filter((r) => r.timestamp >= d7);
  const last30d = records.filter((r) => r.timestamp >= d30);
  const todayRecords = last7d.filter((r) => r.timestamp >= today);

  const allSources = [...new Set(last30d.map((r) => r.source))].sort();
  const multiSource = allSources.length > 1;

  // ── Source summary ──
  const bySource: Record<string, { calls: number; tokens: number; cost: number }> = {};
  for (const r of last30d) {
    bySource[r.source] ??= { calls: 0, tokens: 0, cost: 0 };
    bySource[r.source].calls++;
    bySource[r.source].tokens += r.inputTokens + r.outputTokens;
    bySource[r.source].cost += r.estimatedCostUsd;
  }

  const srcRows = Object.keys(bySource).sort().map((src) => {
    const d = bySource[src];
    return [
      sourceLabel(src),
      chalk.green(String(d.calls)),
      chalk.green(fmtTokens(d.tokens)),
      chalk.dim(fmtCost(d.cost)),
    ];
  });
  printSimpleTable(["Source", "Calls", "Tokens", "~Cost"], srcRows, ["left", "right", "right", "right"]);

  // ── Period summary ──
  function periodStats(recs: UsageRecord[]) {
    const tokens = recs.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0);
    const total = recs.reduce((s, r) => s + r.inputTokens + r.outputTokens + r.cacheReadTokens, 0);
    const cost = recs.reduce((s, r) => s + r.estimatedCostUsd, 0);
    return { calls: recs.length, tokens, total, cost };
  }

  const sToday = periodStats(todayRecords);
  const s7d = periodStats(last7d);
  const s30d = periodStats(last30d);

  const activeDays7 = new Set(last7d.map((r) => r.timestamp.toISOString().slice(0, 10))).size || 1;
  const activeDays30 = new Set(last30d.map((r) => r.timestamp.toISOString().slice(0, 10))).size || 1;

  console.log();
  const periodRows = [
    ["Today", chalk.green(String(sToday.calls)), chalk.green(fmtTokens(sToday.tokens)), chalk.green(fmtTokens(sToday.total)), chalk.dim(fmtCost(sToday.cost))],
    ["Last 7d", chalk.green(String(s7d.calls)), chalk.green(fmtTokens(s7d.tokens)), chalk.green(fmtTokens(s7d.total)), chalk.dim(fmtCost(s7d.cost))],
    ["Last 30d", chalk.green(String(s30d.calls)), chalk.green(fmtTokens(s30d.tokens)), chalk.green(fmtTokens(s30d.total)), chalk.dim(fmtCost(s30d.cost))],
  ];
  printSimpleTable(["Period", "Calls", "Tokens", "w/ Cache", "~Cost"], periodRows, ["left", "right", "right", "right", "right"]);

  console.log();
  const avgRows = [
    ["Last 7d", chalk.green(String(Math.floor(s7d.calls / activeDays7))), chalk.green(fmtTokens(Math.floor(s7d.tokens / activeDays7))), chalk.green(fmtTokens(Math.floor(s7d.total / activeDays7)))],
    ["Last 30d", chalk.green(String(Math.floor(s30d.calls / activeDays30))), chalk.green(fmtTokens(Math.floor(s30d.tokens / activeDays30))), chalk.green(fmtTokens(Math.floor(s30d.total / activeDays30)))],
  ];
  printSimpleTable(["Avg/day", "Calls", "Tokens", "w/ Cache"], avgRows, ["left", "right", "right", "right"]);

  // ── Daily Activity (last 7d) ──
  const byDay: Record<string, { calls: number; tokens: number; sources: Record<string, number> }> = {};
  for (const r of last7d) {
    const day = `${String(r.timestamp.getUTCMonth() + 1).padStart(2, "0")}-${String(r.timestamp.getUTCDate()).padStart(2, "0")}`;
    byDay[day] ??= { calls: 0, tokens: 0, sources: {} };
    byDay[day].calls++;
    byDay[day].tokens += r.inputTokens + r.outputTokens;
    byDay[day].sources[r.source] = (byDay[day].sources[r.source] ?? 0) + 1;
  }

  const days = Object.keys(byDay).sort();
  if (days.length > 0) {
    const maxCalls = Math.max(...Object.values(byDay).map((d) => d.calls));
    console.log(`\n ${chalk.bold("Daily Activity (last 7d)")}`);
    for (const day of days) {
      const d = byDay[day];
      const barLen = Math.round((d.calls / Math.max(1, maxCalls)) * 30);
      const bar = "█".repeat(barLen);
      let srcInfo = "";
      if (Object.keys(d.sources).length > 1) {
        srcInfo = "  " + Object.entries(d.sources)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([s, c]) => `${sourceLabel(s)}:${c}`)
          .join("  ");
      }
      console.log(
        `  ${day}  ${chalk.cyan(bar)} ${chalk.green(String(d.calls).padStart(5))} calls  ${fmtTokens(d.tokens).padStart(6)} tok${srcInfo}`
      );
    }
  }

  // ── Models (last 7d) ──
  const byModel: Record<string, { calls: number; in: number; out: number; cacheR: number; cost: number; sources: Set<string> }> = {};
  for (const r of last7d) {
    byModel[r.model] ??= { calls: 0, in: 0, out: 0, cacheR: 0, cost: 0, sources: new Set() };
    byModel[r.model].calls++;
    byModel[r.model].in += r.inputTokens;
    byModel[r.model].out += r.outputTokens;
    byModel[r.model].cacheR += r.cacheReadTokens;
    byModel[r.model].cost += r.estimatedCostUsd;
    byModel[r.model].sources.add(r.source);
  }

  const modelEntries = Object.entries(byModel)
    .filter(([m]) => m !== "<synthetic>")
    .sort((a, b) => b[1].calls - a[1].calls);

  if (modelEntries.length > 0) {
    const modelHead = ["Model"];
    const modelAligns: Align[] = ["left"];
    if (multiSource) {
      modelHead.push("Source");
      modelAligns.push("left");
    }
    modelHead.push("Calls", "In", "Out", "Cache", "~Cost");
    modelAligns.push("right", "right", "right", "right", "right");

    const modelRows = modelEntries.map(([model, d]) => {
      const row: string[] = [chalk.cyan(model)];
      if (multiSource) {
        row.push([...d.sources].sort().map(sourceLabel).join(", "));
      }
      row.push(
        chalk.green(String(d.calls)),
        fmtTokens(d.in),
        fmtTokens(d.out),
        chalk.dim(fmtTokens(d.cacheR)),
        chalk.dim(fmtCost(d.cost)),
      );
      return row;
    });

    console.log();
    printRoundedTable("Models (last 7d)", modelHead, modelRows, modelAligns);
  }

  // ── Projects (last 30d) ──
  const byProject: Record<string, { calls: number; tokens: number; sources: Set<string> }> = {};
  for (const r of last30d) {
    if (!r.project) continue;
    byProject[r.project] ??= { calls: 0, tokens: 0, sources: new Set() };
    byProject[r.project].calls++;
    byProject[r.project].tokens += r.inputTokens + r.outputTokens;
    byProject[r.project].sources.add(r.source);
  }

  const projectEntries = Object.entries(byProject)
    .sort((a, b) => b[1].calls - a[1].calls)
    .slice(0, 8);

  if (projectEntries.length > 0) {
    const maxProjCalls = Math.max(...projectEntries.map(([, d]) => d.calls));
    console.log(`\n ${chalk.bold("Projects (last 30d)")}`);
    for (const [proj, d] of projectEntries) {
      const short = proj.length > 35 ? proj.slice(-35) : proj;
      const barLen = Math.round((d.calls / Math.max(1, maxProjCalls)) * 15);
      const bar = "█".repeat(barLen);
      let srcSuffix = "";
      if (d.sources.size > 1) {
        srcSuffix = "  " + [...d.sources].sort().map(sourceLabel).join(" ");
      }
      console.log(
        `  ${short.padEnd(36)} ${chalk.cyan(bar)} ${chalk.green(String(d.calls).padStart(5))} calls  ${fmtTokens(d.tokens).padStart(6)} tok${srcSuffix}`
      );
    }
  }

  console.log(
    `\n ${chalk.dim("Costs are estimates based on standard API list prices. Actual costs vary by plan, tier, and billing method.")}\n`
  );
}

// ── Sessions ──

async function showSessions(days: number): Promise<void> {
  const records = await readAllSources();
  const pricing = new PricingCalculator();
  applyPricing(records, pricing);

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const recent = records.filter((r) => r.timestamp >= cutoff);

  const bySession: Record<string, {
    start: Date; model: string; calls: number; tokens: number;
    cost: number; project: string; source: string;
  }> = {};

  for (const r of recent) {
    const sid = r.sessionId;
    bySession[sid] ??= {
      start: r.timestamp, model: r.model, calls: 0, tokens: 0,
      cost: 0, project: r.project, source: r.source,
    };
    bySession[sid].calls++;
    bySession[sid].tokens += r.inputTokens + r.outputTokens;
    bySession[sid].cost += r.estimatedCostUsd;
  }

  const sorted = Object.entries(bySession)
    .sort((a, b) => b[1].start.getTime() - a[1].start.getTime())
    .slice(0, 30);

  const sessionRows = sorted.map(([, s]) => {
    const mm = String(s.start.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(s.start.getUTCDate()).padStart(2, "0");
    const hh = String(s.start.getUTCHours()).padStart(2, "0");
    const mi = String(s.start.getUTCMinutes()).padStart(2, "0");
    return [
      chalk.dim(`${mm}-${dd} ${hh}:${mi}`),
      sourceLabel(s.source),
      chalk.cyan(s.model),
      chalk.green(String(s.calls)),
      fmtTokens(s.tokens),
      chalk.dim(fmtCost(s.cost)),
      (s.project || "").slice(0, 25),
    ];
  });

  printRoundedTable(
    "Sessions",
    ["Date", "Source", "Model", "Calls", "Tokens", "~Cost", "Project"],
    sessionRows,
    ["left", "left", "left", "right", "right", "right", "left"],
  );
}

const program = new Command();
program
  .name("toktax")
  .description("TokTax — See everything your AI agent does.")
  .version(VERSION);

program.action(async () => {
  await showDashboard();
});

program
  .command("sessions")
  .description("List recent sessions")
  .option("-d, --days <number>", "Days to look back", "30")
  .action(async (opts: { days: string }) => {
    await showSessions(parseInt(opts.days, 10));
  });

program.parse();
