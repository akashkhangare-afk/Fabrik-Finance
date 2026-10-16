import type { Ctx } from "@/server/auth/session";
import { db } from "@/server/db/store";
import { roleInOrg } from "@/server/auth/session";

/** Builds a request context for a seeded user without going through cookies. */
export function ctxFor(userId: string, orgId = "org_smith"): Ctx {
  const data = db();
  const user = data.users.find((u) => u.id === userId)!;
  const role = roleInOrg(user, orgId);
  if (!role) throw new Error(`${userId} has no access to ${orgId}`);
  const org = data.organizations.find((o) => o.id === orgId)!;
  return {
    user,
    org,
    role,
    isStaff: Boolean(user.staffRole),
    session: { id: "test", userId, activeOrgId: orgId, mfaPending: false, createdAt: "", expiresAt: "", lastSeenAt: "" },
  };
}
