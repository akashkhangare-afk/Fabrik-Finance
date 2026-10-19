import Link from "next/link";
import { requireCtx, hasPerm } from "@/server/auth/session";
import { getProfile, profileCompleteness } from "@/server/services/funding";
import { PageHeader, Badge } from "@/components/ui/primitives";
import { ProfileForm } from "@/components/funding/profile-form";
import { prettyDateTime } from "@/lib/dates";
import { showExtras } from "@/server/config";

export const metadata = { title: "Farm profile" };

export default async function ProfilePage() {
  const ctx = await requireCtx();
  const p = getProfile(ctx.org.id);
  const c = profileCompleteness(p);
  return (
    <div className="max-w-[980px]">
      <PageHeader
        eyebrow={<Link href="/funding" className="hover:underline">← Funding</Link>}
        title="Farm / business profile"
        badge={<Badge tone={c.pct === 100 ? "ok" : "warn"}>{c.pct}% complete</Badge>}
      />
      <ProfileForm profile={JSON.parse(JSON.stringify(p))} canEdit={hasPerm(ctx, "funding:edit_profile")} syncedAt={p.financialsSyncedAt ? prettyDateTime(p.financialsSyncedAt) : undefined} extras={showExtras()} />
    </div>
  );
}
