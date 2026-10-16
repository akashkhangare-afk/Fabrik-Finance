"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CircleMinus, FlaskConical } from "lucide-react";
import { rdScreen } from "@/app/actions/app";
import { Badge, Button, Notice, type Tone } from "@/components/ui/primitives";
import { Segmented, useToast } from "@/components/ui/client";
import { cn } from "@/lib/cn";

type Key = "newProcess" | "technicalUncertainty" | "experimentation" | "scienceBased" | "qualifiedSpend";
type Answer = "yes" | "no" | "";

const QUESTIONS: { key: Key; q: string; hint: string }[] = [
  { key: "newProcess", q: "Are you developing or testing a new or improved crop practice, process or technique?", hint: "e.g. a new tillage, irrigation, seeding-rate or nutrient program — not routine production." },
  { key: "technicalUncertainty", q: "At the start, were you uncertain whether it would work, or how best to do it?", hint: "Uncertainty about capability, method or the right design." },
  { key: "experimentation", q: "Are you running trials, test plots or side-by-side comparisons and adjusting based on results?", hint: "A documented process of experimentation." },
  { key: "scienceBased", q: "Does the work rely on agronomy, soil science, biology, engineering or data science?", hint: "Principles of the hard sciences, not just preference or market research." },
  { key: "qualifiedSpend", q: "Do you track wages, supplies or contractor costs spent on these trials?", hint: "Qualified research expenses must be identifiable." },
];

type Result = { tests: { key: string; label: string; met: boolean }[]; met: number; indicator: string; note: string };
const INDICATOR: Record<string, [Tone, string, string]> = {
  strong: ["ok", "Strong indicator", "All four tests appear to be met and you track qualified spend. Worth a specialist review."],
  possible: ["warn", "Possible", "Several tests appear to be met. A specialist can tell you whether the activity qualifies."],
  unlikely: ["neutral", "Unlikely", "Based on these answers the activity probably doesn't qualify."],
};

export function RdScreener({ canRun }: { canRun: boolean }) {
  const [answers, setAnswers] = useState<Record<Key, Answer>>({ newProcess: "", technicalUncertainty: "", experimentation: "", scienceBased: "", qualifiedSpend: "" });
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const complete = Object.values(answers).every(Boolean);
  const run = () =>
    start(async () => {
      const r = await rdScreen({
        newProcess: answers.newProcess === "yes",
        technicalUncertainty: answers.technicalUncertainty === "yes",
        experimentation: answers.experimentation === "yes",
        scienceBased: answers.scienceBased === "yes",
        qualifiedSpend: answers.qualifiedSpend === "yes",
      });
      if (r.ok && r.data) setResult(r.data);
      else if (!r.ok) toast({ tone: "error", title: r.error });
    });
  const ind = result ? (INDICATOR[result.indicator] ?? INDICATOR.unlikely!) : null;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <ol className="space-y-3">
        {QUESTIONS.map((q, i) => (
          <li key={q.key} className="rounded-xl border border-line bg-surface-2 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-ink">
                <span className="text-muted tabular mr-1.5">{i + 1}.</span>
                {q.q}
              </div>
              <div className="text-[12px] text-muted mt-0.5">{q.hint}</div>
            </div>
            <div className="shrink-0">
              <Segmented<Answer>
                size="sm"
                label={q.q}
                value={answers[q.key]}
                onChange={(v) => {
                  setAnswers((a) => ({ ...a, [q.key]: v }));
                  setResult(null);
                }}
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
              />
            </div>
          </li>
        ))}
        <li className="flex items-center gap-3 pt-1">
          <Button variant="primary" disabled={!complete || pending || !canRun} onClick={run}>
            <FlaskConical className="size-4" /> {pending ? "Screening…" : "Run screener"}
          </Button>
          {!complete && <span className="text-[12px] text-muted">Answer all five questions</span>}
        </li>
      </ol>
      <div aria-live="polite">
        {result && ind ? (
          <div className="rounded-xl border border-line px-4 py-4 animate-in">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">Indicator</div>
              <Badge tone={ind[0]} dot>{ind[1]}</Badge>
            </div>
            <p className="text-[13px] text-ink-2 mt-2">{ind[2]}</p>
            <div className="text-[12px] text-muted mt-3 mb-1.5">Four-part test · {result.met} of 4 met</div>
            <ul className="space-y-1.5">
              {result.tests.map((t) => (
                <li key={t.key} className="flex items-start gap-2 text-[13px]">
                  {t.met ? <CheckCircle2 className="size-4 text-ok-600 shrink-0 mt-0.5" aria-hidden /> : <CircleMinus className="size-4 text-subtle shrink-0 mt-0.5" aria-hidden />}
                  <span className={cn(t.met ? "text-ink" : "text-muted")}>
                    {t.label}
                    <span className="sr-only">{t.met ? " — met" : " — not met"}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Notice tone="neutral" className="mt-4">{result.note}</Notice>
          </div>
        ) : (
          <div className="min-h-48 rounded-xl border border-dashed border-line-strong flex flex-col items-center justify-center text-center px-6 py-8">
            <FlaskConical className="size-5 text-subtle" aria-hidden />
            <div className="text-[13.5px] font-medium mt-2">Your result appears here</div>
            <p className="text-[12px] text-muted mt-1 max-w-xs">Fabrik shows indicators only. It does not calculate or file R&amp;D credits.</p>
          </div>
        )}
      </div>
    </div>
  );
}
