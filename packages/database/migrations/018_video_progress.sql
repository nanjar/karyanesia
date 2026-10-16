CREATE TABLE video_progress (
 tenant_id uuid NOT NULL,membership_id uuid NOT NULL,version_id uuid NOT NULL,
 seconds integer NOT NULL CHECK(seconds BETWEEN 0 AND 300),revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,membership_id,version_id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,version_id) REFERENCES learning_versions(tenant_id,id)
);
