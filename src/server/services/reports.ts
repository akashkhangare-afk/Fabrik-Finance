import "server-only";
import type { ID } from "@/lib/types";
import { accountingProvider } from "@/server/integrations/accounting";
import type { FinancialReport, ReportColumn } from "@/server/engines/ledger";
import { addMonths, monthEnd, monthLabel, periodOf, quarterRange, today } from "@/lib/dates";

export type ReportKind = "pnl" | "balance_sheet" | "cash_flow";
export type PnlView = "monthly" | "quarterly" | "annual";

export interface ReportParams {
  kind: ReportKind;
  view?: PnlView;
  year?: number;
  asOf?: string;
  from?: string;
  to?: string;
}

export function normalizeParams(p: Partial<Record<string, string>>): ReportParams {
  const d = today();
  const kind = (["pnl", "balance_sheet", "cash_flow"].includes(p.kind ?? "") ? p.kind : "pnl") as ReportKind;
  const year = Number(p.year) >= 2025 && Number(p.year) <= Number(d.slice(0, 4)) ? Number(p.year) : Number(d.slice(0, 4));
  const iso = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  return { kind, view: (["monthly", "quarterly", "annual"].includes(p.view ?? "") ? p.view : "monthly") as PnlView, year, asOf: iso(p.asOf) ?? d, from: iso(p.from) ?? `${d.slice(0, 4)}-01-01`, to: iso(p.to) ?? d };
}

export function pnlColumns(view: PnlView, year: number): ReportColumn[] {
  const d = today();
  const cap = (to: string) => (to > d ? d : to);
  if (view === "annual") return [year - 1, year].map((y) => ({ label: y === Number(d.slice(0, 4)) ? `${y} YTD` : String(y), from: `${y}-01-01`, to: cap(`${y}-12-31`) }));
  if (view === "quarterly")
    return [1, 2, 3, 4]
      .map((q) => ({ q, ...quarterRange(year, q) }))
      .filter((r) => r.from <= d)
      .map((r) => ({ label: `Q${r.q} ${year}`, from: r.from, to: cap(r.to) }));
  const last = Number(d.slice(0, 4)) === year ? periodOf(d) : `${year}-12`;
  const cols: ReportColumn[] = [];
  for (let p = `${year}-01`; p <= last; p = addMonths(p, 1)) cols.push({ label: monthLabel(p), from: `${p}-01`, to: cap(monthEnd(p)) });
  return cols;
}

export async function buildReport(orgId: ID, p: ReportParams): Promise<FinancialReport> {
  const provider = accountingProvider(orgId);
  if (p.kind === "balance_sheet") return provider.balanceSheet(orgId, p.asOf!);
  if (p.kind === "cash_flow") return provider.cashFlow(orgId, p.from!, p.to!);
  return provider.profitAndLoss(orgId, pnlColumns(p.view!, p.year!), { includeTotal: true });
}

export async function reportXlsx(report: FinancialReport, orgName: string): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fabrik Finance";
  wb.created = new Date();
  const ws = wb.addWorksheet(report.title.slice(0, 30));
  ws.addRow([orgName]).font = { bold: true, size: 12 };
  ws.addRow([report.title]).font = { bold: true, size: 16, color: { argb: "FF1F6B4A" } };
  ws.addRow([`${report.subtitle} · ${report.basis === "accrual" ? "Accrual basis" : "Cash basis"} · Source: QuickBooks Online`]).font = { italic: true, color: { argb: "FF646B66" } };
  ws.addRow([]);
  const header = ws.addRow(["", ...report.columns.map((c) => c.label)]);
  header.font = { bold: true };
  header.eachCell((c) => (c.border = { bottom: { style: "thin", color: { argb: "FFD4D3CB" } } }));
  for (const l of report.lines) {
    if (l.kind === "spacer") {
      ws.addRow([]);
      continue;
    }
    const row = ws.addRow([`${"   ".repeat(l.depth)}${l.label}`, ...(l.kind === "header" ? [] : l.values.map((v) => v / 100))]);
    if (l.kind !== "account") row.font = { bold: true };
    if (l.kind === "grand") row.eachCell((c) => (c.border = { top: { style: "thin" }, bottom: { style: "double" } }));
  }
  ws.getColumn(1).width = 48;
  for (let i = 2; i <= report.columns.length + 1; i++) {
    ws.getColumn(i).width = 14;
    ws.getColumn(i).numFmt = '#,##0.00;[Red](#,##0.00);"-"';
  }
  ws.views = [{ state: "frozen", ySplit: 5, xSplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
