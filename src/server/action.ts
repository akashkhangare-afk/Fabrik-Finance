import "server-only";
import { authorize, type Ctx } from "@/server/auth/session";
import { ForbiddenError, type Permission } from "@/server/auth/permissions";
import { NotFoundError, ValidationError } from "@/server/services/transactions";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/** Uniform server-action wrapper: authenticate, check RBAC, translate domain errors into user-safe messages. */
export async function run<T>(permission: Permission, fn: (ctx: Ctx) => Promise<T> | T, message?: string | ((d: T) => string)): Promise<ActionResult<T>> {
  try {
    const ctx = await authorize(permission);
    const data = await fn(ctx);
    return { ok: true, data, message: typeof message === "function" ? message(data) : message };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: e.permission === "authenticated" ? "Your session has ended. Sign in again." : "You don't have permission to do that." };
    if (e instanceof ValidationError || e instanceof NotFoundError) return { ok: false, error: e.message };
    console.error("[action]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
