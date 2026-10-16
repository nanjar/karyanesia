CREATE TABLE tenants (
  id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id uuid PRIMARY KEY, full_name text NOT NULL, password_hash text,
  active boolean NOT NULL DEFAULT true, mfa_secret text, mfa_last_step bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE branches (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL, name text NOT NULL,
  timezone text NOT NULL CHECK(timezone IN ('Asia/Jakarta','Asia/Makassar','Asia/Jayapura')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,code)
);
CREATE TABLE jobs (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,code)
);
CREATE TABLE memberships (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id),
  employee_number text NOT NULL, branch_id uuid, job_id uuid, supervisor_id uuid,
  role text NOT NULL CHECK(role IN ('OWNER','ADMIN','HR','OPERATIONS','SUPERVISOR','STAFF')),
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,employee_number), UNIQUE(tenant_id,user_id),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id),
  FOREIGN KEY(tenant_id,job_id) REFERENCES jobs(tenant_id,id),
  FOREIGN KEY(tenant_id,supervisor_id) REFERENCES memberships(tenant_id,id),
  CHECK(supervisor_id IS NULL OR supervisor_id <> id)
);
CREATE TABLE branch_grants (
  tenant_id uuid NOT NULL, membership_id uuid NOT NULL, branch_id uuid NOT NULL,
  PRIMARY KEY(tenant_id,membership_id,branch_id),
  FOREIGN KEY(tenant_id,membership_id) REFERENCES memberships(tenant_id,id),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, tenant_id uuid NOT NULL, membership_id uuid NOT NULL,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,membership_id) REFERENCES memberships(tenant_id,id)
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE activation_tokens (
  token_hash text PRIMARY KEY, tenant_id uuid NOT NULL, membership_id uuid NOT NULL,
  expires_at timestamptz NOT NULL, used_at timestamptz,
  FOREIGN KEY(tenant_id,membership_id) REFERENCES memberships(tenant_id,id)
);
CREATE TABLE rate_limits (
  key text PRIMARY KEY, hits integer NOT NULL, reset_at timestamptz NOT NULL
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), actor_id uuid,
  action text NOT NULL, object_id uuid, correlation_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,id)
);
CREATE INDEX memberships_branch_idx ON memberships(tenant_id,branch_id,id);
CREATE INDEX audit_tenant_time_idx ON audit_events(tenant_id,created_at DESC);
-- The runtime role must not own tables. See the runbook for deployment grants.
-- Audit rows are append-only, including when an owner accidentally grants writes.
CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit events are append-only'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
