import Link from "next/link";
import { ArrowRight, CalendarClock, ExternalLink, ShieldCheck } from "lucide-react";
import { requireCtx } from "@/server/auth/session";
import { fundingMatches, fundingSummary, getProfile, profileCompleteness } from "@/server/services/funding";
import { MATCH_LABELS, type MatchLevel } from "@/server/engines/funding-match";
import { Badge, Card, Notice, PageHeader, type Tone } from "@/components/ui/primitives";
import { prettyDate } from "@/lib/dates";
import { LEVEL_TONE, TYPE_LABEL } from "@/components/funding/meta";
import { cn } from "@/lib/cn";
import { showExtras } from "@/server/config";

export const metadata = { title: "Funding" };

export default async function FundingPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const matches = fundingMatches(ctx.org.id);
  const s = fundingSummary(ctx.org.id);
  const profile = getProfile(ctx.org.id);
  const comp = profileCompleteness(profile);
  const visible = sp.show === "all" ? matches : matches.filter((m) => m.match.level !== "unlikely" && m.watch?.status !== "dismissed");
  const groups: MatchLevel[] = ["high", "possible", "more_info", "unlikely"];
  const extras = showExtras();
  return (
    <div>
      <PageHeader title="Potential funding opportunities" />
      <div className="space-y-3 mb-6">
        <Card className="p-5">
          <div className="text-[13px] text-muted">Potential opportunities</div>
          <div className="text-[30px] font-semibold tracking-[-0.02em] mt-0.5">{s.identified} programs identified</div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[["High potential", s.high, "ok"], ["Possible", s.possible, "info"], ["More info required", s.moreInfo, "warn"]].map(([l, n, t]) => (
              <div key={l as string} className="rounded-xl border border-line px-3 py-2.5">
                <Badge tone={t as Tone} dot>{l as string}</Badge>
                <div className="text-[22px] font-semibold tabular mt-1">{n as number}</div>
              </div>
            ))}
          </div>
        </Card>
        <Link href="/funding/profile" className="flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">Farm / business profile {comp.pct}% complete · <span className="text-brand-700 font-medium">Review</span> <ArrowRight className="size-3.5 text-brand-700" /></Link>
      </div>

      <Notice tone="info" icon={<ShieldCheck className="size-4" />} className="mb-6">Potential matches only — the administering agency or lender confirms eligibility.</Notice>

      {groups.map((g) => {
        const list = visible.filter((m) => m.match.level === g);
        if (!list.length) return null;
        return (
          <section key={g} className="mb-7">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted mb-3">{MATCH_LABELS[g]} · {list.length}</h2>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {list.map(({ program: p, match: m, watch }) => (
                <Link key={p.id} href={`/funding/${p.id}`} className={cn("bg-surface border border-line rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 flex flex-col transition-[border-color,box-shadow,transform] duration-200 hover:border-line-strong hover:shadow-[var(--shadow-raised)] hover:-translate-y-0.5", g === "unlikely" && "opacity-75")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{p.agency}</div>
                    <div className="text-right shrink-0">
                      <div className="text-[20px] font-semibold tabular leading-none">{m.score}%</div>
                      <div className="text-[11px] text-muted mt-1">match score</div>
                    </div>
                  </div>
                  <h3 className="text-[15px] font-semibold leading-snug mt-0.5">{p.name}</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={LEVEL_TONE[m.level]} dot>{MATCH_LABELS[m.level]}</Badge>
                    <Badge>{TYPE_LABEL[p.programType]}</Badge>
                    {extras && watch && watch.status !== "dismissed" && <Badge tone="brand">{watch.status.replace(/_/g, " ")}</Badge>}
                  </div>
                  {p.deadline && <p className="mt-3 text-[12px] text-muted flex gap-1.5"><CalendarClock className="size-3.5 mt-0.5 shrink-0" /><span className="line-clamp-2">{p.deadline}</span></p>}
                  <div className="mt-auto pt-3 text-[11.5px] text-subtle inline-flex items-center gap-1"><ExternalLink className="size-3" />{p.lastVerified ? `Verified ${prettyDate(p.lastVerified, { year: true })}` : "Verification pending"}</div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      <div className="text-center">
        <Link href={sp.show === "all" ? "/funding" : "/funding?show=all"} className="text-[13px] text-brand-700 hover:underline">{sp.show === "all" ? "Hide unlikely and dismissed programs" : `Show all ${matches.length} programs in the database`}</Link>
      </div>
    </div>
  );
}
