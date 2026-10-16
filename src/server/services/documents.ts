import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { DocumentKind, ExtractionResult, FinanceDocument, ID } from "@/lib/types";
import { commit, db, uploadsDir } from "@/server/db/store";
import { newId } from "@/server/db/ids";
import { documentProvider } from "@/server/integrations/idp";
import { scoreDocumentMatch } from "@/server/engines/matching";
import { syntheticDocumentPdf } from "@/server/pdf";
import { recordAudit } from "./audit";
import { refreshInboxNotification } from "./notifications";
import { NotFoundError, ValidationError, getTxn, reprocessLive } from "./transactions";
import type { Ctx } from "@/server/auth/session";
import { diffDays } from "@/lib/dates";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "application/pdf": { ext: ".pdf", magic: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  "image/png": { ext: ".png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/jpeg": { ext: ".jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": { ext: ".webp", magic: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 },
};

function sniff(bytes: Uint8Array): string | undefined {
  return Object.entries(ALLOWED).find(([, v]) => v.magic(bytes))?.[0];
}

export function getDoc(ctx: Ctx, id: ID): FinanceDocument {
  const d = db().documents.find((x) => x.id === id && x.orgId === ctx.org.id);
  if (!d) throw new NotFoundError("Document not found");
  return d;
}

export function listDocuments(ctx: Ctx, f: { kind?: string; status?: string; q?: string } = {}) {
  const q = f.q?.toLowerCase();
  return db()
    .documents.filter((d) => d.orgId === ctx.org.id && (!f.kind || d.kind === f.kind) && (!f.status || d.status === f.status) && (!q || d.filename.toLowerCase().includes(q) || d.extraction?.vendor?.toLowerCase().includes(q) || d.extraction?.documentNumber?.toLowerCase().includes(q)))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

/** Validates (type by magic bytes, size), stores outside the web root and runs extraction + matching. */
export async function uploadDocument(ctx: Ctx, file: { name: string; bytes: Uint8Array; declaredType?: string; kindHint?: DocumentKind; tags?: string[] }) {
  if (!file.bytes.length) throw new ValidationError("The file is empty");
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new ValidationError("Files must be 15 MB or smaller");
  const mime = sniff(file.bytes);
  if (!mime) throw new ValidationError("Only PDF, PNG, JPEG and WebP files are supported");
  const id = newId("doc");
  const dir = path.join(uploadsDir(), ctx.org.id);
  fs.mkdirSync(dir, { recursive: true });
  const storageKey = `${ctx.org.id}/${id}${ALLOWED[mime]!.ext}`;
  fs.writeFileSync(path.join(uploadsDir(), storageKey), file.bytes);
  const safeName = file.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 140) || `upload${ALLOWED[mime]!.ext}`;
  const doc: FinanceDocument = { id, orgId: ctx.org.id, filename: safeName, mimeType: mime, size: file.bytes.length, storageKey, kind: file.kindHint ?? "other", status: "processing", tags: file.tags ?? [], uploadedBy: ctx.user.id, uploadedAt: new Date().toISOString() };
  db().documents.push(doc);
  recordAudit(ctx, { orgId: ctx.org.id, action: "document.uploaded", entity: { type: "document", id, label: safeName }, after: { size: doc.size, type: mime } });
  commit();
  await processDocument(doc, file.bytes);
  return doc;
}

const EXTRACTABLE: DocumentKind[] = ["invoice", "receipt", "bank_statement", "credit_card_statement"];

/** Document Agent: extraction via FabrikIDP (or the local extractor) followed by transaction matching. Queue-ready. */
export async function processDocument(doc: FinanceDocument, bytes: Uint8Array) {
  if (doc.kind !== "other" && !EXTRACTABLE.includes(doc.kind)) {
    doc.status = "uploaded";
    commit();
    return doc;
  }
  try {
    const { kind, extraction } = await documentProvider().extract(bytes, doc.mimeType, doc.filename);
    if (doc.kind === "other") doc.kind = kind;
    doc.extraction = extraction;
    const keyFields = ["total", "vendor"].filter((k) => (extraction.fieldConfidence[k] ?? 0) >= 0.8);
    doc.status = keyFields.length < 2 && (doc.kind === "invoice" || doc.kind === "receipt") ? "needs_review" : "extracted";
    recordAudit(null, { orgId: doc.orgId, action: "document.extracted", entity: { type: "document", id: doc.id, label: doc.filename }, after: { vendor: extraction.vendor, total: extraction.total, number: extraction.documentNumber, kind: doc.kind }, ai: { recommendation: `${doc.kind}${extraction.total != null ? ` · ${(extraction.total / 100).toFixed(2)}` : ""}`, confidence: Math.min(...Object.values(extraction.fieldConfidence), 1), model: extraction.provider, modelVersion: extraction.providerVersion } }, { type: "ai", id: "fabrik-idp", name: extraction.provider });
    findMatches(doc);
  } catch (e) {
    doc.status = "failed";
    doc.error = (e as Error).message;
    recordAudit(null, { orgId: doc.orgId, action: "document.extraction_failed", entity: { type: "document", id: doc.id, label: doc.filename }, after: { error: doc.error } }, { type: "system", id: "fabrik-idp", name: "FabrikIDP" });
  }
  commit();
  return doc;
}

export function findMatches(doc: FinanceDocument) {
  if (!doc.extraction || (doc.kind !== "invoice" && doc.kind !== "receipt")) return;
  const data = db();
  const linked = new Set(data.documents.filter((d) => d.match?.status === "confirmed").map((d) => d.match!.transactionId));
  const vendors = new Map(data.vendors.map((v) => [v.id, v.name]));
  const candidates = data.transactions
    .filter((t) => t.orgId === doc.orgId && t.amount < 0 && t.status !== "excluded" && !linked.has(t.id))
    .filter((t) => !doc.extraction!.documentDate || Math.abs(diffDays(t.date, doc.extraction!.documentDate)) <= 60)
    .map((t) => ({ t, s: scoreDocumentMatch(doc.extraction!, { date: t.date, amount: t.amount, description: t.description, vendorName: vendors.get(t.vendorId ?? "") }) }))
    .filter((x) => x.s.confidence >= 0.5)
    .sort((a, b) => b.s.confidence - a.s.confidence)
    .slice(0, 3);
  doc.match = { candidates: candidates.map((c) => ({ transactionId: c.t.id, confidence: c.s.confidence, reasons: c.s.reasons })), status: candidates.length ? "suggested" : "none" };
}

export function confirmMatch(ctx: Ctx, docId: ID, txnId: ID) {
  const doc = getDoc(ctx, docId);
  const t = getTxn(ctx, txnId);
  const cand = doc.match?.candidates.find((c) => c.transactionId === txnId);
  doc.match = { candidates: doc.match?.candidates ?? [], transactionId: t.id, status: "confirmed", confirmedBy: ctx.user.id, confirmedAt: new Date().toISOString() };
  doc.status = "matched";
  if (!t.documentIds.includes(doc.id)) t.documentIds.push(doc.id);
  if (t.ai) t.ai.documentMatch = { documentId: doc.id, confidence: cand?.confidence ?? 0.9 };
  recordAudit(ctx, { orgId: ctx.org.id, action: "document.matched", entity: { type: "transaction", id: t.id, label: t.ai?.normalizedVendor }, after: { document: doc.filename }, ai: cand ? { recommendation: `Match ${doc.filename}`, confidence: cand.confidence, model: "fabrik-matcher", modelVersion: "2026.10.1" } : undefined });
  for (const i of db().inbox.filter((x) => x.orgId === ctx.org.id && x.status === "open" && (x.type === "missing_document" || x.type === "missing_receipt") && x.related?.id === t.id)) {
    i.status = "resolved";
    i.resolvedAt = new Date().toISOString();
    i.response = { comment: `Matched ${doc.filename}`, userId: ctx.user.id, at: i.resolvedAt };
  }
  // A supporting document can clear the "document required" risk flag — re-run the agent on this item.
  const { autoProcessed } = reprocessLive(ctx, ctx.org.id, { ids: [t.id] });
  refreshInboxNotification(ctx.org.id);
  commit();
  return { doc, txn: t, autoProcessed: autoProcessed.length > 0 };
}

export function rejectMatch(ctx: Ctx, docId: ID, txnId: ID) {
  const doc = getDoc(ctx, docId);
  if (doc.match) doc.match.candidates = doc.match.candidates.filter((c) => c.transactionId !== txnId);
  if (doc.match && !doc.match.candidates.length) doc.match.status = "none";
  recordAudit(ctx, { orgId: ctx.org.id, action: "document.match_rejected", entity: { type: "document", id: doc.id, label: doc.filename }, after: { transactionId: txnId } });
  commit();
}

export function updateExtraction(ctx: Ctx, docId: ID, fields: Partial<Pick<ExtractionResult, "vendor" | "documentNumber" | "documentDate" | "dueDate" | "total" | "tax" | "subtotal">> & { kind?: DocumentKind }) {
  const doc = getDoc(ctx, docId);
  const before = { ...doc.extraction };
  doc.extraction = { lineItems: [], fieldConfidence: {}, provider: "manual", providerVersion: "-", extractedAt: new Date().toISOString(), warnings: [], ...doc.extraction, ...fields };
  for (const k of Object.keys(fields)) if (k !== "kind") doc.extraction.fieldConfidence[k] = 1;
  if (fields.kind) doc.kind = fields.kind;
  doc.status = "extracted";
  findMatches(doc);
  recordAudit(ctx, { orgId: ctx.org.id, action: "document.fields_corrected", entity: { type: "document", id: doc.id, label: doc.filename }, before, after: fields });
  commit();
  return doc;
}

export function createBillFromDocument(ctx: Ctx, docId: ID, accountId: ID) {
  const doc = getDoc(ctx, docId);
  const e = doc.extraction;
  if (!e?.total || !e.vendor) throw new ValidationError("Vendor and total are required to create a bill");
  const data = db();
  let vendor = data.vendors.find((v) => v.orgId === ctx.org.id && v.name.toLowerCase() === e.vendor!.toLowerCase());
  if (!vendor) {
    vendor = { id: newId("ven"), orgId: ctx.org.id, name: e.vendor, aliases: [e.vendor.toUpperCase()], createdAt: new Date().toISOString() };
    data.vendors.push(vendor);
  }
  const bill = { id: newId("bill"), orgId: ctx.org.id, vendorId: vendor.id, number: e.documentNumber ?? doc.filename, issueDate: e.documentDate ?? new Date().toISOString().slice(0, 10), dueDate: e.dueDate ?? e.documentDate ?? new Date().toISOString().slice(0, 10), amount: e.total, accountId, status: "needs_review" as const, source: "document" as const, documentId: doc.id, history: [{ userId: ctx.user.id, action: "received" as const, at: new Date().toISOString() }] };
  data.bills.push(bill);
  recordAudit(ctx, { orgId: ctx.org.id, action: "bill.created_from_document", entity: { type: "bill", id: bill.id, label: bill.number }, after: { amount: bill.amount, vendor: vendor.name } });
  commit();
  return bill;
}

export async function documentBytes(ctx: Ctx, docId: ID): Promise<{ bytes: Uint8Array; mime: string; filename: string; synthetic: boolean }> {
  const doc = getDoc(ctx, docId);
  if (doc.storageKey) {
    const p = path.join(uploadsDir(), doc.storageKey);
    if (fs.existsSync(p)) return { bytes: fs.readFileSync(p), mime: doc.mimeType, filename: doc.filename, synthetic: false };
  }
  return { bytes: await syntheticDocumentPdf(doc, ctx.org.legalName), mime: "application/pdf", filename: doc.filename.replace(/\.(jpe?g|png|webp)$/i, ".pdf"), synthetic: true };
}
