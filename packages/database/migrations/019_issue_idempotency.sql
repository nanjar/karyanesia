ALTER TABLE issues ADD COLUMN idempotency_key uuid;
CREATE UNIQUE INDEX issue_submission_key ON issues(tenant_id,reporter_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE worker_streams (
 name text PRIMARY KEY,attempts integer NOT NULL DEFAULT 0,failed boolean NOT NULL DEFAULT false,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO worker_streams(name) VALUES('notifications');
