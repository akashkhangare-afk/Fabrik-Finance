# Security

Controls required by PRD §26 (general) and Expo §26, and where they live.

| Control | Implementation | Location |
|---|---|---|
| Multi-tenant isolation | Every service lookup is scoped to `ctx.org.id`; foreign IDs return *not found*. Staff see only assigned clients (admins see all). | `server/auth/session.ts` (`roleInOrg`), services `getTxn`/`getDoc`/`getRec`, tests `security.test.ts` |
| RBAC, least privilege | Permission matrix for 6 roles; every server action calls `run(permission, …)`; UI mirrors permissions. | `server/auth/permissions.ts`, `server/action.ts` |
| Authentication | scrypt password hashing, constant-time compare, dummy hash for unknown accounts, generic errors (no enumeration), throttling per email+IP. | `server/auth/password.ts`, `app/actions/auth.ts` |
| MFA | RFC 6238 TOTP (verified against the RFC test vector), ±1 step drift, enrollment with QR, secrets encrypted at rest. | `server/auth/totp.ts` |
| Sessions | Random 192-bit IDs, HMAC-signed httpOnly `SameSite=Lax` cookies (`Secure` in production), 2h idle / 12h absolute expiry, revocation on logout/password reset/removal, fresh ID per sign-in. | `server/auth/session.ts` |
| Encryption at rest | AES-256-GCM for OAuth tokens and MFA secrets (key derived from `ENCRYPTION_KEY` with scrypt). Production must also use encrypted volumes (RDS/S3 KMS). | `server/auth/crypto.ts` |
| Secure OAuth token storage | QBO tokens stored only encrypted on the connection record; never sent to the browser; refreshed server-side. CSRF state cookie on the OAuth flow. | `integrations/accounting/qbo-live.ts`, `api/v1/integrations/quickbooks/*` |
| Secrets management | Secrets only from environment; production refuses to start without `SESSION_SECRET`/`ENCRYPTION_KEY` unless demo mode is explicitly on. Use AWS Secrets Manager in deployment. | `server/auth/crypto.ts` |
| TLS / headers | HSTS (production), CSP, `X-Frame-Options: DENY` (document previews `SAMEORIGIN`), `nosniff`, referrer and permissions policies. TLS terminates at the load balancer. | `next.config.ts` |
| CSRF | Next.js server actions enforce same-origin; route handlers are GET-only reads or OAuth callbacks with state. | framework + routes |
| File uploads | Size limit (15 MB), allow-list by **magic bytes** (PDF/PNG/JPEG/WebP), randomized storage keys outside the web root, served with `nosniff`, sandboxed CSP for images, tenant-checked download route. | `services/documents.ts`, `api/v1/documents/[id]/file` |
| Audit logging | Append-only events for auth, AI suggestions, human decisions (before/after, comment, handling time), matches, reconciliations, close, exports, admin changes. | `services/audit.ts` |
| AI safety | Ask Fabrik is read-only (action requests refused); answers are computed; optional LLM output is discarded if it introduces numbers; funding language never asserts eligibility. | `services/ask.ts`, `ai/gateway.ts` |
| No unnecessary credentials | Fabrik stores no bank or payment credentials. | — |
| Untrusted text | React escapes all rendered text; no `dangerouslySetInnerHTML`. | — |

## Before production

1. Replace the JSON datastore with PostgreSQL + row-level security (`db/schema.sql`), and move login throttling to Redis.
2. Move auth to Auth0/Cognito (OIDC) or keep the built-in flow behind WAF rate limits; enforce MFA for all staff roles.
3. Store uploads in S3 (KMS, private bucket, presigned URLs, malware scanning).
4. Wire email to a transactional provider with SPF/DKIM.
5. Add CSP nonces (removes `'unsafe-inline'` for scripts), dependency scanning, and a penetration test.
6. Set `FABRIK_DEMO_MODE=false` — this hides demo shortcuts and the demo MFA helper.
