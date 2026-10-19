"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { beginMfaEnrollment, confirmMfaEnrollment, disableMfa, updateMyProfile } from "@/app/actions/auth";
import { Badge, Button, Field, Input } from "@/components/ui/primitives";
import { Segmented, useToast } from "@/components/ui/client";
import { Switch } from "./switch";
import { useAct } from "./use-act";

type Digest = "realtime" | "daily" | "weekly";

export function ProfileForm({ name: n0, title: t0, prefs: p0, showDigest }: { name: string; title: string; prefs: { email: boolean; inApp: boolean; digest: Digest }; showDigest: boolean }) {
  const { pending, act } = useAct();
  const [name, setName] = useState(n0);
  const [title, setTitle] = useState(t0);
  const [prefs, setPrefs] = useState(p0);
  const dirty = name !== n0 || title !== t0 || prefs.email !== p0.email || prefs.inApp !== p0.inApp || prefs.digest !== p0.digest;
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => updateMyProfile(name, title, prefs));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="pf-name">
          <Input id="pf-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Title" htmlFor="pf-title">
          <Input id="pf-title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Managing Member" autoComplete="organization-title" />
        </Field>
      </div>
      <div>
        <div className="text-[13px] font-medium text-ink-2 mb-2">Notifications</div>
        <div className="rounded-xl border border-line divide-y divide-line">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <label htmlFor="pf-email" className="text-[13.5px] font-medium">Email notifications</label>
            <Switch id="pf-email" label="Email notifications" checked={prefs.email} onChange={(v) => setPrefs((p) => ({ ...p, email: v }))} />
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <label htmlFor="pf-inapp" className="text-[13.5px] font-medium">In-app notifications</label>
            <Switch id="pf-inapp" label="In-app notifications" checked={prefs.inApp} onChange={(v) => setPrefs((p) => ({ ...p, inApp: v }))} />
          </div>
          {showDigest && <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 px-4 py-3">
            <div className="text-[13.5px] font-medium">Email digest</div>
            <Segmented<Digest>
              size="sm"
              label="Email digest frequency"
              value={prefs.digest}
              onChange={(v) => setPrefs((p) => ({ ...p, digest: v }))}
              options={[
                { value: "realtime", label: "Real-time" },
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
              ]}
            />
          </div>}
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending || !dirty || !name.trim()}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}

export function MfaCard({ enabled }: { enabled: boolean }) {
  const { pending, act } = useAct();
  const toast = useToast();
  const [starting, start] = useTransition();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState("");
  const clean = code.replace(/\D/g, "").slice(0, 6);

  if (enabled) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge tone="ok"><ShieldCheck className="size-3" aria-hidden /> Two-factor authentication is on</Badge>
        </div>
        <p className="text-[13px] text-muted">You&apos;ll be asked for a code from your authenticator app each time you sign in.</p>
        {!disabling ? (
          <Button size="sm" variant="ghost" onClick={() => setDisabling(true)}>Turn off two-factor</Button>
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              act(() => disableMfa(clean), (r) => r.ok && (setDisabling(false), setCode("")));
            }}
          >
            <Field label="Current 6-digit code" htmlFor="mfa-off">
              <Input id="mfa-off" inputMode="numeric" autoComplete="one-time-code" className="w-36 font-mono tracking-[0.2em]" value={clean} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
            </Field>
            <Button type="submit" variant="danger" disabled={pending || clean.length !== 6}>Turn off</Button>
            <Button onClick={() => (setDisabling(false), setCode(""))}>Cancel</Button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Badge tone="warn"><ShieldOff className="size-3" aria-hidden /> Two-factor authentication is off</Badge>
      {!setup ? (
        <>
          <Button
            disabled={starting}
            onClick={() =>
              start(async () => {
                const r = await beginMfaEnrollment();
                if (r.ok && r.data) setSetup(r.data);
                else if (!r.ok) toast({ tone: "error", title: r.error });
              })
            }
          >
            <ShieldCheck className="size-4" aria-hidden /> {starting ? "Preparing…" : "Set up two-factor authentication"}
          </Button>
        </>
      ) : (
        <div className="rounded-xl border border-line bg-surface-2 p-4 animate-in">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="QR code for your authenticator app" width={160} height={160} className="rounded-lg border border-line bg-white shrink-0" />
            <div className="min-w-0 space-y-3">
              <ol className="text-[13px] text-ink-2 list-decimal pl-4 space-y-1">
                <li>Scan the QR code with your authenticator app.</li>
                <li>Or enter this key manually:</li>
              </ol>
              <div className="font-mono text-[12.5px] bg-surface border border-line rounded-lg px-3 py-2 break-all select-all">{setup.secret}</div>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(() => confirmMfaEnrollment(clean), (r) => r.ok && (setSetup(null), setCode("")));
                }}
              >
                <Field label="6-digit code" htmlFor="mfa-on">
                  <Input id="mfa-on" inputMode="numeric" autoComplete="one-time-code" className="w-36 font-mono tracking-[0.2em]" value={clean} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
                </Field>
                <Button type="submit" variant="primary" disabled={pending || clean.length !== 6}>Verify &amp; turn on</Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
