ALTER TABLE learning_attempts ADD round integer NOT NULL DEFAULT 1 CHECK(round > 0);
CREATE TABLE learning_resets (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 version_id uuid NOT NULL,
 membership_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 round integer NOT NULL CHECK(round > 1),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 1000),
 idempotency_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,version_id,membership_id,round),
 UNIQUE(tenant_id,actor_id,idempotency_key),
 FOREIGN KEY(tenant_id,version_id) REFERENCES learning_versions(tenant_id,id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,id),
 CHECK(membership_id<>actor_id)
);
CREATE TRIGGER learning_reset_immutable BEFORE UPDATE OR DELETE ON learning_resets FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
CREATE INDEX learning_resets_member ON learning_resets(tenant_id,membership_id,version_id);
