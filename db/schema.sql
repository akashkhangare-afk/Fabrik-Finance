-- Fabrik Finance — PostgreSQL target schema (PRD §27: PostgreSQL system for Fabrik's own data).
-- QuickBooks Online remains the accounting system of record; these tables hold the mirrored
-- ledger, AI suggestions, workflow state and audit history. Mirrors src/lib/types.ts.
-- Tenant isolation: every tenant table carries org_id and is protected by row-level security
-- keyed on the application setting `app.org_id` (set per request after authorization).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE role AS ENUM ('business_owner','client_finance_user','external_accountant','fabrik_bookkeeper','fabrik_reviewer','fabrik_admin');
CREATE TYPE txn_status AS ENUM ('processed','needs_review','waiting_for_client','approved','excluded');
CREATE TYPE close_frequency AS ENUM ('monthly','quarterly','annual');

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text NOT NULL,
  industry text,
  state char(2),
  plan text NOT NULL DEFAULT 'growth',
  status text NOT NULL DEFAULT 'active',
  close_frequency close_frequency NOT NULL DEFAULT 'monthly',
  assigned_bookkeeper_id uuid,
  assigned_reviewer_id uuid,
  dedicated_accountant_id uuid,
  auto_approve_threshold numeric(4,3) NOT NULL DEFAULT 0.980,
  review_threshold numeric(4,3) NOT NULL DEFAULT 0.850,
  large_transaction_threshold_cents bigint NOT NULL DEFAULT 1000000,
  reporting_basis text NOT NULL DEFAULT 'accrual',
  fiscal_year_start_month smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (auto_approve_threshold > review_threshold)
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  name text NOT NULL,
  title text,
  password_hash text,               -- null when an external IdP (Auth0/Cognito) is used
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret_enc text,              -- AES-256-GCM ciphertext
  staff_role role CHECK (staff_role IN ('fabrik_bookkeeper','fabrik_reviewer','fabrik_admin')),
  status text NOT NULL DEFAULT 'active',
  notification_prefs jsonb NOT NULL DEFAULT '{"email":true,"inApp":true,"digest":"realtime"}',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role role NOT NULL CHECK (role IN ('business_owner','client_finance_user','external_accountant')),
  invited_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_org_id uuid REFERENCES organizations(id),
  mfa_pending boolean NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  user_agent text
);

CREATE TABLE gl_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  subtype text NOT NULL,
  cash_flow_section text,
  sensitive boolean NOT NULL DEFAULT false,
  external_id text,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, external_id)
);

CREATE TABLE bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL, institution text, mask text, kind text NOT NULL,
  gl_account_id uuid NOT NULL REFERENCES gl_accounts(id),
  external_id text, UNIQUE (org_id, external_id)
);

CREATE TABLE vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL, aliases text[] NOT NULL DEFAULT '{}', default_account_id uuid REFERENCES gl_accounts(id),
  external_id text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (org_id, external_id)
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL, contact_name text, email citext, terms_days int NOT NULL DEFAULT 30, avg_days_late int NOT NULL DEFAULT 0,
  external_id text, UNIQUE (org_id, external_id)
);

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  external_id text NOT NULL,                       -- QBO id: upsert key (duplicate prevention)
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id),
  date date NOT NULL,
  description text NOT NULL,
  amount_cents bigint NOT NULL,                    -- negative = outflow
  vendor_id uuid REFERENCES vendors(id),
  customer_id uuid REFERENCES customers(id),
  account_id uuid REFERENCES gl_accounts(id),      -- final category; null while under review
  type text NOT NULL,
  status txn_status NOT NULL,
  ai jsonb,                                        -- AISuggestion (model, version, confidence, explanation…)
  risk jsonb,                                      -- RiskAssessment
  memo text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  sync_state text NOT NULL DEFAULT 'synced',
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, external_id)
);
CREATE INDEX ON transactions (org_id, date DESC);
CREATE INDEX ON transactions (org_id, status) WHERE status IN ('needs_review','waiting_for_client');
CREATE INDEX ON transactions (org_id, vendor_id);

CREATE TABLE transaction_splits (
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES gl_accounts(id),
  amount_cents bigint NOT NULL,
  memo text
);

CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  date date NOT NULL, memo text, source text NOT NULL, external_id text,
  lines jsonb NOT NULL                               -- [{accountId, debit, credit}] — must balance
);

CREATE TABLE categorization_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  kind text NOT NULL CHECK (kind IN ('vendor','amount','description','recurring','organization')),
  label text NOT NULL, match jsonb NOT NULL, account_id uuid NOT NULL REFERENCES gl_accounts(id),
  created_by uuid REFERENCES users(id), created_from text NOT NULL, hits int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE risk_rules (key text PRIMARY KEY, label text NOT NULL, description text, enabled boolean NOT NULL DEFAULT true, weight int NOT NULL);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  filename text NOT NULL, mime_type text NOT NULL, size_bytes int NOT NULL,
  storage_key text,                                  -- s3://bucket/org_id/doc_id.ext
  kind text NOT NULL, status text NOT NULL,
  extraction jsonb, match jsonb, tags text[] NOT NULL DEFAULT '{}', period text,
  uploaded_by uuid REFERENCES users(id), uploaded_at timestamptz NOT NULL DEFAULT now(), error text
);
CREATE TABLE transaction_documents (transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE, document_id uuid REFERENCES documents(id) ON DELETE CASCADE, PRIMARY KEY (transaction_id, document_id));

