import Link from "next/link";
import { Inbox as InboxIcon } from "lucide-react";
import { requireCtx, hasPerm } from "@/server/auth/session";
import { listInbox, inboxSummary } from "@/server/services/workflow";
import { db } from "@/server/db/store";
import { PageHeader, Card, EmptyState, Badge } from "@/components/ui/primitives";
import { InboxList, type InboxView } from "@/components/inbox/inbox-list";
import { prettyDateTime } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { demoMode } from "@/server/config";

export const metadata = { title: "Finance Inbox" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const view = sp.view === "done" ? "done" : "open";
  const items = listInbox(ctx, view);
  const summary = inboxSummary(ctx.org.id);
  const users = new Map(db().users.map((u) => [u.id, u.name]));
  const data: InboxView[] = items.map(({ item, context }) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    body: item.body,
    status: item.status,
    priority: item.priority,
    options: item.options,
    createdAt: prettyDateTime(item.createdAt),
    from: item.createdBy === "fabrik-ai" ? "Fabrik AI" : (users.get(item.createdBy) ?? "Fabrik"),
    fromAi: item.createdBy === "fabrik-ai",
    response: item.response ? { label: item.response.label, comment: item.response.comment, by: users.get(item.response.userId) ?? "", at: prettyDateTime(item.response.at) } : undefined,
    related: item.related,
    context: context as InboxView["context"],
  }));
  const tabs = [
    { key: "open", label: "Needs your input", count: summary.total },
    { key: "done", label: "Answered" },
  ];
  return (
    <div className="max-w-[920px]">
      <PageHeader
        title="Finance Inbox"
        description="Fabrik only interrupts you when a person's input or decision is needed. Answers become structured bookkeeping information — no email chains."
        badge={summary.total ? <Badge tone="risk">{summary.total} open</Badge> : <Badge tone="ok">All clear</Badge>}
      />
      <div className="flex items-center gap-1 border-b border-line mb-5" role="tablist">
        {tabs.map((t) => (
          <Link key={t.key} href={t.key === "open" ? "/inbox" : "/inbox?view=done"} role="tab" aria-selected={view === t.key} className={cn("relative px-3 h-10 inline-flex items-center gap-2 text-[13.5px] font-medium", view === t.key ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-brand-600 after:rounded" : "text-muted hover:text-ink")}>
            {t.label}
            {t.count ? <span className="min-w-5 h-5 px-1.5 rounded-full bg-sunken text-[11px] tabular flex items-center justify-center">{t.count}</span> : null}
          </Link>
        ))}
      </div>
      {data.length === 0 ? (
        <Card>
          <EmptyState icon={<InboxIcon className="size-5" />} title={view === "open" ? "Nothing needs your attention" : "No answered items yet"} description={view === "open" ? "Your books are being maintained. Fabrik will ask here when it genuinely needs your input." : undefined} />
        </Card>
      ) : (
        <InboxList items={data} canUpload={hasPerm(ctx, "documents:upload")} canApproveBills={hasPerm(ctx, "bills:approve")} demo={demoMode() && ctx.org.isDemo} />
      )}
    </div>
  );
}
