export type AskModule = "books" | "bills" | "collect" | "funding" | "cfo" | "documents" | "reports";

export interface AskTable {
  caption?: string;
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, string>[];
  href?: string;
}

export interface AskSource {
  kind: "accounting" | "document" | "program" | "forecast" | "scenario" | "profile";
  label: string;
  detail?: string;
  href?: string;
}

/** A grounded answer: every number shown comes from a module query, never from free generation. */
export interface AskAnswer {
  intent: string;
  modules: AskModule[];
  summary: string;
  bullets?: string[];
  metrics?: { label: string; value: string; tone?: "positive" | "negative" | "neutral" }[];
  table?: AskTable;
  links?: { label: string; href: string }[];
  sources: AskSource[];
  followUps?: string[];
  refused?: boolean;
  grounding: "grounded" | "partial" | "no_data";
  /** Set when an optional LLM rephrased the grounded summary. */
  phrasedBy?: string;
}
