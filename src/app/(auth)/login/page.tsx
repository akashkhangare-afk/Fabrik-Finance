import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/forms";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/server/db/seed/people";
import { demoMode } from "@/server/config";
import { getCtx } from "@/server/auth/session";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  if (await getCtx()) redirect("/");
  const sp = await searchParams;
  const demo = demoMode() ? DEMO_ACCOUNTS.filter((a) => ["usr_dan", "usr_karen", "usr_linda", "usr_sarah", "usr_marcus", "usr_priya"].includes(a.id)).map((a) => ({ email: a.email, name: a.name, persona: a.persona, mfa: a.mfa })) : undefined;
  return <LoginForm demo={demo} password={demo ? DEMO_PASSWORD : undefined} next={sp.next} resetDone={sp.reset === "1"} />;
}
