CREATE TABLE onboarding_assignment_batches (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 path_version_id uuid NOT NULL,
 created_by uuid NOT NULL,
 start_date date NOT NULL,
 targets jsonb NOT NULL,
 path_snapshot jsonb NOT NULL,
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,path_version_id) REFERENCES onboarding_paths(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,id)
);
CREATE TABLE onboarding_assignments (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 batch_id uuid NOT NULL,
 path_version_id uuid NOT NULL,
 membership_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 start_date date NOT NULL,
 timezone text NOT NULL,
 snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','cancelled')),
 cancel_reason text,
 cancelled_by uuid,
 cancelled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,batch_id,membership_id),
 FOREIGN KEY(tenant_id,batch_id) REFERENCES onboarding_assignment_batches(tenant_id,id),
 FOREIGN KEY(tenant_id,path_version_id) REFERENCES onboarding_paths(tenant_id,id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id),
 FOREIGN KEY(tenant_id,cancelled_by) REFERENCES memberships(tenant_id,id),
 CHECK((status='assigned' AND cancel_reason IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL) OR
 (status='cancelled' AND length(trim(cancel_reason)) BETWEEN 10 AND 1000 AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL))
);
CREATE FUNCTION protect_onboarding_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Assignment history cannot be deleted'; END IF;
 IF OLD.status='cancelled' OR NEW.status<>'cancelled' OR
 (to_jsonb(NEW)-ARRAY['status','cancel_reason','cancelled_by','cancelled_at']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['status','cancel_reason','cancelled_by','cancelled_at']) THEN
 RAISE EXCEPTION 'Only cancellation is allowed; assignment snapshots are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER onboarding_assignment_immutable BEFORE UPDATE OR DELETE ON onboarding_assignments FOR EACH ROW EXECUTE FUNCTION protect_onboarding_assignment();
CREATE INDEX onboarding_assignments_member ON onboarding_assignments(tenant_id,membership_id,created_at DESC);
