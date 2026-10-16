import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorize } from "@/server/auth/session";
import { randomToken } from "@/server/auth/crypto";
import { authorizeUrl, qboConfigured } from "@/server/integrations/accounting/qbo-live";

/** Starts the QuickBooks Online OAuth 2.0 flow (CSRF-protected with a state cookie). */
export async function GET(req: Request) {
  try {
    await authorize("integrations:manage");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  if (!qboConfigured()) return NextResponse.redirect(new URL("/integrations?qbo=not_configured", req.url));
  const state = randomToken(24);
  (await cookies()).set("qbo_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/v1/integrations/quickbooks", maxAge: 600 });
  return NextResponse.redirect(authorizeUrl(state));
}
