import type { Role } from "@/lib/types";

/**
 * RBAC (PRD §3: "RBAC should be implemented from the beginning"). Least privilege: each role gets
 * only what its workflow needs. Checked server-side on every mutation; the UI only mirrors it.
 */
export type Permission =
  | "dashboard:read"
  | "inbox:read"
  | "inbox:respond"
  | "inbox:ask_client"
  | "transactions:read"
  | "transactions:review"
  | "transactions:bulk_approve"
  | "rules:manage"
  | "reports:read"
  | "reports:export"
  | "reconciliation:read"
  | "reconciliation:work"
  | "reconciliation:approve"
  | "close:read"
  | "close:work"
  | "close:approve"
  | "documents:read"
  | "documents:upload"
  | "documents:match"
  | "bills:read"
  | "bills:approve"
  | "collect:read"
  | "collect:draft_reminder"
  | "collect:approve_reminder"
  | "funding:read"
  | "funding:edit_profile"
  | "cfo:read"
  | "cfo:scenarios"
  | "ask:use"
  | "tax:read"
  | "tax:manage"
  | "integrations:read"
  | "integrations:manage"
  | "team:read"
  | "team:manage"
  | "settings:manage"
  | "audit:read"
  | "ops:access"
  | "ops:assign"
  | "admin:manage"
  | "admin:reset_demo";

const CLIENT_BASE: Permission[] = [
  "dashboard:read",
  "inbox:read",
  "inbox:respond",
  "transactions:read",
  "reports:read",
  "reports:export",
  "reconciliation:read",
  "close:read",
  "documents:read",
  "documents:upload",
  "documents:match",
  "bills:read",
  "collect:read",
  "funding:read",
  "cfo:read",
  "cfo:scenarios",
  "ask:use",
  "tax:read",
  "integrations:read",
  "team:read",
  "audit:read",
];

const STAFF_BASE: Permission[] = [
  ...CLIENT_BASE,
  "inbox:ask_client",
  "transactions:review",
  "transactions:bulk_approve",
  "rules:manage",
  "reconciliation:work",
  "close:work",
  "collect:draft_reminder",
  "tax:manage",
  "ops:access",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  business_owner: [
    ...CLIENT_BASE,
    "transactions:review",
    "bills:approve",
    "collect:draft_reminder",
    "collect:approve_reminder",
    "funding:edit_profile",
    "integrations:manage",
    "team:manage",
    "settings:manage",
  ],
  client_finance_user: [...CLIENT_BASE, "transactions:review", "bills:approve", "collect:draft_reminder", "collect:approve_reminder", "funding:edit_profile"],
  external_accountant: ["dashboard:read", "transactions:read", "reports:read", "reports:export", "reconciliation:read", "close:read", "documents:read", "documents:upload", "tax:read", "tax:manage", "ask:use", "audit:read", "inbox:read", "inbox:respond"],
  fabrik_bookkeeper: STAFF_BASE,
  fabrik_reviewer: [...STAFF_BASE, "reconciliation:approve", "close:approve", "ops:assign"],
  fabrik_admin: [...STAFF_BASE, "reconciliation:approve", "close:approve", "ops:assign", "admin:manage", "admin:reset_demo", "integrations:manage", "team:manage", "settings:manage"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  business_owner: "Business Owner",
  client_finance_user: "Client Finance User",
  external_accountant: "External Accountant / CPA",
  fabrik_bookkeeper: "Fabrik Bookkeeper",
  fabrik_reviewer: "Fabrik Reviewer",
  fabrik_admin: "Fabrik Admin",
};

export function isStaffRole(role: Role): boolean {
  return role.startsWith("fabrik_");
}

export class ForbiddenError extends Error {
  constructor(public permission: string) {
    super(`Forbidden: missing permission ${permission}`);
  }
}
