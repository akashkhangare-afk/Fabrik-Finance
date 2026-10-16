import "server-only";
import type { AuditEvent } from "@/lib/types";
import { db } from "@/server/db/store";
import { newId } from "@/server/db/ids";
import type { Ctx } from "@/server/auth/session";

type EventInput = Omit<AuditEvent, "id" | "at" | "actor"> & { at?: string };

/** Records a material AI or human action (PRD §20 / Expo §25). Append-only. */
export function recordAudit(ctx: Ctx | null, e: EventInput, actor?: AuditEvent["actor"]): AuditEvent {
  const event: AuditEvent = {
    id: newId("aud"),
    at: e.at ?? new Date().toISOString(),
    actor: actor ?? (ctx ? { type: "user", id: ctx.user.id, name: ctx.user.name, role: ctx.role } : { type: "system", id: "system", name: "Fabrik" }),
    ...e,
  };
  db().audit.push(event);
  return event;
}

export function auditFor(orgId: string, entityId: string): AuditEvent[] {
  return db()
    .audit.filter((a) => a.orgId === orgId && a.entity.id === entityId)
    .sort((a, b) => a.at.localeCompare(b.at));
}
