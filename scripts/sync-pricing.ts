/**
 * Sync model pricing from OpenRouter API into data.json.
 *
 * Usage:
 *   npx tsx scripts/sync-pricing.ts          # preview changes
 *   npx tsx scripts/sync-pricing.ts --write  # overwrite data.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPENROUTER_API = "https://openrouter.ai/api/v1/models";
const DATA_JSON = path.resolve(__dirname, "../src/pricing/data.json");

const PROVIDER_MAP: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  xai: "xai",
  mistralai: "mistral",
  deepseek: "deepseek",
  "meta-llama": "meta",
  cohere: "cohere",
  amazon: "amazon",
  qwen: "qwen",
};

const SKIP_PATTERNS = [
  ":free",
  ":extended",
  ":beta",
  ":nitro",
  ":floor",
  "online",
  "preview",
];

function shouldSkip(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return SKIP_PATTERNS.some((p) => lower.includes(p));
}

function normalizeModelName(modelId: string): string {
  let name = modelId.includes("/") ? modelId.split("/").slice(1).join("/") : modelId;
  const provider = modelId.includes("/") ? modelId.split("/")[0] : "";

  if (provider === "anthropic") {
    name = name.replace(/(\d)\.(\d)/g, "$1-$2");
  }

  return name;
}

interface ModelEntry {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
}

type ProviderPricing = Record<string, ModelEntry | Record<string, string>>;
type PricingData = Record<string, ProviderPricing>;

async function fetchOpenRouter(): Promise<unknown[]> {
  const resp = await fetch(OPENROUTER_API, {
    headers: { "User-Agent": "toktax-sync/1.0" },
  });
  const data = (await resp.json()) as { data: unknown[] };
  return data.data;
}

function buildPricing(models: unknown[]): PricingData {
  const pricing: PricingData = {};

  for (const m of models) {
    const model = m as Record<string, unknown>;
    const modelId = (model.id as string) ?? "";
    const rawProvider = modelId.includes("/") ? modelId.split("/")[0] : "";
    const provider = PROVIDER_MAP[rawProvider];
    if (!provider) continue;

    if (shouldSkip(modelId)) continue;

    const p = (model.pricing ?? {}) as Record<string, unknown>;
    const promptPrice = parseFloat(String(p.prompt ?? 0)) || 0;
    const completionPrice = parseFloat(String(p.completion ?? 0)) || 0;

    if (promptPrice === 0 && completionPrice === 0) continue;

    const inputPerM = Math.round(promptPrice * 1_000_000 * 10000) / 10000;
    const outputPerM = Math.round(completionPrice * 1_000_000 * 10000) / 10000;

    const modelName = normalizeModelName(modelId);
    const entry: ModelEntry = { input: inputPerM, output: outputPerM };

    pricing[provider] ??= {};
    pricing[provider][modelName] = entry;
  }

  return pricing;
}

function mergePricing(
  existing: PricingData,
  fetched: PricingData
): { merged: PricingData; changes: string[] } {
  const changes: string[] = [];

  for (const [provider, models] of Object.entries(fetched)) {
    if (!(provider in existing)) {
      existing[provider] = {};
      changes.push(`+ new provider: ${provider}`);
    }

    for (const [model, newData] of Object.entries(models)) {
      const oldData = existing[provider][model] as ModelEntry | undefined;
      if (!oldData) {
        existing[provider][model] = newData;
        const nd = newData as ModelEntry;
        changes.push(`+ ${provider}/${model}: $${nd.input}/$${nd.output}`);
      } else {
        const nd = newData as ModelEntry;
        for (const key of ["input", "output"] as const) {
          if (Math.abs((oldData[key] ?? 0) - nd[key]) > 0.001) {
            changes.push(
              `~ ${provider}/${model} ${key}: $${oldData[key] ?? 0} -> $${nd[key]}`
            );
            oldData[key] = nd[key];
          }
        }
      }
    }
  }

  return { merged: existing, changes };
}

async function main(): Promise<void> {
  const writeMode = process.argv.includes("--write");

  console.log(`Fetching models from ${OPENROUTER_API}...`);
  const models = await fetchOpenRouter();
  console.log(`  Got ${models.length} models`);

  const fetched = buildPricing(models);
  const totalFetched = Object.values(fetched).reduce(
    (s, v) => s + Object.keys(v).length,
    0
  );
  console.log(
    `  Matched ${totalFetched} models across ${Object.keys(fetched).length} providers`
  );

  const existing: PricingData = JSON.parse(fs.readFileSync(DATA_JSON, "utf-8"));
  const { merged, changes } = mergePricing(existing, fetched);

  if (changes.length === 0) {
    console.log("\nNo pricing changes detected.");
    return;
  }

  console.log(`\n${changes.length} changes:`);
  for (const c of changes.sort()) {
    console.log(`  ${c}`);
  }

  if (writeMode) {
    fs.writeFileSync(DATA_JSON, JSON.stringify(merged, null, 2) + "\n");
    console.log(`\nWritten to ${DATA_JSON}`);
  } else {
    console.log("\nDry run. Use --write to apply changes.");
  }
}

main().catch(console.error);
