import "server-only";
import type { AskAnswer } from "@/lib/ask-types";

/**
 * Model-agnostic LLM gateway (PRD §26 "AI: model-agnostic LLM gateway").
 *
 * Fabrik's finance answers are computed deterministically from the organization's data. An LLM is
 * optional and is only allowed to *rephrase* an already-grounded summary — never to introduce facts.
 * A guard rejects any rephrasing containing a number that isn't in the grounded answer.
 *
 * Providers: none (default, deterministic) or Anthropic (set ANTHROPIC_API_KEY). Adding another
 * provider means implementing `PhraseProvider`.
 */

interface PhraseProvider {
  readonly model: string;
  rephrase(answer: AskAnswer): Promise<string | null>;
}

const SYSTEM = [
  "You rewrite a finance assistant's answer for a farm business owner.",
  "Rewrite the provided SUMMARY in 1-3 plain, concise sentences.",
  "Use only facts present in SUMMARY or FACTS. Do not add, round, or compute any new numbers, dates, names or claims.",
  "Never state that the business qualifies for a program; keep words like 'potential' or 'possible' when present.",
  "Return only the rewritten text.",
].join(" ");

class AnthropicPhraser implements PhraseProvider {
  readonly model = process.env.FABRIK_LLM_MODEL || "claude-opus-5-5";

  async rephrase(answer: AskAnswer): Promise<string | null> {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ timeout: 12_000, maxRetries: 1 });
    const facts = [...(answer.bullets ?? []), ...(answer.metrics ?? []).map((m) => `${m.label}: ${m.value}`)].join("\n");
    try {
      const response = await client.beta.messages.create({
        model: this.model,
        max_tokens: 1024,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: SYSTEM,
        messages: [{ role: "user", content: `SUMMARY:\n${answer.summary}\n\nFACTS:\n${facts || "(none)"}` }],
      });
      if (response.stop_reason === "refusal") return null;
      const text = response.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return text || null;
    } catch (error) {
      if (error instanceof Anthropic.APIError) console.warn(`[ai] Anthropic API error ${error.status}: ${error.message}`);
      else console.warn(`[ai] Rephrase failed: ${(error as Error).message}`);
      return null;
    }
  }
}

function provider(): PhraseProvider | null {
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicPhraser();
  return null;
}

/** Every number in the rephrasing must already appear in the grounded answer. */
export function numbersGrounded(original: AskAnswer, text: string): boolean {
  const source = [original.summary, ...(original.bullets ?? []), ...(original.metrics ?? []).flatMap((m) => [m.label, m.value])].join(" ");
  const norm = (s: string) => s.replace(/[$,%×]/g, "");
  const allowed = new Set((norm(source).match(/\d+(?:\.\d+)?/g) ?? []).map(String));
  return (norm(text).match(/\d+(?:\.\d+)?/g) ?? []).every((n) => allowed.has(n));
}

export async function phrase(answer: AskAnswer): Promise<{ text: string; model: string } | null> {
  if (answer.refused || answer.grounding === "no_data") return null;
  const p = provider();
  if (!p) return null;
  const text = await p.rephrase(answer);
  if (!text || !numbersGrounded(answer, text)) return null;
  return { text, model: p.model };
}

export function aiStatus(): { provider: string; model: string } {
  const p = provider();
  return p ? { provider: "Anthropic", model: p.model } : { provider: "Fabrik deterministic engine", model: "fabrik-finance-router 2026.10" };
}
