"use client";

import { useState } from "react";
import { PlugZap, RefreshCw, Unplug } from "lucide-react";
import { integrationControl, syncNow } from "@/app/actions/app";
import { Button } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/client";
import { Switch } from "@/components/settings/switch";
import { useAct } from "@/components/settings/use-act";

export function QboActions({ status, canManage }: { status: "connected" | "error" | "disconnected"; canManage: boolean }) {
  const { pending, act } = useAct();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "disconnected" && (
        <Button variant="primary" disabled={pending} onClick={() => act(syncNow)}>
          <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden /> {pending ? "Syncing…" : "Sync now"}
        </Button>
      )}
      {canManage && status !== "connected" && (
        <Button variant={status === "disconnected" ? "primary" : "secondary"} disabled={pending} onClick={() => act(() => integrationControl("reconnect"))}>
          <PlugZap className="size-4" aria-hidden /> Reconnect
        </Button>
      )}
      {canManage && status !== "disconnected" && (
        <Button variant="ghost" disabled={pending} onClick={() => setConfirm(true)}>
          <Unplug className="size-4" aria-hidden /> Disconnect
        </Button>
      )}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        tone="danger"
        busy={pending}
        title="Disconnect QuickBooks Online?"
        description="Syncing and write-back stop until you reconnect. Your Fabrik history and audit trail are kept."
        confirmLabel="Disconnect"
        onConfirm={() => act(() => integrationControl("disconnect"), () => setConfirm(false))}
      />
    </div>
  );
}

export function SimulateFailureToggle({ on }: { on: boolean }) {
  const { pending, act } = useAct();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor="sim-fail" className="text-[13.5px] font-medium text-ink">Simulate next sync failure</label>
        <p className="text-[12px] text-muted mt-0.5">The next sync returns a provider error so you can show the needs-attention banner, error logging and the reconnect path.</p>
      </div>
      <Switch id="sim-fail" checked={on} disabled={pending} label="Simulate next sync failure" onChange={(v) => act(() => integrationControl(v ? "simulate_on" : "simulate_off"))} />
    </div>
  );
}
