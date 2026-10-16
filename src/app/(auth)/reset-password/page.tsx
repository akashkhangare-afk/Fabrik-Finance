import Link from "next/link";
import { ResetForm } from "@/components/auth/forms";

export const metadata = { title: "Choose a password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string; invite?: string }> }) {
  const sp = await searchParams;
  if (!sp.token)
    return (
      <div>
        <h2 className="text-[24px] font-semibold">Link missing</h2>
        <p className="text-muted mt-2">Open the link from your email, or <Link className="text-brand-700 underline" href="/forgot-password">request a new one</Link>.</p>
      </div>
    );
  return <ResetForm token={sp.token} invite={sp.invite === "1"} />;
}
