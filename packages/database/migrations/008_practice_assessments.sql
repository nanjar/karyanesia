ALTER TABLE onboarding_assignments ADD UNIQUE(tenant_id,id,membership_id);
CREATE TABLE practice_assessments (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 assignment_id uuid NOT NULL,
 membership_id uuid NOT NULL,
 assessor_id uuid NOT NULL,
 step_position integer NOT NULL CHECK(step_position BETWEEN 1 AND 20),
 rubric_version_id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence>0),
 supersedes uuid,
 answers jsonb NOT NULL,
 comment text NOT NULL CHECK(length(trim(comment)) BETWEEN 10 AND 2000),
 training_instructions text NOT NULL,
 correction_reason text NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('competent','needs_practice')),
 idempotency_key uuid NOT NULL,
 input_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,assignment_id,step_position,id),
 UNIQUE(tenant_id,assignment_id,step_position,sequence),
 UNIQUE(tenant_id,assessor_id,idempotency_key),
 FOREIGN KEY(tenant_id,assignment_id,membership_id) REFERENCES onboarding_assignments(tenant_id,id,membership_id),
 FOREIGN KEY(tenant_id,assessor_id) REFERENCES memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,rubric_version_id) REFERENCES practice_rubrics(tenant_id,id),
 FOREIGN KEY(tenant_id,assignment_id,step_position,supersedes) REFERENCES practice_assessments(tenant_id,assignment_id,step_position,id),
 CHECK(assessor_id<>membership_id),
 CHECK((sequence=1 AND supersedes IS NULL) OR (sequence>1 AND supersedes IS NOT NULL AND length(trim(correction_reason))>=10)),
 CHECK(length(training_instructions)<=2000 AND length(correction_reason)<=1000),
 CHECK(outcome<>'needs_practice' OR length(trim(training_instructions))>=10)
);
CREATE TRIGGER practice_assessment_immutable BEFORE UPDATE OR DELETE ON practice_assessments FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
CREATE INDEX practice_assessments_latest ON practice_assessments(tenant_id,assignment_id,step_position,sequence DESC);
