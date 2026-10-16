import { authorize } from "@/server/auth/session";
import { documentBytes } from "@/server/services/documents";
import { recordAudit } from "@/server/services/audit";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authorize("documents:read");
    const { id } = await params;
    const f = await documentBytes(ctx, id);
    const download = new URL(req.url).searchParams.get("download") === "1";
    recordAudit(ctx, { orgId: ctx.org.id, action: "document.viewed", entity: { type: "document", id, label: f.filename } });
    return new Response(new Uint8Array(f.bytes), {
      headers: {
        "Content-Type": f.mime,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${f.filename.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        // Images get a locked-down sandbox; PDFs need the browser's viewer, which a sandbox CSP disables.
        ...(f.mime === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" }),
        "Cache-Control": "private, no-store",
        ...(f.synthetic ? { "X-Fabrik-Synthetic": "true" } : {}),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
