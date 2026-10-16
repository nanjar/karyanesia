CREATE TABLE sop_templates (
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
CREATE TRIGGER sop_template_immutable BEFORE UPDATE OR DELETE ON sop_templates FOR EACH ROW EXECUTE FUNCTION protect_learning_version();
CREATE TABLE sop_template_branches (
 tenant_id uuid NOT NULL,
 template_version_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,template_version_id,branch_id),
 FOREIGN KEY(tenant_id,template_version_id) REFERENCES sop_templates(tenant_id,id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id)
);
CREATE TABLE sop_template_jobs (
 tenant_id uuid NOT NULL,
 template_version_id uuid NOT NULL,
 job_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,template_version_id,job_id),
 FOREIGN KEY(tenant_id,template_version_id) REFERENCES sop_templates(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES jobs(tenant_id,id)
);
CREATE FUNCTION protect_sop_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SOP references are immutable'; END IF;
 PERFORM id FROM sop_templates WHERE tenant_id=NEW.tenant_id AND id=NEW.template_version_id AND status='draft' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SOP template must be a draft'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sop_branch_immutable BEFORE INSERT OR UPDATE OR DELETE ON sop_template_branches FOR EACH ROW EXECUTE FUNCTION protect_sop_reference();
CREATE TRIGGER sop_job_immutable BEFORE INSERT OR UPDATE OR DELETE ON sop_template_jobs FOR EACH ROW EXECUTE FUNCTION protect_sop_reference();
CREATE INDEX sop_templates_tenant ON sop_templates(tenant_id,created_at DESC);
