import { authorize } from "@/server/auth/session";
import { sampleJohnDeereInvoice } from "@/server/pdf";

/** Synthetic sample used in the Expo "Document AI" step. */
export async function GET() {
  try {
    await authorize("documents:read");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(new Uint8Array(await sampleJohnDeereInvoice()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="JohnDeere_Invoice_JD-28712.pdf"' } });
}
