import { authorize } from "@/server/auth/session";
import { buildReport, normalizeParams, reportXlsx } from "@/server/services/reports";
import { reportPdf } from "@/server/pdf";
import { recordAudit } from "@/server/services/audit";
import { commit } from "@/server/db/store";

export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await authorize("reports:export");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const format = sp.format === "xlsx" ? "xlsx" : "pdf";
  const p = normalizeParams(sp);
  const report = await buildReport(ctx.org.id, p);
  const base = `${ctx.org.name}_${report.title}_${report.subtitle}`.replace(/[^A-Za-z0-9-]+/g, "_").replace(/_+/g, "_");
  recordAudit(ctx, { orgId: ctx.org.id, action: "report.exported", entity: { type: "report", id: p.kind, label: report.title }, after: { format, subtitle: report.subtitle } });
  commit();
  if (format === "xlsx") {
    const buf = await reportXlsx(report, ctx.org.legalName);
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"`, "Cache-Control": "no-store" } });
  }
  const pdf = await reportPdf(report, ctx.org.legalName, new Date().toISOString());
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${base}.pdf"`, "Cache-Control": "no-store" } });
}
