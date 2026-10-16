import { NextResponse } from "next/server";
import { getCtx } from "@/server/auth/session";
import { search } from "@/server/services/admin";

export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ results: search(ctx, q.slice(0, 100)) });
}
