CREATE TABLE sop_schedules (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id),
 template_version_id uuid NOT NULL, branch_id uuid NOT NULL,
 content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,template_version_id) REFERENCES sop_templates(tenant_id,id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id)
);
CREATE TRIGGER sop_schedule_immutable BEFORE UPDATE OR DELETE ON sop_schedules FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
CREATE TABLE sop_schedule_runs (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, schedule_id uuid NOT NULL,
 local_date date NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,schedule_id,local_date),
 FOREIGN KEY(tenant_id,schedule_id) REFERENCES sop_schedules(tenant_id,id)
);
CREATE TRIGGER sop_run_immutable BEFORE UPDATE OR DELETE ON sop_schedule_runs FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
CREATE TABLE sop_instances (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, schedule_id uuid NOT NULL,
 local_date date NOT NULL, assignee_id uuid, branch_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('open','unassigned')),
 snapshot jsonb NOT NULL, starts_at timestamptz NOT NULL, due_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(due_at>starts_at), CHECK((status='unassigned')=(assignee_id IS NULL)),
 UNIQUE NULLS NOT DISTINCT(tenant_id,schedule_id,local_date,assignee_id),
 FOREIGN KEY(tenant_id,schedule_id) REFERENCES sop_schedules(tenant_id,id),
 FOREIGN KEY(tenant_id,assignee_id) REFERENCES memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id)
);
CREATE TRIGGER sop_instance_immutable BEFORE UPDATE OR DELETE ON sop_instances FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
CREATE INDEX sop_instances_staff ON sop_instances(tenant_id,assignee_id,due_at);
