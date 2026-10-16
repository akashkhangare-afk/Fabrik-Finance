import type { DB, StaffRole, User } from "@/lib/types";
import { hashPassword } from "@/server/auth/password";
import { encrypt } from "@/server/auth/crypto";

export const DEMO_PASSWORD = "FabrikDemo!2026";
/** Well-known demo TOTP secret for the admin account (demo mode shows the live code on the MFA screen). */
export const DEMO_MFA_SECRET = "JBSWY3DPEHPK3PXP";

export interface DemoAccount {
  id: string;
  email: string;
  name: string;
  title: string;
  staffRole?: StaffRole;
  hue: number;
  mfa?: boolean;
  persona: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { id: "usr_dan", email: "dan@smithfamilyfarms.example", name: "Dan Smith", title: "Managing Member", hue: 145, persona: "Business owner" },
  { id: "usr_karen", email: "karen@smithfamilyfarms.example", name: "Karen Smith", title: "Office & Finance Manager", hue: 25, persona: "Client finance user" },
  { id: "usr_linda", email: "linda@parkcpa.example", name: "Linda Park, CPA", title: "External CPA", hue: 260, persona: "External accountant / CPA" },
  { id: "usr_sarah", email: "sarah.chen@fabrik.example", name: "Sarah Chen", title: "Senior Bookkeeper", staffRole: "fabrik_bookkeeper", hue: 190, persona: "Fabrik bookkeeper" },
  { id: "usr_marcus", email: "marcus.reed@fabrik.example", name: "Marcus Reed", title: "Accounting Reviewer", staffRole: "fabrik_reviewer", hue: 210, persona: "Fabrik reviewer" },
  { id: "usr_priya", email: "priya.nair@fabrik.example", name: "Priya Nair", title: "Operations Admin", staffRole: "fabrik_admin", hue: 330, mfa: true, persona: "Fabrik admin (MFA enabled)" },
  { id: "usr_tom", email: "tom.alvarez@fabrik.example", name: "Tom Alvarez", title: "Bookkeeper", staffRole: "fabrik_bookkeeper", hue: 40, persona: "Fabrik bookkeeper" },
  { id: "usr_jess", email: "jess.kim@fabrik.example", name: "Jess Kim", title: "Bookkeeper", staffRole: "fabrik_bookkeeper", hue: 290, persona: "Fabrik bookkeeper" },
  { id: "usr_elena", email: "elena.rossi@fabrik.example", name: "Elena Rossi", title: "Accounting Reviewer", staffRole: "fabrik_reviewer", hue: 0, persona: "Fabrik reviewer" },
];

export function seedPeople(db: DB, now: string): void {
  // One hash reused for every demo account keeps reseeding fast; each still verifies independently.
  const hash = hashPassword(DEMO_PASSWORD);
  for (const a of DEMO_ACCOUNTS) {
    const u: User = {
      id: a.id,
      email: a.email,
      name: a.name,
      title: a.title,
      passwordHash: hash,
      mfaEnabled: Boolean(a.mfa),
      mfaSecretEnc: a.mfa ? encrypt(DEMO_MFA_SECRET) : undefined,
      staffRole: a.staffRole,
      status: "active",
      avatarHue: a.hue,
      createdAt: "2025-11-03T15:00:00.000Z",
      lastLoginAt: now,
      notificationPrefs: { email: true, inApp: true, digest: "realtime" },
    };
    db.users.push(u);
  }
  db.memberships.push(
    { id: "mem_dan", userId: "usr_dan", orgId: "org_smith", role: "business_owner", createdAt: "2025-11-03T15:00:00.000Z" },
    { id: "mem_karen", userId: "usr_karen", orgId: "org_smith", role: "client_finance_user", invitedBy: "usr_dan", createdAt: "2025-11-04T15:00:00.000Z" },
    { id: "mem_linda", userId: "usr_linda", orgId: "org_smith", role: "external_accountant", invitedBy: "usr_dan", createdAt: "2025-11-20T15:00:00.000Z" },
  );
}
