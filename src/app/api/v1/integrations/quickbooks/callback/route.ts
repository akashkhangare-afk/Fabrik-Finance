import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorize } from "@/server/auth/session";
import { exchangeCode } from "@/server/integrations/accounting/qbo-live";
import { commit, db } from "@/server/db/store";
import { newId } from "@/server/db/ids";
import { recordAudit } from "@/server/services/audit";

export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await authorize("integrations:manage");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("qbo_oauth_state")?.value;
  jar.delete("qbo_oauth_state");
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  if (!expected || state !== expected || !code || !realmId) return NextResponse.redirect(new URL("/integrations?qbo=state_mismatch", req.url));
  try {
    const tokensEnc = await exchangeCode(code);
    const data = db();
    let conn = data.connections.find((c) => c.orgId === ctx.org.id && c.provider === "quickbooks_online");
    if (!conn) {
      conn = { id: newId("conn"), orgId: ctx.org.id, provider: "quickbooks_online", mode: "live", status: "connected" };
      data.connections.push(conn);
    }
    Object.assign(conn, { mode: "live", status: "connected", realmId, tokensEnc, connectedAt: new Date().toISOString(), connectedBy: ctx.user.id });
    recordAudit(ctx, { orgId: ctx.org.id, action: "integration.connected", entity: { type: "integration", id: conn.id, label: "QuickBooks Online (live)" }, after: { realmId } });
    commit();
    return NextResponse.redirect(new URL("/integrations?qbo=connected", req.url));
  } catch {
    return NextResponse.redirect(new URL("/integrations?qbo=exchange_failed", req.url));
  }
}
