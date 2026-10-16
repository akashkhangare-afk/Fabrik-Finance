import { CalendarClock, ExternalLink, FileStack, FlaskConical, Info, UserRound } from "lucide-react";
import { requireCtx, hasPerm } from "@/server/auth/session";
import { taxWorkspace } from "@/server/services/admin";
import { db } from "@/server/db/store";
import { Avatar, Badge, Card, CardHeader, ClassBadge, EmptyState, Notice, PageHeader, ProgressRing, type Tone } from "@/components/ui/primitives";
import { TaxRequests, type TaxRequestView } from "@/components/tax/tax-requests";
import { RdScreener } from "@/components/tax/rd-screener";
import { prettyDate, prettyDateTime } from "@/lib/dates";
import { plural } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Tax & Credits" };

const TAX_YEAR = 2026;

const OWNER: Record<string, [Tone, string]> = { client: ["brand", "Client"], cpa: ["info", "CPA"], fabrik: ["neutral", "Fabrik"] };
const DEADLINE_STATUS: Record<string, [Tone, string]> = {
  upcoming: ["neutral", "Upcoming"],
  in_preparation: ["info", "In preparation"],
  filed_by_cpa: ["ok", "Filed by CPA"],
  not_applicable: ["neutral", "Not applicable"],
};

function relDays(n: number) {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n > 1) return `in ${n} days`;
  if (n === -1) return "yesterday";
  return `${Math.abs(n)} days ago`;
}

