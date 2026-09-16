-- Roles with capabilities, per project (docs/spec/permissions.md).
--
-- The three ranks answered "can this person edit" and nothing else. What
-- people ask for is narrower and does not nest — this member may expose
-- the project over MCP, that one may run the sync — so a role is now a
-- name and a set of capabilities, and a project can add its own.
--
-- Nothing changes for an existing deployment: the three built-ins are
-- seeded with exactly the capabilities their rank always had, and every
-- member is pointed at the one matching the rank they already hold.

CREATE TABLE IF NOT EXISTS workspace_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name text NOT NULL,
  capabilities text[] NOT NULL DEFAULT '{}',
  -- 'owner' | 'editor' | 'viewer' for the three that ship with every
  -- project and cannot be deleted; null for one a project made.
  builtin text CHECK (builtin IN ('owner', 'editor', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_roles_builtin
  ON workspace_roles (workspace_id, builtin)
  WHERE builtin IS NOT NULL;

-- Null means "the rank in `role` still decides", which is true for
-- exactly as long as it takes the statements below to run. The column
-- stays because the fallback is what keeps a half-applied upgrade
-- working, and because the rank is still what a member row displays.
ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES workspace_roles (id);

INSERT INTO workspace_roles (workspace_id, name, capabilities, builtin)
SELECT w.id, 'viewer', '{}'::text[], 'viewer' FROM workspaces w
ON CONFLICT DO NOTHING;

INSERT INTO workspace_roles (workspace_id, name, capabilities, builtin)
SELECT w.id, 'editor', ARRAY[
  'query.run', 'data.write', 'schema.change', 'document.write',
  'datasource.manage', 'domain.manage', 'gripe.dismiss', 'git.commit',
  'access.manage'
], 'editor' FROM workspaces w
ON CONFLICT DO NOTHING;

INSERT INTO workspace_roles (workspace_id, name, capabilities, builtin)
SELECT w.id, 'owner', ARRAY[
  'query.run', 'data.write', 'schema.change', 'document.write',
  'datasource.manage', 'domain.manage', 'gripe.dismiss', 'git.commit',
  'access.manage', 'sync.run', 'git.push', 'repo.commands', 'mcp.manage',
  'members.manage', 'project.manage', 'server.restart'
], 'owner' FROM workspaces w
ON CONFLICT DO NOTHING;

UPDATE workspace_members m
SET role_id = r.id
FROM workspace_roles r
WHERE r.workspace_id = m.workspace_id
  AND r.builtin = m.role
  AND m.role_id IS NULL;
