CREATE TABLE practice_rubrics (
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
CREATE TRIGGER practice_rubric_immutable BEFORE UPDATE OR DELETE ON practice_rubrics FOR EACH ROW EXECUTE FUNCTION protect_learning_version();
ALTER TABLE onboarding_path_modules ADD rubric_version_id uuid;
ALTER TABLE onboarding_path_modules ADD FOREIGN KEY(tenant_id,rubric_version_id) REFERENCES practice_rubrics(tenant_id,id);
CREATE INDEX practice_rubrics_tenant ON practice_rubrics(tenant_id,created_at DESC);