CREATE TABLE bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  vendor_id uuid NOT NULL REFERENCES vendors(id), number text NOT NULL,
  issue_date date NOT NULL, due_date date NOT NULL, amount_cents bigint NOT NULL,
  account_id uuid NOT NULL REFERENCES gl_accounts(id), status text NOT NULL, source text NOT NULL,
  document_id uuid REFERENCES documents(id), history jsonb NOT NULL DEFAULT '[]', external_id text
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  customer_id uuid NOT NULL REFERENCES customers(id), number text NOT NULL,
  issue_date date NOT NULL, due_date date NOT NULL, amount_cents bigint NOT NULL, amount_paid_cents bigint NOT NULL DEFAULT 0,
  account_id uuid NOT NULL REFERENCES gl_accounts(id), memo text, external_id text
);
CREATE TABLE collection_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  subject text NOT NULL, body text NOT NULL, tone text NOT NULL, status text NOT NULL,
  created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES users(id), approved_at timestamptz, sent_at timestamptz
);

CREATE TABLE inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  type text NOT NULL, title text NOT NULL, body text NOT NULL, status text NOT NULL, priority text NOT NULL,
  related_type text, related_id uuid, options jsonb, response jsonb,
  created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, period text
);
CREATE INDEX ON inbox_items (org_id, status);

CREATE TABLE close_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  period text NOT NULL, status text NOT NULL, manual jsonb NOT NULL DEFAULT '{}',
  target_close_date date NOT NULL, closed_at timestamptz, package_generated_at timestamptz,
  UNIQUE (org_id, period)
);

CREATE TABLE reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id), period text NOT NULL,
  statement_start_cents bigint NOT NULL, statement_end_cents bigint NOT NULL, statement_date date NOT NULL,
  status text NOT NULL, statement_document_id uuid REFERENCES documents(id),
  outstanding_transaction_ids uuid[] NOT NULL DEFAULT '{}',
  prepared_by uuid REFERENCES users(id), approved_by uuid REFERENCES users(id), approved_at timestamptz,
  UNIQUE (bank_account_id, period)
);
CREATE TABLE statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id uuid NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
  date date NOT NULL, description text NOT NULL, amount_cents bigint NOT NULL,
  state text NOT NULL, transaction_id uuid REFERENCES transactions(id), confidence numeric(4,3), note text
);

CREATE TABLE work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL, auto boolean NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  type text NOT NULL, title text NOT NULL, priority text NOT NULL, status text NOT NULL,
  assignee_id uuid REFERENCES users(id), period text, count int, href text,
  created_at timestamptz NOT NULL DEFAULT now(), due_at timestamptz
);

-- Append-only audit log (PRD §20). Revoke UPDATE/DELETE from the application role.
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id),
  at timestamptz NOT NULL DEFAULT now(),
  actor_type text NOT NULL, actor_id text NOT NULL, actor_name text NOT NULL, actor_role role,
  action text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL, entity_label text,
  before jsonb, after jsonb, ai jsonb, risk jsonb, comment text, human_seconds int, ip inet
);
CREATE INDEX ON audit_events (org_id, entity_id, at);
CREATE INDEX ON audit_events (org_id, at) WHERE human_seconds IS NOT NULL;

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id), user_id uuid REFERENCES users(id),
  kind text NOT NULL, title text NOT NULL, body text, href text, bundle_key text UNIQUE, count int NOT NULL DEFAULT 1,
  read_by uuid[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL, mode text NOT NULL, status text NOT NULL,
  realm_id text, company_name text, tokens_enc text,          -- AES-256-GCM ciphertext, never plaintext
  connected_at timestamptz, connected_by uuid REFERENCES users(id), last_sync_at timestamptz, last_sync_status text,
  UNIQUE (org_id, provider)
);
CREATE TABLE sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  connection_id uuid NOT NULL REFERENCES integration_connections(id),
  trigger text NOT NULL, idempotency_key text NOT NULL, attempt int NOT NULL,
  started_at timestamptz NOT NULL, finished_at timestamptz, status text NOT NULL, entities jsonb NOT NULL DEFAULT '[]', error jsonb,
  UNIQUE (idempotency_key, attempt)
);

-- Funding (program database is global reference data; profiles/watches are tenant data)
CREATE TABLE funding_programs (
  id text PRIMARY KEY, name text NOT NULL, agency text NOT NULL, program_type text NOT NULL, level text NOT NULL,
  description text NOT NULL, geography text, eligible_entities text[], eligible_activities text[],
  financial_criteria text[], agricultural_criteria text[], purpose_tags text[], funding_range text, funding_range_source text,
  deadline text, required_documents text[], official_source_url text NOT NULL, last_verified date, verification_notes text,
  rules jsonb NOT NULL
);
CREATE TABLE farm_profiles (org_id uuid PRIMARY KEY REFERENCES organizations(id), profile jsonb NOT NULL, updated_at timestamptz NOT NULL, updated_by uuid REFERENCES users(id));
CREATE TABLE funding_watches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), program_id text NOT NULL REFERENCES funding_programs(id), status text NOT NULL, note text, updated_at timestamptz NOT NULL, updated_by uuid REFERENCES users(id), UNIQUE (org_id, program_id));

CREATE TABLE ask_threads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id), title text, messages jsonb NOT NULL, context jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE tax_deadlines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), form text, title text, jurisdiction text, due_date date, basis text, source_url text, status text, owner text);
CREATE TABLE tax_document_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), tax_year int, title text, description text, status text, document_id uuid REFERENCES documents(id), requested_at timestamptz, history jsonb NOT NULL DEFAULT '[]');

-- Row-level security for tenant tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gl_accounts','bank_accounts','vendors','customers','transactions','journal_entries','categorization_rules','documents','bills','invoices','inbox_items','close_periods','reconciliations','work_items','integration_connections','sync_runs','farm_profiles','funding_watches','ask_threads','tax_deadlines','tax_document_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (org_id = current_setting(''app.org_id'')::uuid)', t);
  END LOOP;
END $$;
