import "server-only";
import type { DocumentKind, ExtractionResult } from "@/lib/types";

/**
 * Document intelligence boundary (PRD §10 / Expo §9). FabrikIDP is the production extractor; when
 * FABRIKIDP_URL isn't configured, a local extractor reads text-based PDFs. Image OCR requires
 * FabrikIDP — images are accepted, then routed to manual field entry.
 */
export interface DocumentIntelligenceProvider {
  readonly name: string;
  readonly version: string;
  extract(bytes: Uint8Array, mimeType: string, filename: string): Promise<{ kind: DocumentKind; extraction: ExtractionResult }>;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function toISO(raw: string): string | undefined {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  }
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase());
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  }
  return undefined;
}

const DATE_RE = String.raw`(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})`;
const MONEY_RE = String.raw`\$?\s?(-?[\d,]+\.\d{2})`;
const cents = (s?: string) => (s ? Math.round(parseFloat(s.replace(/,/g, "")) * 100) : undefined);

/** Field extraction from document text lines. Exported for unit tests. */
export function parseDocumentText(lines: string[], provider: string, version: string): { kind: DocumentKind; extraction: ExtractionResult } {
  const text = lines.join("\n");
  const conf: Record<string, number> = {};
  const warnings: string[] = [];
  const find = (re: RegExp, key: string, c = 0.96) => {
    const m = text.match(re);
    if (m) conf[key] = c;
    return m;
  };
  const upper = text.toUpperCase();
  const kind: DocumentKind = /BEGINNING BALANCE|STATEMENT PERIOD|ACCOUNT STATEMENT/.test(upper)
    ? /CREDIT CARD|CARD ENDING|MINIMUM PAYMENT/.test(upper)
      ? "credit_card_statement"
      : "bank_statement"
    : /RECEIPT|THANK YOU FOR SHOPPING|CHANGE DUE/.test(upper) && !/INVOICE\s*(#|NO|NUMBER)/.test(upper)
      ? "receipt"
      : "invoice";

  const vendorLine = lines.find((l) => l.trim().length > 2 && !/^(INVOICE|RECEIPT|STATEMENT|PAGE)\b/i.test(l.trim()));
  if (vendorLine) conf.vendor = 0.9;
  const num = find(/(?:invoice|inv|receipt|document|order)\s*(?:#|no\.?|number)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,})/i, "documentNumber");
  const date = find(new RegExp(String.raw`(?:invoice date|date issued|issue date|receipt date|date)\s*[:\-]?\s*${DATE_RE}`, "i"), "documentDate");
  const due = find(new RegExp(String.raw`(?:due date|payment due|due)\s*[:\-]?\s*${DATE_RE}`, "i"), "dueDate");
  const po = find(/\bP\.?O\.?\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{2,})/i, "poNumber", 0.9);
  const subtotal = find(new RegExp(String.raw`sub\s*-?total\s*[:\-]?\s*${MONEY_RE}`, "i"), "subtotal");
  const tax = find(new RegExp(String.raw`(?:sales\s+)?tax(?:\s*\([^)]*\))?\s*[:\-]?\s*${MONEY_RE}`, "i"), "tax", 0.93);
  const totals = [...text.matchAll(new RegExp(String.raw`(?:^|\n)\s*(?:total due|amount due|balance due|invoice total|total)\s*[:\-]?\s*${MONEY_RE}`, "gi"))];
  const total = totals.at(-1)?.[1];
  if (total) conf.total = 0.97;
  else warnings.push("No total found");
  const currency = /\bCAD\b/.test(text) ? "CAD" : /\bEUR\b|€/.test(text) ? "EUR" : "USD";

  const lineItems: ExtractionResult["lineItems"] = [];
  for (const l of lines) {
    const m = l.match(/^(.{3,}?)\s{2,}(\d+(?:\.\d+)?)\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})\s*$/);
    if (m && !/total|tax/i.test(m[1]!)) lineItems.push({ description: m[1]!.trim(), quantity: Number(m[2]), unitPrice: cents(m[3]), amount: cents(m[4])! });
  }
  if (lineItems.length) conf.lineItems = 0.88;

  return {
    kind,
    extraction: {
      vendor: vendorLine?.trim(),
      documentNumber: num?.[1],
      documentDate: date ? toISO(date[1]!) : undefined,
      dueDate: due ? toISO(due[1]!) : undefined,
      subtotal: cents(subtotal?.[1]),
      tax: cents(tax?.[1]) ?? (subtotal && total ? cents(total)! - cents(subtotal[1])! : undefined),
      total: cents(total),
      currency,
      poNumber: po?.[1],
      lineItems,
      fieldConfidence: conf,
      provider,
      providerVersion: version,
      extractedAt: new Date().toISOString(),
      warnings,
    },
  };
}

