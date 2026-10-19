import { NextResponse, type NextRequest } from "next/server";

// Screens beyond the PRD stay hidden unless SHOW_EXTRAS=true (same rule as showExtras() in
// src/server/config.ts). Answering here keeps a real 404 status: the pages themselves render
// inside the app's loading boundary, where the response has already started as a 200.
export function proxy(request: NextRequest) {
  if (process.env.SHOW_EXTRAS === "true") return NextResponse.next();
  return NextResponse.rewrite(new URL("/_hidden", request.url));
}

export const config = {
  matcher: ["/tax", "/ops/requirements"],
};
