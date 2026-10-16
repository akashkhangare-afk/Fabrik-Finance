"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { requestPasswordReset, resetPassword, signIn, verifyMfa } from "@/app/actions/auth";
import { Button, Field, Input, Notice, Badge } from "@/components/ui/primitives";

export interface DemoAccountView {
  email: string;
  name: string;
  persona: string;
  mfa?: boolean;
}

export function LoginForm({ demo, password, next, resetDone }: { demo?: DemoAccountView[]; password?: string; next?: string; resetDone?: boolean }) {
  const [state, action, pending] = useActionState(signIn, {});
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [picked, setPicked] = useState<string>();
  const use = (email: string) => {
    if (!emailRef.current || !pwRef.current) return;
    emailRef.current.value = email;
    pwRef.current.value = password ?? "";
    setPicked(email);
    formRef.current?.requestSubmit();
  };
  return (
    <div>
      <h2 className="text-[24px] font-semibold tracking-[-0.015em]">Sign in</h2>
      <p className="text-muted mt-1.5 text-[14px]">Welcome back to your AI finance department.</p>
      {resetDone && <Notice tone="ok" className="mt-5" title="Password updated">Sign in with your new password.</Notice>}
      <form ref={formRef} action={action} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Email" htmlFor="email">
          <Input ref={emailRef} id="email" name="email" type="email" autoComplete="username" required placeholder="you@company.com" />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input ref={pwRef} id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        {state?.error && <Notice tone="crit">{state.error}</Notice>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
          {!pending && <ArrowRight className="size-4" />}
        </Button>
        <div className="flex items-center justify-between text-[13px]">
          <Link href="/forgot-password" className="text-brand-700 hover:underline">Forgot password?</Link>
          <span className="text-muted inline-flex items-center gap-1"><ShieldCheck className="size-3.5" /> MFA supported</span>
        </div>
      </form>
      {demo && (
        <div className="mt-8 rounded-2xl border border-line bg-surface-2 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold">Expo demo accounts</div>
            <Badge tone="brand">Synthetic data</Badge>
          </div>
          <p className="text-[12px] text-muted mt-1">Smith Family Farms LLC · Story County, Iowa. Choose a persona to sign in.</p>
          <div className="mt-3 grid gap-1.5">
            {demo.map((d) => (
              <button key={d.email} type="button" onClick={() => use(d.email)} disabled={pending} className="group flex items-center justify-between gap-3 rounded-lg bg-surface border border-line px-3 py-2 text-left hover:border-brand-300 hover:bg-brand-50/40 transition disabled:opacity-60">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink truncate">{d.name}</div>
                  <div className="text-[12px] text-muted truncate">{d.persona}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d.mfa && <KeyRound className="size-3.5 text-muted" aria-label="MFA" />}
                  <span className="text-[12px] text-brand-700 opacity-0 group-hover:opacity-100 transition">{picked === d.email && pending ? "Signing in…" : "Sign in →"}</span>
                </div>
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-muted mt-3">Password for all demo accounts: <code className="font-mono text-ink-2">{password}</code></p>
        </div>
      )}
    </div>
  );
}

export function MfaForm({ email, demoCode }: { email: string; demoCode?: string }) {
  const [state, action, pending] = useActionState(verifyMfa, {});
  return (
    <div>
      <div className="size-11 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center mb-4">
        <ShieldCheck className="size-5" />
      </div>
      <h2 className="text-[24px] font-semibold tracking-[-0.015em]">Two-factor authentication</h2>
      <p className="text-muted mt-1.5 text-[14px]">Enter the 6-digit code from your authenticator app for {email}.</p>
      <form action={action} className="mt-6 space-y-4">
        <Field label="Authentication code" htmlFor="code">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus className="tracking-[0.4em] text-center text-lg h-12 tabular" placeholder="••••••" />
        </Field>
        {state?.error && <Notice tone="crit">{state.error}</Notice>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
          {pending ? "Verifying…" : "Verify and continue"}
        </Button>
      </form>
      {demoCode && (
        <Notice tone="warn" className="mt-6" title="Demo mode">
          This demo account uses a published test secret. Current code: <span className="font-mono font-semibold tabular">{demoCode}</span> (refresh the page if it expires). Never shown when demo mode is off.
        </Notice>
      )}
      <Link href="/login" className="block mt-6 text-[13px] text-brand-700 hover:underline">← Use a different account</Link>
    </div>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, {});
  if (state?.sent)
    return (
      <div>
        <h2 className="text-[24px] font-semibold">Check your email</h2>
        <p className="text-muted mt-2 text-[14px]">If an account exists for that address, we&apos;ve sent a link to reset your password. It expires in 1 hour.</p>
        <p className="text-[12px] text-muted mt-4">Demo: emails are delivered to the development outbox (Operations → Admin).</p>
        <Link href="/login" className="block mt-6 text-[13px] text-brand-700 hover:underline">← Back to sign in</Link>
      </div>
    );
  return (
    <div>
      <h2 className="text-[24px] font-semibold tracking-[-0.015em]">Reset your password</h2>
      <p className="text-muted mt-1.5 text-[14px]">We&apos;ll email you a secure link.</p>
      <form action={action} className="mt-6 space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoFocus />
        </Field>
        {state?.error && <Notice tone="crit">{state.error}</Notice>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</Button>
      </form>
      <Link href="/login" className="block mt-6 text-[13px] text-brand-700 hover:underline">← Back to sign in</Link>
    </div>
  );
}

export function ResetForm({ token, invite }: { token: string; invite?: boolean }) {
  const [state, action, pending] = useActionState(resetPassword, {});
  return (
    <div>
      <h2 className="text-[24px] font-semibold tracking-[-0.015em]">{invite ? "Set up your account" : "Choose a new password"}</h2>
      <p className="text-muted mt-1.5 text-[14px]">At least 12 characters, with upper- and lower-case letters and a number.</p>
      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label="New password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        {state?.error && (
          <Notice tone="crit" title={state.error}>
            {state.problems?.length ? state.problems.join(" · ") : null}
          </Notice>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>{pending ? "Saving…" : "Save password"}</Button>
      </form>
    </div>
  );
}
