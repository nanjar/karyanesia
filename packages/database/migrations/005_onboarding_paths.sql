CREATE TABLE onboarding_paths (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 module_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),
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
CREATE TRIGGER onboarding_path_immutable BEFORE UPDATE OR DELETE ON onboarding_paths FOR EACH ROW EXECUTE FUNCTION protect_learning_version();
CREATE TABLE onboarding_path_modules (
 tenant_id uuid NOT NULL,
 path_id uuid NOT NULL,
 position integer NOT NULL CHECK(position>0),
 version_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,path_id,position),
 UNIQUE(tenant_id,path_id,version_id),
 FOREIGN KEY(tenant_id,path_id) REFERENCES onboarding_paths(tenant_id,id),
 FOREIGN KEY(tenant_id,version_id) REFERENCES learning_versions(tenant_id,id)
);
CREATE FUNCTION protect_path_module() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Path references are immutable'; END IF;
 PERFORM id FROM onboarding_paths WHERE tenant_id=NEW.tenant_id AND id=NEW.path_id AND status='draft' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Path must be a draft'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER path_module_immutable BEFORE INSERT OR UPDATE OR DELETE ON onboarding_path_modules FOR EACH ROW EXECUTE FUNCTION protect_path_module();
CREATE INDEX onboarding_paths_tenant ON onboarding_paths(tenant_id,created_at DESC);
