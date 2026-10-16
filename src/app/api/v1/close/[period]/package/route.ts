import { authorize } from "@/server/auth/session";
import { financePackage } from "@/server/services/package";
import { packagePdf } from "@/server/pdf";
import { money } from "@/lib/format";
import { prettyDate } from "@/lib/dates";

export async function GET(_: Request, { params }: { params: Promise<{ period: string }> }) {
  let ctx;
  try {
    ctx = await authorize("reports:export");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const { period } = await params;
  if (!/^\d{4}-\d{2}$/.test(period)) return new Response("Bad period", { status: 400 });
  const pkg = await financePackage(ctx.org.id, period);
  const pdf = await packagePdf(
    pkg.title,
    ctx.org.legalName,
    [
      { heading: "Executive summary", paragraphs: [pkg.status === "closed" ? "Books for this period are closed and reviewed." : "DRAFT - books for this period are not closed yet; figures may change."], bullets: pkg.observations },
      { heading: "Revenue & expense trend", table: { columns: ["Month", "Revenue", "Expenses", "Net income"], rows: pkg.trend.map((t) => [t.label, money(t.revenue), money(t.expenses), money(t.net)]) } },
      { heading: "Major expense changes", table: { columns: ["Account", "Prior month", "This month", "Change"], rows: pkg.changes.map((c) => [c.name, money(c.prev), money(c.cur), money(c.delta, { sign: true })]) } },
      { heading: "Notable transactions", table: { columns: ["Date", "Payee", "Category", "Amount"], rows: pkg.largest.map((t) => [prettyDate(t.date), t.vendor, t.account, money(t.amount, { decimals: true })]) } },
    ],
    pkg.reports,
  );
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${ctx.org.name.replace(/\W+/g, "_")}_Finance_Package_${period}.pdf"`, "Cache-Control": "no-store" } });
}
