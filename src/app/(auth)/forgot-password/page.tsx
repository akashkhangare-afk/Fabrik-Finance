import { ForgotForm } from "@/components/auth/forms";
import { demoMode } from "@/server/config";

export const metadata = { title: "Reset password" };
// Reads FABRIK_DEMO_MODE at request time rather than at build time.
export const dynamic = "force-dynamic";

export default function ForgotPage() {
  return <ForgotForm demo={demoMode()} />;
}
