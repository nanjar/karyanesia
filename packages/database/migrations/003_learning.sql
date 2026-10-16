CREATE TABLE learning_versions (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 module_id uuid NOT NULL,
 version integer NOT NULL CHECK(version > 0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 content jsonb NOT NULL,
 checksum text NOT NULL,
 author_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,module_id,version),
 FOREIGN KEY(tenant_id,author_id) REFERENCES memberships(tenant_id,id)
);
CREATE FUNCTION protect_learning_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Learning history cannot be deleted'; END IF;
 IF OLD.status <> 'draft' AND (NEW.content IS DISTINCT FROM OLD.content OR NEW.checksum<>OLD.checksum OR NEW.status<>'archived') THEN
  RAISE EXCEPTION 'Published content is immutable';
 END IF;
 IF NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.module_id<>OLD.module_id OR NEW.version<>OLD.version OR NEW.author_id<>OLD.author_id OR NEW.created_at<>OLD.created_at OR (OLD.status<>'draft' AND NEW.published_at IS DISTINCT FROM OLD.published_at) THEN
  RAISE EXCEPTION 'Version identity is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER learning_version_immutable BEFORE UPDATE OR DELETE ON learning_versions FOR EACH ROW EXECUTE FUNCTION protect_learning_version();
CREATE TABLE learning_attempts (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 version_id uuid NOT NULL,
 membership_id uuid NOT NULL,
 idempotency_key uuid NOT NULL,
 answers jsonb NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,membership_id,idempotency_key),
 FOREIGN KEY(tenant_id,version_id) REFERENCES learning_versions(tenant_id,id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES memberships(tenant_id,id)
);
CREATE FUNCTION protect_learning_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Assessment history is append-only'; END $$;
CREATE TRIGGER learning_attempt_immutable BEFORE UPDATE OR DELETE ON learning_attempts FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
CREATE INDEX learning_versions_tenant ON learning_versions(tenant_id,created_at DESC);
CREATE INDEX learning_attempts_member ON learning_attempts(tenant_id,membership_id,version_id);
