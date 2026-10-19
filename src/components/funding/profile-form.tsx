"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import type { FarmProfile, PurposeTag } from "@/lib/types";
import { moneyCompact } from "@/lib/format";
import { saveProfile } from "@/app/actions/app";
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/client";

const PURPOSES: [PurposeTag, string][] = [["equipment", "Equipment"], ["land_purchase", "Land purchase"], ["operating", "Operating costs"], ["conservation", "Conservation"], ["energy", "Energy efficiency / renewable"], ["storage", "Storage, drying & handling"], ["value_added", "Value-added product"], ["expansion", "Expansion"], ["disaster", "Disaster recovery"]];
const tri = (v?: boolean) => (v == null ? "" : v ? "yes" : "no");
const fromTri = (s: string) => (s === "" ? undefined : s === "yes");

function Section({ title, subtitle, children, action }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <div className="px-5 pb-5">{children}</div>
    </Card>
  );
}

function Rows<T>({ rows, onChange, empty, render, blank, canEdit, addLabel }: { rows: T[]; onChange: (r: T[]) => void; empty: T; render: (r: T, set: (v: T) => void) => ReactNode; blank?: string; canEdit: boolean; addLabel: string }) {
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-[13px] text-muted">{blank ?? "None added."}</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1 grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">{render(r, (v) => onChange(rows.map((x, j) => (j === i ? v : x))))}</div>
          {canEdit && (
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="size-9 rounded-lg text-muted hover:bg-sunken hover:text-crit-600 flex items-center justify-center shrink-0" aria-label="Remove row">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <Button size="sm" variant="ghost" onClick={() => onChange([...rows, structuredClone(empty)])}>
          <Plus className="size-3.5" /> {addLabel}
        </Button>
      )}
    </div>
  );
}

