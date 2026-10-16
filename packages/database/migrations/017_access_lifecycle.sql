ALTER TABLE memberships ADD COLUMN assessor boolean NOT NULL DEFAULT false;
UPDATE memberships SET assessor=true WHERE role IN ('OWNER','ADMIN','SUPERVISOR');
ALTER TABLE onboarding_assignments ADD COLUMN job_id uuid;
ALTER TABLE onboarding_assignments DISABLE TRIGGER onboarding_assignment_immutable;
UPDATE onboarding_assignments a SET job_id=(SELECT (x->>'job_id')::uuid FROM onboarding_assignment_batches b CROSS JOIN LATERAL jsonb_array_elements(b.targets->'items') x WHERE b.tenant_id=a.tenant_id AND b.id=a.batch_id AND x->>'id'=a.membership_id::text LIMIT 1);
ALTER TABLE onboarding_assignments ENABLE TRIGGER onboarding_assignment_immutable;
ALTER TABLE onboarding_assignments ADD FOREIGN KEY(tenant_id,job_id) REFERENCES jobs(tenant_id,id);
