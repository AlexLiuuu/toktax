import pricingData from "./data.json";

interface ModelPricing {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
}

type ProviderData = Record<string, ModelPricing | Record<string, string>> & {
  _aliases?: Record<string, string>;
};

const MODEL_PREFIX_TO_PROVIDER: Record<string, string> = {
  claude: "anthropic",
  "gpt-": "openai",
  o1: "openai",
  o3: "openai",
  o4: "openai",
  grok: "xai",
  gemini: "google",
  gemma: "google",
  deepseek: "deepseek",
  llama: "meta",
  mistral: "mistral",
  codestral: "mistral",
  ministral: "mistral",
  command: "cohere",
  "nova-": "amazon",
  qwen: "qwen",
};

export class PricingCalculator {
  private pricing: Record<string, ProviderData>;

  constructor() {
    this.pricing = pricingData as Record<string, ProviderData>;
  }

  guessProvider(model: string): string | null {
    const lower = model.toLowerCase();
    for (const [prefix, provider] of Object.entries(MODEL_PREFIX_TO_PROVIDER)) {
      if (lower.startsWith(prefix)) {
        return provider;
      }
    }
    return null;
  }

  calculate(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens = 0,
    cacheWriteTokens = 0
  ): number | null {
    const providerData = this.pricing[provider];
    if (!providerData) return null;

    const modelData = this.resolveModel(providerData, model);
    if (!modelData) return null;

    let cost =
      (inputTokens * modelData.input) / 1_000_000 +
      (outputTokens * modelData.output) / 1_000_000;

    if (cacheReadTokens && modelData.cache_read != null) {
      cost += (cacheReadTokens * modelData.cache_read) / 1_000_000;
    }
    if (cacheWriteTokens && modelData.cache_write != null) {
      cost += (cacheWriteTokens * modelData.cache_write) / 1_000_000;
    }

    return cost;
  }

  private resolveModel(
    providerData: ProviderData,
    model: string
  ): ModelPricing | null {
    if (model !== "_aliases" && model in providerData) {
      const entry = providerData[model];
      if (entry && "input" in entry) return entry as ModelPricing;
    }

    const aliases = providerData._aliases ?? {};

    if (model in aliases) {
      const target = aliases[model];
      const entry = providerData[target];
      if (entry && "input" in entry) return entry as ModelPricing;
    }

    let bestKey: string | null = null;
    let bestLen = 0;

    for (const key of Object.keys(providerData)) {
      if (key === "_aliases") continue;
      if (model.startsWith(key) && key.length > bestLen) {
        bestKey = key;
        bestLen = key.length;
      }
    }

    if (bestKey) {
      const entry = providerData[bestKey];
      if (entry && "input" in entry) return entry as ModelPricing;
    }

    for (const [alias, target] of Object.entries(aliases)) {
      if (model.startsWith(alias) && alias.length > bestLen) {
        bestKey = target;
        bestLen = alias.length;
      }
    }

    if (bestKey) {
      const entry = providerData[bestKey];
      if (entry && "input" in entry) return entry as ModelPricing;
    }

    return null;
  }
}
