CREATE TABLE media_assets (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES tenants(id),owner_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('learning','evidence')),instance_id uuid,
 mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp')),
 size integer NOT NULL CHECK(size BETWEEN 1 AND 5242880),checksum text NOT NULL,bytes bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,owner_id) REFERENCES memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,instance_id) REFERENCES sop_instances(tenant_id,id),
 CHECK((purpose='evidence')=(instance_id IS NOT NULL))
);
CREATE TRIGGER media_immutable BEFORE UPDATE OR DELETE ON media_assets FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