export function ProfileForm({ profile, canEdit, syncedAt, extras }: { profile: FarmProfile; canEdit: boolean; syncedAt?: string; extras: boolean }) {
  const [p, setP] = useState(profile);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const up = <K extends keyof FarmProfile>(k: K, v: FarmProfile[K]) => setP((x) => ({ ...x, [k]: v }));
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(/[,$]/g, "")));
  const ownersTotal = p.owners.reduce((s, o) => s + (Number(o.pct) || 0), 0);
  const dis = !canEdit;
  const save = () =>
    start(async () => {
      const r = await saveProfile({ ...p, owners: p.owners.map((o) => ({ ...o, pct: Number(o.pct) || 0 })) });
      toast(r.ok ? { tone: "success", title: r.message ?? "Saved" } : { tone: "error", title: r.error });
      router.refresh();
    });

  return (
    <div className="space-y-5 pb-24">
      <Section title="Financials" subtitle={syncedAt ? `From QuickBooks Online · synced ${syncedAt}` : "From QuickBooks Online"} action={<span className="inline-flex items-center gap-1 text-[12px] text-muted"><RefreshCw className="size-3.5" /> Read-only</span>}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[["Revenue (YTD)", p.revenue], ["Expenses (YTD)", p.expenses], ["Total assets", p.assets], ["Total debt", p.debt]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl bg-surface-2 border border-line px-3.5 py-2.5">
              <div className="text-[12px] text-muted">{l as string}</div>
              <div className="text-[17px] font-semibold tabular">{v != null ? moneyCompact(v as number) : "—"}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Entity & location">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Legal entity name"><Input disabled={dis} value={p.legalName} onChange={(e) => up("legalName", e.target.value)} /></Field>
          <Field label="Entity type">
            <Select disabled={dis} value={p.entityType} onChange={(e) => up("entityType", e.target.value as FarmProfile["entityType"])}>
              <option value="llc">LLC</option><option value="corporation">Corporation</option><option value="partnership">Partnership</option><option value="sole_proprietor">Sole proprietor</option><option value="trust">Trust</option><option value="cooperative">Cooperative</option>
            </Select>
          </Field>
          {extras && <Field label="EIN" hint="Stored masked"><Input disabled={dis} value={p.ein ?? ""} onChange={(e) => up("ein", e.target.value)} /></Field>}
          <Field label="State"><Input disabled={dis} value={p.state} maxLength={2} onChange={(e) => up("state", e.target.value.toUpperCase())} /></Field>
          <Field label="County"><Input disabled={dis} value={p.county} onChange={(e) => up("county", e.target.value)} /></Field>
          <Field label="Employees"><Input disabled={dis} inputMode="numeric" value={p.employees ?? ""} onChange={(e) => up("employees", num(e.target.value))} /></Field>
        </div>
      </Section>

      <Section title="Owners / members" subtitle={`Ownership totals ${ownersTotal}%${ownersTotal !== 100 ? " — must equal 100%" : ""}`}>
        <Rows canEdit={canEdit} addLabel="Add owner" rows={p.owners} onChange={(r) => up("owners", r)} empty={{ name: "", pct: 0, role: "" }} render={(o, set) => (
          <>
            <Input disabled={dis} aria-label="Owner name" placeholder="Name" value={o.name} onChange={(e) => set({ ...o, name: e.target.value })} />
            <Input disabled={dis} aria-label="Role" placeholder="Role" value={o.role ?? ""} onChange={(e) => set({ ...o, role: e.target.value })} />
            <Input disabled={dis} aria-label="Ownership %" inputMode="decimal" placeholder="%" value={String(o.pct)} onChange={(e) => set({ ...o, pct: Number(e.target.value) || 0 })} />
          </>
        )} />
      </Section>

      <Section title="Land & production">
        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          <Field label="Acres owned"><Input disabled={dis} inputMode="numeric" value={p.acresOwned ?? ""} onChange={(e) => up("acresOwned", num(e.target.value))} /></Field>
          <Field label="Acres rented"><Input disabled={dis} inputMode="numeric" value={p.acresRented ?? ""} onChange={(e) => up("acresRented", num(e.target.value))} /></Field>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div>
            <div className="text-[13px] font-medium mb-2">Crops</div>
            <Rows canEdit={canEdit} addLabel="Add crop" rows={p.crops} onChange={(r) => up("crops", r)} empty={{ crop: "", acres: 0 }} render={(c, set) => (
              <>
                <Input disabled={dis} aria-label="Crop" placeholder="Crop (e.g. corn)" value={c.crop} onChange={(e) => set({ ...c, crop: e.target.value.toLowerCase() })} />
                <Input disabled={dis} aria-label="Acres" inputMode="numeric" placeholder="Acres" value={String(c.acres)} onChange={(e) => set({ ...c, acres: Number(e.target.value) || 0 })} />
              </>
            )} />
          </div>
          <div>
            <div className="text-[13px] font-medium mb-2">Livestock</div>
            <Rows canEdit={canEdit} addLabel="Add livestock" blank="None — row crops only." rows={p.livestock} onChange={(r) => up("livestock", r)} empty={{ kind: "", head: 0 }} render={(c, set) => (
              <>
                <Input disabled={dis} aria-label="Kind" placeholder="e.g. beef cattle" value={c.kind} onChange={(e) => set({ ...c, kind: e.target.value })} />
                <Input disabled={dis} aria-label="Head" inputMode="numeric" placeholder="Head" value={String(c.head)} onChange={(e) => set({ ...c, head: Number(e.target.value) || 0 })} />
              </>
            )} />
          </div>
        </div>
        <div className="mt-6">
          <div className="text-[13px] font-medium mb-2">Properties</div>
          <Rows canEdit={canEdit} addLabel="Add property" rows={p.properties} onChange={(r) => up("properties", r)} empty={{ name: "", county: "", acres: 0, owned: true }} render={(c, set) => (
            <>
              <Input disabled={dis} aria-label="Property" placeholder="Name" value={c.name} onChange={(e) => set({ ...c, name: e.target.value })} />
              <Input disabled={dis} aria-label="County" placeholder="County" value={c.county} onChange={(e) => set({ ...c, county: e.target.value })} />
              <Input disabled={dis} aria-label="Acres" inputMode="numeric" placeholder="Acres" value={String(c.acres)} onChange={(e) => set({ ...c, acres: Number(e.target.value) || 0 })} />
              <Select disabled={dis} aria-label="Tenure" value={c.owned ? "owned" : "rented"} onChange={(e) => set({ ...c, owned: e.target.value === "owned" })}><option value="owned">Owned</option><option value="rented">Rented / leased</option></Select>
            </>
          )} />
        </div>
      </Section>

      <Section title="Equipment">
        <Rows canEdit={canEdit} addLabel="Add equipment" rows={p.equipment} onChange={(r) => up("equipment", r)} empty={{ description: "" }} render={(c, set) => (
          <>
            <Input disabled={dis} aria-label="Equipment" placeholder="Description" value={c.description} onChange={(e) => set({ ...c, description: e.target.value })} />
            <Input disabled={dis} aria-label="Year" inputMode="numeric" placeholder="Year" value={c.year ?? ""} onChange={(e) => set({ ...c, year: num(e.target.value) })} />
            <Input disabled={dis} aria-label="Value" inputMode="decimal" placeholder="Value $" value={c.value != null ? String(c.value / 100) : ""} onChange={(e) => set({ ...c, value: e.target.value ? Math.round(Number(e.target.value) * 100) : undefined })} />
          </>
        )} />
      </Section>

      <Section title="Planned investments" subtitle="The projects you'd like to fund — these drive which programs match">
        <Rows canEdit={canEdit} addLabel="Add investment" rows={p.plannedInvestments} onChange={(r) => up("plannedInvestments", r)} empty={{ id: "", purpose: "equipment" as PurposeTag, description: "", amount: 0, timeframe: "" }} render={(c, set) => (
          <>
            <Select disabled={dis} aria-label="Purpose" value={c.purpose} onChange={(e) => set({ ...c, purpose: e.target.value as PurposeTag })}>{PURPOSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            <Input disabled={dis} aria-label="Description" placeholder="Description" value={c.description} onChange={(e) => set({ ...c, description: e.target.value })} className="sm:col-span-2 w-full" />
            <Input disabled={dis} aria-label="Amount" inputMode="decimal" placeholder="Amount $" value={c.amount ? String(c.amount / 100) : ""} onChange={(e) => set({ ...c, amount: Math.round(Number(e.target.value.replace(/[,$]/g, "")) * 100) || 0 })} />
            <Input disabled={dis} aria-label="Timeframe" placeholder="Timeframe" value={c.timeframe} onChange={(e) => set({ ...c, timeframe: e.target.value })} />
          </>
        )} />
        <div className="mt-5" id="project">
          <Field label="Project description">
            <Textarea disabled={dis} rows={4} value={p.projectDescription ?? ""} onChange={(e) => up("projectDescription", e.target.value)} placeholder="e.g. Replace our 2012 planter with a 16-row unit with section control to cut seed overlap and fuel use…" />
          </Field>
        </div>
      </Section>

      <Section title="Business activities">
        <Field label="Business activities" hint="One per line"><Textarea disabled={dis} rows={4} value={p.activities.join("\n")} onChange={(e) => up("activities", e.target.value.split("\n").filter((x) => x.trim()))} /></Field>
      </Section>

      <details className="group rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]">
        <summary className="cursor-pointer list-none px-5 py-4 text-[15px] font-semibold">More details</summary>
        <div className="px-5 pb-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Years farming"><Input disabled={dis} inputMode="numeric" value={p.yearsFarming ?? ""} onChange={(e) => up("yearsFarming", num(e.target.value))} /></Field>
          <Field label="Beginning farmer?">
            <Select disabled={dis} value={tri(p.beginningFarmer)} onChange={(e) => up("beginningFarmer", fromTri(e.target.value))}><option value="">Not sure</option><option value="yes">Yes</option><option value="no">No</option></Select>
          </Field>
          <Field label="Base acres (FSA)"><Input disabled={dis} inputMode="numeric" value={p.baseAcres ?? ""} onChange={(e) => up("baseAcres", num(e.target.value))} /></Field>
        </div>
        <Field label="Conservation practices" hint="One per line"><Textarea disabled={dis} rows={3} value={p.conservationPractices.join("\n")} onChange={(e) => up("conservationPractices", e.target.value.split("\n").filter((x) => x.trim()))} /></Field>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {([["hasCommercialCredit", "Have commercial credit (bank / Farm Credit)?"], ["disasterLossThisYear", "Natural-disaster damage this year?"], ["valueAddedActivity", "Value-added product venture?"], ["stewardshipAssessment", "NRCS stewardship assessment done?"], ["energyAudit", "Energy audit completed?"]] as const).map(([k, l]) => (
            <Field key={k} label={l}>
              <Select disabled={dis} value={tri(p[k])} onChange={(e) => up(k, fromTri(e.target.value))}><option value="">Not sure</option><option value="yes">Yes</option><option value="no">No</option></Select>
            </Field>
          ))}
        </div>
        </div>
      </details>

      {canEdit && (
        <div className="fixed bottom-0 inset-x-0 lg:left-[248px] z-30 border-t border-line bg-surface/95 backdrop-blur pl-4 sm:pl-8 pr-44 py-3 flex items-center justify-end gap-3">
          <Button onClick={() => setP(profile)} disabled={pending}>Reset</Button>
          <Button variant="primary" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
        </div>
      )}
    </div>
  );
}
