import Link from "next/link";
import { BookOpen, ChartLine, FileText, HandCoins, Landmark, Receipt, ShieldCheck } from "lucide-react";
import { requireCtx } from "@/server/auth/session";
import { threadsFor } from "@/server/services/ask";
import { aiStatus } from "@/server/ai/gateway";
import { AskChat } from "@/components/ask/ask-panel";
import { Card, Badge } from "@/components/ui/primitives";
import { prettyDateTime } from "@/lib/dates";

export const metadata = { title: "Ask Fabrik" };

const EXAMPLES: { icon: typeof BookOpen; module: string; qs: string[] }[] = [
  { icon: BookOpen, module: "Books", qs: ["How much did we spend on equipment this year?", "Show me payments to John Deere.", "Why did expenses increase in September?"] },
  { icon: Receipt, module: "Bills", qs: ["Which bills are due this month?"] },
  { icon: HandCoins, module: "Collect", qs: ["Who owes us more than $20,000?"] },
  { icon: ChartLine, module: "CFO", qs: ["Why did profit decline last quarter?", "Can we afford to purchase another $1M of farmland?", "What is our current cash position?"] },
  { icon: Landmark, module: "Funding", qs: ["What government programs might help finance farm expansion?", "What programs could potentially help with equipment purchases?"] },
  { icon: FileText, module: "Documents", qs: ["Show me the invoice for the John Deere purchase."] },
];

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const threads = threadsFor(ctx).slice(0, 8);
  const ai = aiStatus();
  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-6 h-[calc(100dvh-8.5rem)]">
      <Card className="flex flex-col min-h-0 px-5 sm:px-8 pt-2 pb-5">
        <AskChat key={sp.q ?? "new"} initialQuestion={sp.q} orgName={ctx.org.name} />
      </Card>
      <aside className="hidden xl:flex flex-col gap-4 min-h-0 overflow-y-auto">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold"><ShieldCheck className="size-4 text-brand-600" /> How Ask Fabrik answers</div>
          <ul className="mt-2 space-y-1.5 text-[12.5px] text-ink-2">
            <li>• A finance router picks the right module — you don&apos;t need to know where data lives.</li>
            <li>• Every number is computed from your QuickBooks data, documents or verified program sources.</li>
            <li>• Read-only: it can&apos;t transfer money or pay invoices.</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5"><Badge tone="ai">{ai.provider}</Badge><Badge>{ai.model}</Badge></div>
        </Card>
        <Card className="p-4">
          <div className="text-[13px] font-semibold mb-2">Try asking</div>
          <div className="space-y-3">
            {EXAMPLES.map(({ icon: Icon, module, qs }) => (
              <div key={module}>
                <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted"><Icon className="size-3.5" />{module}</div>
                <ul className="mt-1 space-y-1">
                  {qs.map((q) => (
                    <li key={q}><Link href={`/ask?q=${encodeURIComponent(q)}`} className="text-[12.5px] text-brand-700 hover:underline">{q}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
        {threads.length > 0 && (
          <Card className="p-4">
            <div className="text-[13px] font-semibold mb-2">Recent questions</div>
            <ul className="space-y-2">
              {threads.map((t) => (
                <li key={t.id} className="text-[12.5px]">
                  <Link href={`/ask?q=${encodeURIComponent(t.messages[0]?.content ?? t.title)}`} className="text-ink hover:underline line-clamp-2">{t.title}</Link>
                  <div className="text-[11px] text-subtle">{prettyDateTime(t.updatedAt)} UTC · {t.messages.length / 2} answers</div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </aside>
    </div>
  );
}
