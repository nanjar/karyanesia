ALTER TABLE media_assets DROP CONSTRAINT media_assets_purpose_check;
ALTER TABLE media_assets DROP CONSTRAINT media_assets_check;
ALTER TABLE media_assets ADD COLUMN assignment_id uuid;
ALTER TABLE media_assets ADD COLUMN issue_id uuid;
ALTER TABLE media_assets ADD FOREIGN KEY(tenant_id,assignment_id) REFERENCES onboarding_assignments(tenant_id,id);
ALTER TABLE media_assets ADD FOREIGN KEY(tenant_id,issue_id) REFERENCES issues(tenant_id,id);
ALTER TABLE media_assets ADD CHECK(purpose IN ('learning','evidence','practice','issue'));
ALTER TABLE media_assets ADD CHECK(
 (purpose='learning' AND instance_id IS NULL AND assignment_id IS NULL AND issue_id IS NULL) OR
 (purpose='evidence' AND instance_id IS NOT NULL AND assignment_id IS NULL AND issue_id IS NULL) OR
 (purpose='practice' AND instance_id IS NULL AND assignment_id IS NOT NULL AND issue_id IS NULL) OR
 (purpose='issue' AND instance_id IS NULL AND assignment_id IS NULL AND issue_id IS NOT NULL)
);
ALTER TABLE practice_assessments ADD COLUMN evidence jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE issue_attachments (
 tenant_id uuid NOT NULL,issue_id uuid NOT NULL,asset_id uuid NOT NULL,alt text NOT NULL,
 actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,issue_id,asset_id),
 FOREIGN KEY(tenant_id,issue_id) REFERENCES issues(tenant_id,id),
 FOREIGN KEY(tenant_id,asset_id) REFERENCES media_assets(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,id)
);
CREATE TRIGGER issue_attachment_immutable BEFORE UPDATE OR DELETE ON issue_attachments FOR EACH ROW EXECUTE FUNCTION protect_learning_attempt();
