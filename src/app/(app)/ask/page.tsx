import Link from "next/link";
import { requireCtx } from "@/server/auth/session";
import { threadsFor } from "@/server/services/ask";
import { showExtras } from "@/server/config";
import { AskChat } from "@/components/ask/ask-panel";
import { Card } from "@/components/ui/primitives";
import { prettyDateTime } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const metadata = { title: "Ask Fabrik" };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const threads = showExtras() ? threadsFor(ctx).slice(0, 8) : [];
  return (
    <div className={cn("grid gap-6 h-[calc(100dvh-8.5rem)]", threads.length > 0 && "xl:grid-cols-[minmax(0,1fr)_320px]")}>
      <Card className="flex flex-col min-h-0 px-5 sm:px-8 pt-2 pb-5">
        <AskChat key={sp.q ?? "new"} initialQuestion={sp.q} orgName={ctx.org.name} />
      </Card>
      {threads.length > 0 && (
        <aside className="hidden xl:flex flex-col gap-4 min-h-0 overflow-y-auto">
          <Card className="p-4">
            <div className="text-[13px] font-semibold mb-2">Recent questions</div>
            <ul className="space-y-2">
              {threads.map((t) => (
                <li key={t.id} className="text-[12.5px]">
                  <Link href={`/ask?q=${encodeURIComponent(t.messages[0]?.content ?? t.title)}`} className="text-ink hover:underline line-clamp-2">{t.title}</Link>
                  <div className="text-[11px] text-subtle">{prettyDateTime(t.updatedAt)} · {t.messages.length / 2} answers</div>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      )}
    </div>
  );
}
