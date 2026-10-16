CREATE TABLE sop_events (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, instance_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), key uuid NOT NULL, request jsonb NOT NULL,
 state jsonb NOT NULL, actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,instance_id,revision), UNIQUE(tenant_id,instance_id,key),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,id)
);
ALTER TABLE sop_instances ADD UNIQUE(tenant_id,id);
ALTER TABLE sop_events ADD FOREIGN KEY(tenant_id,instance_id) REFERENCES sop_instances(tenant_id,id);
CREATE TRIGGER sop_event_immutable BEFORE UPDATE OR DELETE ON sop_events FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
CREATE TABLE issues (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), branch_id uuid NOT NULL,
 reporter_id uuid NOT NULL, instance_id uuid, item_position integer, content jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id),
 FOREIGN KEY(tenant_id,reporter_id) REFERENCES memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,instance_id) REFERENCES sop_instances(tenant_id,id)
);
CREATE TRIGGER issue_immutable BEFORE UPDATE OR DELETE ON issues FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
CREATE TABLE issue_events (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, issue_id uuid NOT NULL, revision integer NOT NULL,
 key uuid NOT NULL, request jsonb NOT NULL,state jsonb NOT NULL,actor_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,issue_id,revision), UNIQUE(tenant_id,issue_id,key),
 FOREIGN KEY(tenant_id,issue_id) REFERENCES issues(tenant_id,id), FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,id)
);
CREATE TRIGGER issue_event_immutable BEFORE UPDATE OR DELETE ON issue_events FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
CREATE TABLE schedule_stops (
 tenant_id uuid NOT NULL, schedule_id uuid NOT NULL, actor_id uuid NOT NULL, reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,schedule_id),
 FOREIGN KEY(tenant_id,schedule_id) REFERENCES sop_schedules(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,id)
);
CREATE TRIGGER schedule_stop_immutable BEFORE UPDATE OR DELETE ON schedule_stops FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
CREATE INDEX sop_event_latest ON sop_events(tenant_id,instance_id,revision DESC);
CREATE INDEX issue_event_latest ON issue_events(tenant_id,issue_id,revision DESC);
CREATE INDEX issues_branch ON issues(tenant_id,branch_id,created_at DESC);
