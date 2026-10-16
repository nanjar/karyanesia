CREATE TABLE practice_requests (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 assignment_id uuid NOT NULL,
 membership_id uuid NOT NULL,
 step_position integer NOT NULL CHECK(step_position BETWEEN 1 AND 20),
 sequence integer NOT NULL CHECK(sequence>0),
 kind text NOT NULL CHECK(kind IN ('practice','review')),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 2000),
 based_on uuid,
 idempotency_key uuid NOT NULL,
 input_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,assignment_id,step_position,id),
 UNIQUE(tenant_id,assignment_id,step_position,sequence),
 UNIQUE(tenant_id,membership_id,idempotency_key),
 FOREIGN KEY(tenant_id,assignment_id,membership_id) REFERENCES onboarding_assignments(tenant_id,id,membership_id),
 FOREIGN KEY(tenant_id,assignment_id,step_position,based_on) REFERENCES practice_assessments(tenant_id,assignment_id,step_position,id),
 CHECK(kind<>'review' OR based_on IS NOT NULL)
);
CREATE TRIGGER practice_request_immutable BEFORE UPDATE OR DELETE ON practice_requests FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
ALTER TABLE practice_assessments ADD request_id uuid;
ALTER TABLE practice_assessments ADD UNIQUE(tenant_id,request_id);
ALTER TABLE practice_assessments ADD FOREIGN KEY(tenant_id,assignment_id,step_position,request_id) REFERENCES practice_requests(tenant_id,assignment_id,step_position,id);
CREATE INDEX practice_requests_latest ON practice_requests(tenant_id,assignment_id,step_position,sequence DESC);
