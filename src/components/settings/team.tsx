"use client";

import { useState } from "react";
import { ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import type { ClientRole } from "@/lib/types";
import { changeRole, inviteMember, removeMember } from "@/app/actions/app";
import { Avatar, Badge, Button, Field, Input, Select } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/client";
import { useAct } from "./use-act";

export const CLIENT_ROLE_OPTIONS: { value: ClientRole; label: string }[] = [
  { value: "business_owner", label: "Business Owner" },
  { value: "client_finance_user", label: "Client Finance User" },
  { value: "external_accountant", label: "External Accountant / CPA" },
];

export interface MemberView {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  title?: string;
  hue: number;
  role: ClientRole;
  roleLabel: string;
  status: "active" | "invited" | "disabled";
  mfa: boolean;
  isSelf: boolean;
}

export function TeamTable({ members, canManage }: { members: MemberView[]; canManage: boolean }) {
  const [removing, setRemoving] = useState<MemberView | null>(null);
  const { pending, act } = useAct();
  return (
    <>
      <div className="relative overflow-x-auto border-t border-line">
        <table className="w-full text-[13px] min-w-[680px]">
          <thead>
            <tr className="text-left text-[12px] text-muted">
              <th className="px-5 py-2.5 font-medium">Member</th>
              <th className="px-3 py-2.5 font-medium">Role</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Two-factor</th>
              {canManage && <th className="px-5 py-2.5 font-medium text-right"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.membershipId} className="border-t border-line hover:bg-surface-2">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={m.name} hue={m.hue} size={30} />
                    <div className="min-w-0">
                      <div className="font-medium text-ink truncate">
                        {m.name}
                        {m.isSelf && <span className="text-muted font-normal"> (you)</span>}
                      </div>
                      <div className="text-[12px] text-muted truncate">{m.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  {canManage && !m.isSelf ? (
                    <Select aria-label={`Role for ${m.name}`} className="h-8 text-[13px] w-[220px]" value={m.role} disabled={pending} onChange={(e) => act(() => changeRole(m.membershipId, e.target.value as ClientRole))}>
                      {CLIENT_ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span className="text-ink-2">{m.roleLabel}</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {m.status === "invited" ? <Badge tone="info" dot>Invited</Badge> : m.status === "active" ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="neutral" dot>Disabled</Badge>}
                </td>
                <td className="px-3 py-3">
                  {m.mfa ? (
                    <Badge tone="ok"><ShieldCheck className="size-3" aria-hidden /> On</Badge>
                  ) : (
                    <Badge tone="neutral"><ShieldOff className="size-3" aria-hidden /> Off</Badge>
                  )}
                </td>
                {canManage && (
                  <td className="px-5 py-3 text-right">
                    {!m.isSelf && (
                      <Button size="sm" variant="ghost" className="text-crit-600" onClick={() => setRemoving(m)}>
                        Remove
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        tone="danger"
        busy={pending}
        title={`Remove ${removing?.name ?? "member"}?`}
        description="They lose access to this organization immediately and are signed out. Their past activity stays in the audit trail."
        confirmLabel="Remove member"
        onConfirm={() => removing && act(() => removeMember(removing.membershipId), () => setRemoving(null))}
      />
    </>
  );
}

export function InviteForm() {
  const { pending, act } = useAct();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<ClientRole>("client_finance_user");
  return (
    <form
      className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        act(
          () => inviteMember(email, name, role),
          (r) => {
            if (r.ok) {
              setEmail("");
              setName("");
            }
          },
        );
      }}
    >
      <Field label="Email" htmlFor="inv-email">
        <Input id="inv-email" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
      </Field>
      <Field label="Name" htmlFor="inv-name">
        <Input id="inv-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
      </Field>
      <Field label="Role" htmlFor="inv-role">
        <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as ClientRole)}>
          {CLIENT_ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" variant="primary" disabled={pending || !email.trim() || !name.trim()}>
        <UserPlus className="size-4" aria-hidden /> {pending ? "Sending…" : "Send invite"}
      </Button>
    </form>
  );
}
