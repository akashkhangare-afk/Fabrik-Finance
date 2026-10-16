import { redirect } from "next/navigation";
import { MfaForm } from "@/components/auth/forms";
import { currentSession } from "@/server/auth/session";
import { demoMode } from "@/server/config";
import { decrypt } from "@/server/auth/crypto";
import { totp } from "@/server/auth/totp";
import { DEMO_MFA_SECRET } from "@/server/db/seed/people";

export const metadata = { title: "Two-factor authentication" };
export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const cur = await currentSession();
  if (!cur?.session.mfaPending) redirect("/login");
  let demoCode: string | undefined;
  if (demoMode() && cur.user.mfaSecretEnc && decrypt(cur.user.mfaSecretEnc) === DEMO_MFA_SECRET) demoCode = totp(DEMO_MFA_SECRET);
  return <MfaForm email={cur.user.email} demoCode={demoCode} />;
}
