ALTER TABLE learning_attempts ADD assignment_id uuid;
ALTER TABLE learning_attempts ADD FOREIGN KEY(tenant_id,assignment_id,membership_id) REFERENCES onboarding_assignments(tenant_id,id,membership_id);
CREATE INDEX learning_attempts_assignment ON learning_attempts(tenant_id,assignment_id);
