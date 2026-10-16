ALTER TABLE users ADD COLUMN email text;
ALTER TABLE memberships ADD COLUMN start_date date;
CREATE TABLE staff_imports (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed','committed')),
  source_hash text NOT NULL,
  rows jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  committed_at timestamptz,
  FOREIGN KEY (tenant_id,created_by) REFERENCES memberships(tenant_id,id)
);
CREATE INDEX staff_imports_tenant_created_idx ON staff_imports(tenant_id,created_at DESC);
