import { requireCtx, hasPerm } from "@/server/auth/session";
import { db } from "@/server/db/store";
import { listDocuments } from "@/server/services/documents";
import { accountName } from "@/server/services/transactions";
import { PageHeader, Badge } from "@/components/ui/primitives";
import { DocumentsView, type DocRow } from "@/components/documents/documents-view";
import { demoMode, showExtras } from "@/server/config";
import { prettyDateTime } from "@/lib/dates";

export const metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string; doc?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const data = db();
  const groups: Record<string, string[]> = { invoices: ["invoice"], receipts: ["receipt"], statements: ["bank_statement", "credit_card_statement"], records: ["entity_document", "farm_record", "other"] };
  const all = listDocuments(ctx, { q: sp.q });
  const docs = sp.kind && groups[sp.kind] ? all.filter((d) => groups[sp.kind!]!.includes(d.kind)) : all;
  const users = new Map(data.users.map((u) => [u.id, u.name]));
  const txns = new Map(data.transactions.filter((t) => t.orgId === ctx.org.id).map((t) => [t.id, t]));
  const rows: DocRow[] = docs.map((d) => {
    const matched = d.match?.transactionId ? txns.get(d.match.transactionId) : undefined;
    return {
      id: d.id,
      filename: d.filename,
      kind: d.kind,
      status: d.status,
      mimeType: d.mimeType,
      size: d.size,
      uploadedAt: prettyDateTime(d.uploadedAt),
      uploadedBy: d.uploadedBy === "qbo-sync" ? "QuickBooks attachment" : (users.get(d.uploadedBy) ?? "—"),
      tags: d.tags,
      error: d.error,
      synthetic: !d.storageKey,
      extraction: d.extraction ? { vendor: d.extraction.vendor, documentNumber: d.extraction.documentNumber, documentDate: d.extraction.documentDate, dueDate: d.extraction.dueDate, subtotal: d.extraction.subtotal, tax: d.extraction.tax, total: d.extraction.total, currency: d.extraction.currency, poNumber: d.extraction.poNumber, lineItems: d.extraction.lineItems, fieldConfidence: d.extraction.fieldConfidence, provider: d.extraction.provider, providerVersion: d.extraction.providerVersion, warnings: d.extraction.warnings } : undefined,
      matchStatus: d.match?.status ?? "none",
      matched: matched ? { id: matched.id, date: matched.date, description: matched.description, amount: matched.amount, vendor: matched.ai?.normalizedVendor ?? matched.description } : undefined,
      candidates: (d.match?.candidates ?? []).map((c) => {
        const t = txns.get(c.transactionId);
        return { transactionId: c.transactionId, confidence: c.confidence, reasons: c.reasons, date: t?.date ?? "", description: t?.description ?? "", amount: t?.amount ?? 0, vendor: t?.ai?.normalizedVendor ?? t?.description ?? "", category: accountName(t?.accountId ?? t?.ai?.accountId) };
      }),
      hasBill: data.bills.some((b) => b.documentId === d.id),
    };
  });
  const counts = Object.fromEntries(Object.entries(groups).map(([k, kinds]) => [k, all.filter((d) => kinds.includes(d.kind)).length]));
  const expenseAccounts = data.glAccounts.filter((a) => a.orgId === ctx.org.id && a.type === "expense").map((a) => ({ id: a.id, name: a.name }));
  return (
    <div>
      <PageHeader
        title="Documents"
        badge={<Badge tone="ai">FabrikIDP</Badge>}
      />
      <DocumentsView rows={rows} counts={{ all: all.length, ...counts }} kind={sp.kind} q={sp.q} openId={sp.doc} canUpload={hasPerm(ctx, "documents:upload")} canMatch={hasPerm(ctx, "documents:match")} demo={demoMode() && ctx.org.isDemo} extras={showExtras()} expenseAccounts={expenseAccounts} />
    </div>
  );
}
