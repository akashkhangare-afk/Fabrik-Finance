import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/session";
import { showExtras } from "@/server/config";
import { REQUIREMENTS, CONFLICTS, type Requirement } from "@/content/requirements";
import { Badge, Card, CardHeader, ClassBadge, EmptyState, PageHeader, type Tone } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export const metadata = { title: "Requirements matrix" };

const STATUS_TONE: Record<Requirement["status"], Tone> = { Implemented: "ok", "Implemented (synthetic integration)": "brand", Partial: "warn", "Designed, not built": "info", "Not in scope": "neutral" };

export default async function RequirementsPage({ searchParams }: { searchParams: Promise<{ cls?: string; status?: string; area?: string; q?: string }> }) {
  if (!showExtras()) notFound();
  const ctx = await requireCtx();
  if (!ctx.isStaff) return <EmptyState title="Fabrik staff only" description="The requirements matrix is an internal planning view." />;
  const sp = await searchParams;
  const q = sp.q?.toLowerCase();
  const rows = REQUIREMENTS.filter((r) => (!sp.cls || r.classification === sp.cls) && (!sp.status || r.status === sp.status) && (!sp.area || r.area === sp.area) && (!q || `${r.id} ${r.title} ${r.description} ${r.source}`.toLowerCase().includes(q)));
  const areas = [...new Set(REQUIREMENTS.map((r) => r.area))];
  const count = (f: (r: Requirement) => boolean) => REQUIREMENTS.filter(f).length;
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/ops/requirements${p.size ? `?${p}` : ""}`;
  };
  return (
    <div>
      <PageHeader
        title="Requirements matrix"
        description="Every requirement traced to its source, with classification and implementation status. A = PRD-confirmed · B = proposed Fondo-inspired addition · C = future or restricted."
        actions={<span className="text-[12.5px] text-muted">Exported to <code className="font-mono">docs/REQUIREMENTS_MATRIX.md</code> via npm run docs:requirements</span>}
      />
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          ["Requirements", REQUIREMENTS.length],
          ["A · PRD-confirmed", count((r) => r.classification === "A")],
          ["B · Proposed", count((r) => r.classification === "B")],
          ["C · Future / restricted", count((r) => r.classification === "C")],
          ["Implemented", count((r) => r.status.startsWith("Implemented"))],
        ].map(([l, n]) => (
          <Card key={l as string} className="px-4 py-3">
            <div className="text-[12.5px] text-muted">{l as string}</div>
            <div className="text-[22px] font-semibold tabular">{n as number}</div>
          </Card>
        ))}
      </section>
      <div className="flex flex-wrap gap-2 mb-4 text-[13px]">
        {[undefined, "A", "B", "C"].map((c) => (
          <Link key={c ?? "all"} href={link({ cls: c })} className={cn("h-8 px-3 rounded-lg inline-flex items-center font-medium", sp.cls === c ? "bg-ink text-white" : "text-ink-2 hover:bg-sunken")}>{c ? `Class ${c}` : "All classes"}</Link>
        ))}
        <span className="w-px bg-line mx-1" />
        {[undefined, "Implemented", "Implemented (synthetic integration)", "Partial", "Designed, not built", "Not in scope"].map((s) => (
          <Link key={s ?? "any"} href={link({ status: s })} className={cn("h-8 px-3 rounded-lg inline-flex items-center font-medium", sp.status === s ? "bg-ink text-white" : "text-ink-2 hover:bg-sunken")}>{s ?? "Any status"}</Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {areas.map((a) => (
          <Link key={a} href={link({ area: sp.area === a ? undefined : a })} className={cn("text-[12px] h-7 px-2.5 rounded-md inline-flex items-center border", sp.area === a ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line text-ink-2 hover:bg-surface-2")}>{a}</Link>
        ))}
      </div>
      <Card className="overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11.5px] text-muted text-left bg-surface-2 border-b border-line whitespace-nowrap">
                {["ID", "Requirement", "Source", "Persona / screen", "Data & dependencies", "Acceptance criteria", "Priority", "Status", "Class"].map((h) => <th key={h} className="px-3 py-2.5 font-medium first:pl-5">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 align-top hover:bg-surface-2">
                  <td className="pl-5 pr-3 py-3 font-mono text-[11.5px] whitespace-nowrap">{r.id}</td>
                  <td className="px-3 py-3 min-w-[260px]">
                    <div className="font-semibold text-[13px]">{r.title}</div>
                    <div className="text-ink-2 mt-0.5">{r.description}</div>
                    {r.notes && <div className="text-muted mt-1 italic">{r.notes}</div>}
                  </td>
                  <td className="px-3 py-3 text-muted min-w-[140px]">{r.source}</td>
                  <td className="px-3 py-3 min-w-[150px]"><div>{r.persona}</div><div className="text-muted font-mono text-[11px] mt-0.5">{r.screen}</div></td>
                  <td className="px-3 py-3 min-w-[150px]"><div>{r.data}</div><div className="text-muted mt-0.5">{r.dependencies}</div></td>
                  <td className="px-3 py-3 min-w-[220px] text-ink-2">{r.acceptance}</td>
                  <td className="px-3 py-3 whitespace-nowrap"><Badge>{r.priority}</Badge></td>
                  <td className="px-3 py-3"><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                  <td className="px-3 py-3"><ClassBadge cls={r.classification} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHeader title="Documented conflicts" subtitle="Where sources disagree, the Expo MVP governs the first release — nothing was resolved silently" />
        <ul className="px-5 pb-5">
          {CONFLICTS.map((c) => (
            <li key={c.id} className="py-3 border-t border-line first:border-0 text-[13px]">
              <div className="font-semibold"><span className="font-mono text-[12px] text-muted mr-2">{c.id}</span>{c.title}</div>
              <div className="text-ink-2 mt-0.5">{c.detail}</div>
              <div className="text-brand-800 mt-1">→ {c.resolution}</div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
