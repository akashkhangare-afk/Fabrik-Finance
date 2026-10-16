import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, CircleX, ExternalLink, FileText, Info } from "lucide-react";
import { requireCtx } from "@/server/auth/session";
import { programDetail } from "@/server/services/funding";
import { sourceKind } from "@/content/funding";
import { MATCH_LABELS } from "@/server/engines/funding-match";
import { Badge, Card, CardHeader, DescList, Notice, PageHeader, ProgressRing } from "@/components/ui/primitives";
import { FundingActions } from "@/components/funding/funding-actions";
import { LEVEL_TONE, TYPE_LABEL } from "@/components/funding/meta";
import { prettyDate } from "@/lib/dates";
import { periodLabel } from "@/server/services/close";

export const metadata = { title: "Funding opportunity" };

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  let d;
  try {
    d = programDetail(ctx.org.id, id);
  } catch {
    notFound();
  }
  const { program: p, match: m, readiness: r } = d;
  const List = ({ items, kind }: { items: string[]; kind: "ok" | "todo" | "no" }) => (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5 text-[13.5px]">
          {kind === "ok" ? <CheckCircle2 className="size-4 text-ok-600 mt-0.5 shrink-0" /> : kind === "todo" ? <Circle className="size-4 text-warn-500 mt-0.5 shrink-0" /> : <CircleX className="size-4 text-risk-600 mt-0.5 shrink-0" />}
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="max-w-[1100px]">
      <PageHeader
        eyebrow={<Link href="/funding" className="hover:underline">← Funding · {p.agency}</Link>}
        title={p.name}
        badge={<Badge>{TYPE_LABEL[p.programType]}</Badge>}
        description={p.description}
      />
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6">
        <div className="space-y-5 min-w-0">
          <Card className="p-5">
            <div className="flex items-center gap-5">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Match score</div>
                <div className="text-[34px] font-semibold tabular leading-tight">{m.score}%</div>
              </div>
              <div className="flex-1">
                <Badge tone={LEVEL_TONE[m.level]} dot className="text-[13px] h-7 px-3">{MATCH_LABELS[m.level]}</Badge>
                <p className="text-[13.5px] text-ink-2 mt-2">{m.explanation}</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Why Fabrik identified this" subtitle="Criteria checked against your farm/business profile" />
            <div className="px-5 pb-5 grid sm:grid-cols-2 gap-6">
              <div>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted mb-2.5">Known qualifying factors</h3>
                {m.qualifying.length ? <List items={m.qualifying} kind="ok" /> : <p className="text-[13px] text-muted">None yet.</p>}
              </div>
              <div className="space-y-5">
                {m.missing.length > 0 && (
                  <div>
                    <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted mb-2.5">Information required</h3>
                    <List items={m.missing} kind="todo" />
                  </div>
                )}
                {m.disqualifiers.length > 0 && (
                  <div>
                    <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted mb-2.5">Potential disqualifiers</h3>
                    <List items={m.disqualifiers} kind="no" />
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Application readiness" subtitle="What you'd need to apply — Fabrik doesn't submit applications" action={<ProgressRing value={r.pct / 100} size={52} stroke={5} />} />
            <ul className="px-5 pb-4">
              {r.items.map((i) => (
                <li key={i.key} className="flex items-start gap-3 py-2.5 border-t border-line first:border-0">
                  {i.done ? <CheckCircle2 className="size-4.5 text-ok-600 mt-0.5 shrink-0" /> : <Circle className="size-4.5 text-line-strong mt-0.5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium">{i.label}</div>
                    <div className="text-[12.5px] text-muted">{i.detail}</div>
                  </div>
                  {!i.done && i.href && (i.href.startsWith("http") ? <a href={i.href} target="_blank" rel="noreferrer noopener" className="text-[12.5px] text-brand-700 hover:underline shrink-0">Agency forms</a> : <Link href={i.href} className="text-[12.5px] text-brand-700 hover:underline shrink-0">Complete</Link>)}
                </li>
              ))}
            </ul>
            <div className="px-5 py-3 border-t border-line text-[13px] font-semibold">{r.pct}% ready</div>
          </Card>

          <Card>
            <CardHeader title="Documents available" subtitle="Generated from your books or already in Documents" />
            <ul className="px-5 pb-5 space-y-2">
              {d.booksClosedThrough && ["Profit & Loss", "Balance Sheet", "Statement of Cash Flows"].map((t) => (
                <li key={t} className="flex items-center gap-2.5 text-[13.5px]"><CheckCircle2 className="size-4 text-ok-600" /> {t} <span className="text-muted text-[12px]">· from closed books through {periodLabel(d.booksClosedThrough!)}</span></li>
              ))}
              {d.documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-2.5 text-[13.5px]">
                  <CheckCircle2 className="size-4 text-ok-600" />
                  <a href={`/api/v1/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="hover:underline inline-flex items-center gap-1.5"><FileText className="size-3.5 text-muted" />{doc.filename.replace(/_/g, " ")}</a>
                </li>
              ))}
              {!d.documents.some((x) => x.tags.includes("funding:fsa-farm-records")) && <li className="flex items-center gap-2.5 text-[13.5px] text-muted"><Circle className="size-4 text-line-strong" /> Additional farm information (FSA farm records)</li>}
            </ul>
          </Card>
        </div>

        <div className="space-y-5 min-w-0">
          <Card className="p-5">
            <FundingActions programId={p.id} status={d.watch?.status} />
            <a href={p.officialSourceUrl} target="_blank" rel="noreferrer noopener" className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5 hover:bg-surface-2">
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">Official source</span>
                <span className="block text-[11.5px] text-muted truncate">{p.officialSourceUrl.replace(/^https?:\/\//, "")}</span>
              </span>
              <ExternalLink className="size-4 text-muted shrink-0" />
            </a>
            <div className="mt-2 text-[11.5px] text-muted">{p.lastVerified ? `Last verified ${prettyDate(p.lastVerified, { year: true })}` : "Not yet verified"} · {sourceKind(p.officialSourceUrl)}</div>
          </Card>
          <Card>
            <CardHeader title="Program details" />
            <div className="px-5 pb-5">
              <DescList
                items={[
                  ["Agency", p.agency],
                  ["Program type", TYPE_LABEL[p.programType]],
                  ["Geography", p.geography],
                  ["Funding / loan range", p.fundingRange ? <span>{p.fundingRange}{p.fundingRangeSource && p.fundingRangeSource !== p.officialSourceUrl && <a href={p.fundingRangeSource} target="_blank" rel="noreferrer noopener" className="text-brand-700 hover:underline ml-1">(source)</a>}</span> : "Not specified by the agency"],
                  ["Deadline", p.deadline ?? "Not stated"],
                  ["Eligible entities", p.eligibleEntities.join(" · ")],
                ]}
              />
            </div>
          </Card>
          {[["Eligible activities", p.eligibleActivities], ["Financial criteria", p.financialCriteria], ["Agricultural criteria", p.agriculturalCriteria], ["Required documents", p.requiredDocuments]].filter(([, xs]) => (xs as string[]).length).map(([title, xs]) => (
            <Card key={title as string}>
              <CardHeader title={title as string} />
              <ul className="px-5 pb-4 space-y-1.5 text-[13px] text-ink-2 list-disc pl-9">
                {(xs as string[]).map((x) => <li key={x}>{x}</li>)}
              </ul>
            </Card>
          ))}
          <Notice tone="neutral" icon={<Info className="size-4" />} title="Verification notes">{p.verificationNotes}</Notice>
        </div>
      </div>
    </div>
  );
}