export default async function TaxPage() {
  const ctx = await requireCtx();
  const ws = taxWorkspace(ctx);
  const data = db();
  const users = new Map(data.users.map((u) => [u.id, u.name]));
  const next = ws.deadlines.find((d) => d.daysUntil >= 0 && d.status !== "filed_by_cpa" && d.status !== "not_applicable");
  const yearRequests = ws.requests.filter((r) => r.taxYear === TAX_YEAR);
  const outstanding = yearRequests.filter((r) => r.status === "requested").length;
  const cpa = ws.cpa.filter(Boolean);
  const canAct = hasPerm(ctx, "tax:read");
  const isCpa = ctx.role === "external_accountant";
  const isClientApprover = ctx.role === "business_owner" || ctx.role === "client_finance_user";

  const requests: TaxRequestView[] = yearRequests.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    document: r.document ? { id: r.document.id, filename: r.document.filename } : undefined,
    history: [...r.history].reverse().map((h) => ({ status: h.status, by: users.get(h.userId) ?? "Unknown user", at: prettyDateTime(h.at), comment: h.comment })),
  }));
  const documents = data.documents
    .filter((d) => d.orgId === ctx.org.id)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, 60)
    .map((d) => ({ id: d.id, filename: d.filename }));

  return (
    <div className="max-w-[1100px] space-y-6">
      <PageHeader
        eyebrow="Documents"
        title="Tax & Credits"
        badge={<ClassBadge cls="B" />}
        description="Deadlines, document collection and approvals for your CPA — in one place, with a full audit trail."
      />

      <Notice tone="ai" icon={<Info className="size-4" />} title="Preview — proposed addition inspired by Fondo">
        Fabrik tracks deadlines, collects documents and records approvals; your CPA prepares and files returns. Fabrik does not e-file or calculate tax. Tax filing and R&amp;D credits are outside the Expo MVP scope.
      </Notice>

      {/* (a) Summary */}
      <section aria-label="Tax summary" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-surface border border-line rounded-[var(--radius-card)] shadow-[var(--shadow-card)] px-4 py-3.5 flex items-center gap-4">
          <ProgressRing value={ws.readiness} size={60} />
          <div className="min-w-0">
            <div className="text-[13px] text-muted font-medium">Tax-year {TAX_YEAR} readiness</div>
            <div className="text-[12px] text-muted mt-1">Based on document collection and approvals</div>
          </div>
        </div>
        <div className="bg-surface border border-line rounded-[var(--radius-card)] shadow-[var(--shadow-card)] px-4 py-3.5">
          <div className="text-[13px] text-muted font-medium flex items-center gap-1.5"><CalendarClock className="size-3.5" /> Next deadline</div>
          {next ? (
            <>
              <div className="mt-1.5 text-[17px] leading-6 font-semibold text-ink">{next.form}</div>
              <div className="mt-1 text-[12px] text-muted tabular">
                {prettyDate(next.dueDate, { year: true })} · <span className={cn(next.daysUntil <= 30 && "text-warn-700 font-medium")}>{relDays(next.daysUntil)}</span>
              </div>
            </>
          ) : (
            <div className="mt-1.5 text-[15px] text-muted">None scheduled</div>
          )}
        </div>
        <div className="bg-surface border border-line rounded-[var(--radius-card)] shadow-[var(--shadow-card)] px-4 py-3.5">
          <div className="text-[13px] text-muted font-medium flex items-center gap-1.5"><FileStack className="size-3.5" /> Documents outstanding</div>
          <div className="mt-1.5 text-[24px] leading-8 font-semibold text-ink tabular">{outstanding}</div>
          <div className="text-[12px] text-muted">of {plural(yearRequests.length, "request")} for {TAX_YEAR}</div>
        </div>
        <div className="bg-surface border border-line rounded-[var(--radius-card)] shadow-[var(--shadow-card)] px-4 py-3.5">
          <div className="text-[13px] text-muted font-medium flex items-center gap-1.5"><UserRound className="size-3.5" /> CPA on file</div>
          {cpa.length ? (
            <div className="mt-2 space-y-1.5">
              {cpa.map((u) => (
                <div key={u.id} className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={u.name} hue={u.avatarHue} size={32} />
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate">{u.name}</div>
                    <div className="text-[12px] text-muted truncate">{u.title ?? u.email}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-1.5 text-[13px] text-muted">No external accountant invited yet. A Business Owner can invite one in Team &amp; Settings.</div>
          )}
        </div>
      </section>

      {/* (b) Tax calendar */}
      <Card>
        <CardHeader title="Tax calendar" subtitle="Federal and state filings that apply to your operation, with who owns each step." icon={<CalendarClock className="size-4" />} />
        {ws.deadlines.length === 0 ? (
          <EmptyState title="No deadlines tracked yet" description="Your Fabrik team adds deadlines once your entity and payroll setup are confirmed." />
        ) : (
          <ul className="border-t border-line">
            {ws.deadlines.map((d) => {
              const [ownerTone, ownerLabel] = OWNER[d.owner] ?? ["neutral", d.owner];
              const [stTone, stLabel] = DEADLINE_STATUS[d.status] ?? ["neutral", d.status.replace(/_/g, " ")];
              return (
                <li key={d.id} className="px-5 py-3.5 border-t border-line first:border-t-0 hover:bg-surface-2 transition-colors">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-6">
                    <div className="md:w-40 shrink-0">
                      <div className="text-[14px] font-semibold tabular">{prettyDate(d.dueDate, { year: true })}</div>
                      <div className={cn("text-[12px] tabular", d.daysUntil < 0 ? "text-muted" : d.daysUntil <= 30 ? "text-warn-700 font-medium" : "text-muted")}>{relDays(d.daysUntil)}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-semibold">{d.form}</span>
                        <Badge tone="neutral">{d.jurisdiction === "federal" ? "Federal" : `State · ${ctx.org.state}`}</Badge>
                        <Badge tone={ownerTone} title="Who owns this step">Owner: {ownerLabel}</Badge>
                        <Badge tone={stTone} dot>{stLabel}</Badge>
                      </div>
                      <div className="text-[13.5px] text-ink-2 mt-1">{d.title}</div>
                      <div className="text-[12px] text-muted mt-0.5">{d.basis}</div>
                    </div>
                    {d.sourceUrl && (
                      <a href={d.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 text-[12.5px] text-brand-700 hover:underline md:mt-0.5">
                        Official source <ExternalLink className="size-3.5" aria-hidden />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="px-5 py-3 border-t border-line bg-surface-2 rounded-b-[var(--radius-card)] text-[12px] text-muted">Dates are typical statutory due dates — confirm with your CPA.</div>
      </Card>

      {/* (c) Document collection & approvals */}
      <Card>
        <CardHeader
          title={`Document collection & approvals · ${TAX_YEAR}`}
          subtitle="Requested → received → CPA reviewed → client approved → filed by CPA. Every step is recorded."
          icon={<FileStack className="size-4" />}
        />
        {requests.length === 0 ? (
          <EmptyState title="No document requests yet" description="Your CPA or Fabrik team will request what they need for the return here." />
        ) : (
          <TaxRequests requests={requests} documents={documents} canAct={canAct} isCpa={isCpa} isStaff={ctx.isStaff} isClientApprover={isClientApprover} />
        )}
      </Card>

      {/* (d) R&D screener */}
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2 flex-wrap">
              R&amp;D tax credit screener <ClassBadge cls="C" />
            </span>
          }
          subtitle="Five quick questions to see whether your field work may qualify. Indicators only — a specialist confirms eligibility."
          icon={<FlaskConical className="size-4" />}
        />
        <div className="px-5 pb-5">
          <RdScreener canRun={canAct} />
        </div>
      </Card>
    </div>
  );
}
