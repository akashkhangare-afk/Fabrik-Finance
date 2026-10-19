"use client";

import { useState } from "react";
import type { CloseFrequency } from "@/lib/types";
import { saveThresholds, setFrequency, toggleRule } from "@/app/actions/app";
import { Button, Field, Input } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/client";
import { Switch } from "./switch";
import { useAct } from "./use-act";

export function ThresholdsForm({ autoApprove, review, largeDollars, canEdit }: { autoApprove: number; review: number; largeDollars: number; canEdit: boolean }) {
  const { pending, act } = useAct();
  const a0 = String(Math.round(autoApprove * 1000) / 10);
  const r0 = String(Math.round(review * 1000) / 10);
  const l0 = String(largeDollars);
  const [a, setA] = useState(a0);
  const [r, setR] = useState(r0);
  const [l, setL] = useState(l0);
  const an = Number(a);
  const rn = Number(r);
  const ln = Number(l.replace(/[$,\s]/g, ""));
  const valid = Number.isFinite(an) && Number.isFinite(rn) && Number.isFinite(ln) && an <= 100 && an > rn && rn >= 50 && ln >= 1000;
  const dirty = a !== a0 || r !== r0 || l !== l0;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => saveThresholds(an / 100, rn / 100, ln));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Automatic processing at or above" htmlFor="th-auto">
          <div className="relative">
            <Input id="th-auto" inputMode="decimal" disabled={!canEdit} value={a} onChange={(e) => setA(e.target.value)} className="pr-8 tabular" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm" aria-hidden>%</span>
          </div>
        </Field>
        <Field label="Bookkeeper review at or above" htmlFor="th-review">
          <div className="relative">
            <Input id="th-review" inputMode="decimal" disabled={!canEdit} value={r} onChange={(e) => setR(e.target.value)} className="pr-8 tabular" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm" aria-hidden>%</span>
          </div>
        </Field>
        <Field label="Large transaction (always reviewed)" htmlFor="th-large">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm" aria-hidden>$</span>
            <Input id="th-large" inputMode="numeric" disabled={!canEdit} value={l} onChange={(e) => setL(e.target.value)} className="pl-6 tabular" />
          </div>
        </Field>
      </div>
      {canEdit && (
        <div className="flex items-center justify-end gap-3">
          {dirty && !valid && <span className="text-[12px] text-crit-600" role="alert">Automatic must be above review (review ≥ 50%), and large ≥ $1,000.</span>}
          {dirty && (
            <Button
              onClick={() => {
                setA(a0);
                setR(r0);
                setL(l0);
              }}
            >
              Reset
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={pending || !dirty || !valid}>
            {pending ? "Saving…" : "Save thresholds"}
          </Button>
        </div>
      )}
    </form>
  );
}

export function RuleToggle({ id, active, label }: { id: string; active: boolean; label: string }) {
  const { pending, act } = useAct();
  return <Switch checked={active} disabled={pending} label={`${active ? "Disable" : "Enable"} rule ${label}`} onChange={(v) => act(() => toggleRule(id, v))} />;
}

export function FrequencyForm({ value }: { value: CloseFrequency }) {
  const { pending, act } = useAct();
  return (
    <div className={pending ? "opacity-60 pointer-events-none" : undefined}>
      <Segmented<CloseFrequency>
        label="Close frequency"
        value={value}
        onChange={(v) => v !== value && act(() => setFrequency(v))}
        options={[
          { value: "monthly", label: "Monthly" },
          { value: "quarterly", label: "Quarterly" },
          { value: "annual", label: "Annual" },
        ]}
      />
    </div>
  );
}
