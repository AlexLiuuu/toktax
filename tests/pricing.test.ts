import { describe, it, expect } from "vitest";
import { PricingCalculator } from "../src/pricing/calculator.js";

function calc() {
  return new PricingCalculator();
}

describe("direct match", () => {
  it("known model", () => {
    const cost = calc().calculate("anthropic", "claude-opus-4", 1_000_000, 1_000_000);
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(15.0 + 75.0, 2);
  });

  it("new opus pricing", () => {
    const cost = calc().calculate("anthropic", "claude-opus-4-6", 1_000_000, 1_000_000);
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(5.0 + 25.0, 2);
  });

  it("with cache", () => {
    const cost = calc().calculate(
      "anthropic", "claude-opus-4",
      1_000_000, 1_000_000, 1_000_000, 1_000_000
    );
    const expected = 15.0 + 75.0 + 1.5 + 18.75;
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(expected, 2);
  });

  it("new cache pricing", () => {
    const cost = calc().calculate(
      "anthropic", "claude-opus-4-7",
      1_000_000, 1_000_000, 1_000_000, 1_000_000
    );
    const expected = 5.0 + 25.0 + 0.5 + 6.25;
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(expected, 2);
  });

  it("openai model", () => {
    const cost = calc().calculate("openai", "gpt-4o", 1_000_000, 1_000_000);
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(2.5 + 10.0, 2);
  });

  it("zero tokens", () => {
    const cost = calc().calculate("anthropic", "claude-opus-4", 0, 0);
    expect(cost).toBe(0.0);
  });
});

describe("alias match", () => {
  it("dated alias", () => {
    const cost = calc().calculate("anthropic", "claude-3-5-sonnet-20241022", 1_000_000, 0);
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(3.0, 2);
  });

  it("latest alias", () => {
    const cost = calc().calculate("anthropic", "claude-3-5-sonnet-latest", 1_000_000, 0);
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(3.0, 2);
  });
});

describe("prefix match", () => {
  it("versioned model", () => {
    const cost = calc().calculate("anthropic", "claude-opus-4-6", 1_000_000, 0);
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(5.0, 2);
  });

  it("haiku with date", () => {
    const cost = calc().calculate("anthropic", "claude-haiku-4-5-20251001", 1_000_000, 0);
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(1.0, 2);
  });
});

describe("unknown model", () => {
  it("unknown provider", () => {
    const cost = calc().calculate("unknown-provider", "some-model", 1_000_000, 1_000_000);
    expect(cost).toBeNull();
  });

  it("unknown model", () => {
    const cost = calc().calculate("anthropic", "claude-nonexistent-99", 1_000_000, 1_000_000);
    expect(cost).toBeNull();
  });
});

describe("multi provider", () => {
  it("google", () => {
    const cost = calc().calculate("google", "gemini-2.5-pro", 1_000_000, 1_000_000);
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(1.25 + 10.0, 2);
  });

  it("deepseek with cache", () => {
    const cost = calc().calculate(
      "deepseek", "deepseek-chat",
      1_000_000, 1_000_000, 1_000_000
    );
    const expected = 0.32 + 0.89 + 0.07;
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(expected, 2);
  });

  it("xai grok", () => {
    const cost = calc().calculate("xai", "grok-4", 1_000_000, 1_000_000);
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(3.0 + 15.0, 2);
  });

  it("qwen", () => {
    const cost = calc().calculate("qwen", "qwen-max", 1_000_000, 1_000_000);
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(1.04 + 4.16, 2);
  });

  it("openai gpt-5.4", () => {
    const cost = calc().calculate("openai", "gpt-5.4", 1_000_000, 1_000_000);
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(2.5 + 15.0, 2);
  });

  it("google gemini-3.5-flash", () => {
    const cost = calc().calculate("google", "gemini-3.5-flash", 1_000_000, 1_000_000);
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(1.5 + 9.0, 2);
  });
});

describe("guess provider", () => {
  it("claude", () => {
    expect(calc().guessProvider("claude-opus-4-6")).toBe("anthropic");
  });

  it("gpt", () => {
    expect(calc().guessProvider("gpt-5.5")).toBe("openai");
  });

  it("grok", () => {
    expect(calc().guessProvider("grok-4")).toBe("xai");
  });

  it("gemini", () => {
    expect(calc().guessProvider("gemini-2.5-pro")).toBe("google");
  });

  it("deepseek", () => {
    expect(calc().guessProvider("deepseek-chat")).toBe("deepseek");
  });

  it("llama", () => {
    expect(calc().guessProvider("llama-4-maverick")).toBe("meta");
  });

  it("qwen", () => {
    expect(calc().guessProvider("qwen-max")).toBe("qwen");
  });

  it("unknown", () => {
    expect(calc().guessProvider("totally-unknown-model")).toBeNull();
  });
});
