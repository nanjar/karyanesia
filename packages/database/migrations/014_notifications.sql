CREATE TABLE notifications (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,membership_id uuid NOT NULL,dedupe_key text NOT NULL,
 title text NOT NULL,target text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz,
 UNIQUE(tenant_id,membership_id,dedupe_key),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES memberships(tenant_id,id)
);
CREATE INDEX notifications_member ON notifications(tenant_id,membership_id,created_at DESC);
CREATE TABLE worker_jobs (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,schedule_id uuid NOT NULL,local_date date NOT NULL,
 attempts integer NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','failed')),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,schedule_id,local_date),
 FOREIGN KEY(tenant_id,schedule_id) REFERENCES sop_schedules(tenant_id,id)
);
CREATE TABLE worker_heartbeats (name text PRIMARY KEY,last_success_at timestamptz NOT NULL);
