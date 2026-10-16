CREATE TABLE competencies (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES tenants(id),content jsonb NOT NULL,
 module_version_id uuid NOT NULL,rubric_version_id uuid NOT NULL,author_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,module_version_id) REFERENCES learning_versions(tenant_id,id),
 FOREIGN KEY(tenant_id,rubric_version_id) REFERENCES practice_rubrics(tenant_id,id),
 FOREIGN KEY(tenant_id,author_id) REFERENCES memberships(tenant_id,id)
);
CREATE TRIGGER competency_immutable BEFORE UPDATE OR DELETE ON competencies FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
CREATE TABLE job_requirement_versions (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,job_id uuid NOT NULL,revision integer NOT NULL,
 requirements jsonb NOT NULL,author_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,job_id,revision), FOREIGN KEY(tenant_id,job_id) REFERENCES jobs(tenant_id,id),
 FOREIGN KEY(tenant_id,author_id) REFERENCES memberships(tenant_id,id)
);
CREATE TRIGGER job_requirements_immutable BEFORE UPDATE OR DELETE ON job_requirement_versions FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
CREATE TABLE data_corrections (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,membership_id uuid NOT NULL,reason text NOT NULL,
 resolution text,resolved_by uuid,created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,
 FOREIGN KEY(tenant_id,membership_id) REFERENCES memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,resolved_by) REFERENCES memberships(tenant_id,id)
);
