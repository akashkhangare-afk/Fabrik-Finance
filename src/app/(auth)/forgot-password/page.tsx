import { ForgotForm } from "@/components/auth/forms";
import { demoMode } from "@/server/config";

export const metadata = { title: "Reset password" };

export default function ForgotPage() {
  return <ForgotForm demo={demoMode()} />;
}
