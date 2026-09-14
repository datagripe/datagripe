-- 0023_oauth.sql — external identity providers (docs/spec/auth-and-hardening.md
-- "Google sign-in")
--
-- One row per (provider, subject) pair: the stable id the provider gives
-- an account, which is what a sign-in is matched on. The email is kept
-- alongside it for the audit trail only — people rename their address at
-- the provider and the subject does not change.

CREATE TABLE oauth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider text NOT NULL,
  -- Google's `sub` claim: opaque, stable, and unique within the provider.
  subject text NOT NULL,
  email citext,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (provider, subject)
);

CREATE INDEX oauth_identities_user_idx ON oauth_identities (user_id);
