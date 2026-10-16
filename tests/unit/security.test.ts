import { beforeAll, describe, expect, it } from "vitest";
import { db, resetDb } from "@/server/db/store";
import { roleInOrg, accessibleOrgs } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { hashPassword, verifyPassword, checkPasswordPolicy } from "@/server/auth/password";
import { encrypt, decrypt, signedValue, verifySigned } from "@/server/auth/crypto";
import { totp, verifyTotp } from "@/server/auth/totp";
import { getTxn, NotFoundError } from "@/server/services/transactions";
import { getDoc } from "@/server/services/documents";
import { ctxFor } from "./helpers";

beforeAll(() => {
  resetDb();
});

describe("Tenant isolation", () => {
  it("client users only see their own organization", () => {
    const dan = db().users.find((u) => u.id === "usr_dan")!;
    expect(accessibleOrgs(dan).map((o) => o.id)).toEqual(["org_smith"]);
    expect(roleInOrg(dan, "org_acme")).toBeNull();
  });

  it("staff only access assigned clients; admins see all", () => {
    const sarah = db().users.find((u) => u.id === "usr_sarah")!;
    const priya = db().users.find((u) => u.id === "usr_priya")!;
    const assigned = db().organizations.filter((o) => o.assignedBookkeeperId === "usr_sarah" || o.assignedReviewerId === "usr_sarah" || o.dedicatedAccountantId === "usr_sarah");
    expect(accessibleOrgs(sarah).length).toBe(assigned.length);
    expect(roleInOrg(sarah, "org_landco")).toBeNull();
    expect(accessibleOrgs(priya).length).toBe(db().organizations.length);
  });

  it("records from another tenant are indistinguishable from missing", () => {
    const ctx = ctxFor("usr_dan");
    const foreign = db().transactions.find((t) => t.orgId !== "org_smith")!;
    expect(() => getTxn(ctx, foreign.id)).toThrow(NotFoundError);
    const foreignDoc = db().documents.find((d) => d.orgId !== "org_smith");
    if (foreignDoc) expect(() => getDoc(ctx, foreignDoc.id)).toThrow();
  });

  it("disabled users lose access", () => {
    const u = { ...db().users.find((x) => x.id === "usr_dan")!, status: "disabled" as const };
    expect(roleInOrg(u, "org_smith")).toBeNull();
  });
});

describe("RBAC (least privilege)", () => {
  it("only reviewers/admins approve reconciliations and close", () => {
    expect(can("fabrik_bookkeeper", "reconciliation:approve")).toBe(false);
    expect(can("fabrik_reviewer", "close:approve")).toBe(true);
    expect(can("business_owner", "close:approve")).toBe(false);
  });
  it("CPA is read-mostly; owner manages the team; only admins reset demo", () => {
    expect(can("external_accountant", "bills:approve")).toBe(false);
    expect(can("external_accountant", "tax:manage")).toBe(true);
    expect(can("business_owner", "team:manage")).toBe(true);
    expect(can("client_finance_user", "team:manage")).toBe(false);
    expect(can("fabrik_reviewer", "admin:reset_demo")).toBe(false);
    expect(can("fabrik_admin", "admin:reset_demo")).toBe(true);
  });
  it("client roles can't reach the operations portal", () => {
    for (const r of ["business_owner", "client_finance_user", "external_accountant"] as const) expect(can(r, "ops:access")).toBe(false);
  });
});

describe("Credentials, MFA and secrets", () => {
  it("hashes passwords with scrypt and enforces policy", () => {
    const h = hashPassword("Correct-Horse-9");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Correct-Horse-9", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    expect(checkPasswordPolicy("short").ok).toBe(false);
  });
  it("encrypts at rest with AES-GCM and detects tampering", () => {
    const c = encrypt("refresh-token-xyz");
    expect(c).not.toContain("refresh");
    expect(decrypt(c)).toBe("refresh-token-xyz");
    const parts = c.split(".");
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("A") ? "B" : "A") + "A";
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("signs session cookies", () => {
    const s = signedValue("abc");
    expect(verifySigned(s)).toBe("abc");
    expect(verifySigned(s.replace("abc", "abd"))).toBeNull();
  });
  it("implements RFC 6238 TOTP (test vector)", () => {
    // RFC 6238 SHA-1 vector: secret "12345678901234567890" → base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ, T=59s → 287082 (6 digits)
    expect(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082");
    expect(verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 59_000)).toBe(true);
    expect(verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "000000", 59_000)).toBe(false);
  });
});