class LocalTextExtractor implements DocumentIntelligenceProvider {
  readonly name = "Fabrik local extractor";
  readonly version = "local-2026.10";
  async extract(bytes: Uint8Array, mimeType: string) {
    if (mimeType !== "application/pdf") {
      return {
        kind: "receipt" as DocumentKind,
        extraction: { lineItems: [], fieldConfidence: {}, provider: this.name, providerVersion: this.version, extractedAt: new Date().toISOString(), warnings: ["Image OCR runs in FabrikIDP, which isn't configured in this environment. Enter the key fields below to continue."] },
      };
    }
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const lines: string[] = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 5); p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const rows = new Map<number, { x: number; s: string }[]>();
      for (const it of content.items as { str: string; transform: number[] }[]) {
        if (!it.str?.trim()) continue;
        const y = Math.round(it.transform[5]! / 3) * 3;
        (rows.get(y) ?? rows.set(y, []).get(y)!).push({ x: it.transform[4]!, s: it.str });
      }
      for (const y of [...rows.keys()].sort((a, b) => b - a)) lines.push(rows.get(y)!.sort((a, b) => a.x - b.x).map((r) => r.s).join("  "));
    }
    if (!lines.length) {
      return { kind: "invoice" as DocumentKind, extraction: { lineItems: [], fieldConfidence: {}, provider: this.name, providerVersion: this.version, extractedAt: new Date().toISOString(), warnings: ["This PDF has no text layer (scanned image). FabrikIDP OCR is required — enter the key fields below."] } };
    }
    return parseDocumentText(lines, this.name, this.version);
  }
}

class FabrikIdpHttp implements DocumentIntelligenceProvider {
  readonly name = "FabrikIDP";
  readonly version = "remote";
  async extract(bytes: Uint8Array, mimeType: string, filename: string) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);
    form.append("schema", "fabrik.finance.v1");
    const res = await fetch(`${process.env.FABRIKIDP_URL!.replace(/\/$/, "")}/v1/extract`, { method: "POST", headers: { Authorization: `Bearer ${process.env.FABRIKIDP_API_KEY ?? ""}` }, body: form });
    if (!res.ok) throw new Error(`FabrikIDP returned ${res.status}`);
    const json = (await res.json()) as { kind: DocumentKind; fields: Record<string, { value: string; confidence: number }>; line_items?: { description: string; quantity?: number; unit_price?: number; amount: number }[] };
    const f = json.fields;
    const fieldConfidence = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.confidence]));
    return {
      kind: json.kind,
      extraction: {
        vendor: f.vendor?.value,
        documentNumber: f.document_number?.value,
        documentDate: f.document_date?.value,
        dueDate: f.due_date?.value,
        subtotal: f.subtotal ? Math.round(Number(f.subtotal.value) * 100) : undefined,
        tax: f.tax ? Math.round(Number(f.tax.value) * 100) : undefined,
        total: f.total ? Math.round(Number(f.total.value) * 100) : undefined,
        currency: f.currency?.value ?? "USD",
        poNumber: f.po_number?.value,
        lineItems: (json.line_items ?? []).map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unit_price ? Math.round(l.unit_price * 100) : undefined, amount: Math.round(l.amount * 100) })),
        fieldConfidence,
        provider: this.name,
        providerVersion: res.headers.get("x-model-version") ?? this.version,
        extractedAt: new Date().toISOString(),
        warnings: [],
      },
    };
  }
}

export function documentProvider(): DocumentIntelligenceProvider {
  return process.env.FABRIKIDP_URL ? new FabrikIdpHttp() : new LocalTextExtractor();
}
