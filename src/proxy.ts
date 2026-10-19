import { NextResponse, type NextRequest } from "next/server";

// Same name as SESSION_COOKIE in src/server/auth/session.ts (not imported: that module loads the datastore).
const SESSION_COOKIE = "fabrik_session";
const HIDDEN = new Set(["/tax", "/ops/requirements"]);

/**
 * Opening the app from outside it (typed URL, bookmark, new tab, a link in another site or email)
 * always starts at Sign in and ends the earlier session. Browsers mark those page loads with
 * Sec-Fetch-Site "none" / "cross-site"; a reload repeats that value but adds Cache-Control, so
 * reloads and every navigation inside the app keep the user signed in.
 */
function freshVisit(request: NextRequest): boolean {
  const h = request.headers;
  if (request.method !== "GET" || h.get("sec-fetch-dest") !== "document") return false;
  const site = h.get("sec-fetch-site");
  if (site !== "none" && site !== "cross-site") return false;
  return !/max-age=0|no-cache/.test(h.get("cache-control") ?? "");
}

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE) && freshVisit(request)) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
  // Screens beyond the PRD stay hidden unless SHOW_EXTRAS=true (same rule as showExtras() in
  // src/server/config.ts). Answering here keeps a real 404 status: the pages themselves render
  // inside the app's loading boundary, where the response has already started as a 200.
  if (HIDDEN.has(request.nextUrl.pathname) && process.env.SHOW_EXTRAS !== "true") {
    return NextResponse.rewrite(new URL("/_hidden", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Pages only: not API routes (QuickBooks OAuth callback, webhooks), Next assets, files with an
  // extension, or the emailed password-reset and MFA steps, which must keep working when opened.
  matcher: ["/((?!api/|_next/|forgot-password|reset-password|login/mfa|.*\\.[a-z0-9]+$).*)"],
};
