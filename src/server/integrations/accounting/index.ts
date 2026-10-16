import "server-only";
import type { ID } from "@/lib/types";
import { db } from "@/server/db/store";
import type { AccountingProvider } from "./provider";
import { SyntheticQuickBooksProvider } from "./synthetic-qbo";
import { LiveQuickBooksProvider } from "./qbo-live";

const synthetic = new SyntheticQuickBooksProvider();
const live = new LiveQuickBooksProvider();

/** Resolves the accounting system of record for an organization. */
export function accountingProvider(orgId: ID): AccountingProvider {
  const conn = db().connections.find((c) => c.orgId === orgId && c.provider === "quickbooks_online");
  return conn?.mode === "live" ? live : synthetic;
}
