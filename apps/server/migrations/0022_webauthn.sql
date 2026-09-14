-- 0022_webauthn.sql — FIDO2 / WebAuthn security keys (docs/spec/auth-and-hardening.md)
--
-- A key is a credential belonging to one user; a user may hold many.
-- Sign-in is usernameless, so every credential is discoverable and the
-- user handle the authenticator stores is the users.id UUID.

CREATE TABLE webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Base64URL credential id as the authenticator reports it. Globally
  -- unique: a credential identifies its account on its own.
  credential_id text NOT NULL UNIQUE,
  public_key bytea NOT NULL,
  -- Signature counter; a non-zero value that fails to advance means a
  -- cloned authenticator.
  counter bigint NOT NULL DEFAULT 0,
  -- How the authenticator can be reached ("usb", "nfc", "internal", …).
  -- jsonb like the schema's other lists.
  transports jsonb NOT NULL DEFAULT '[]'::jsonb,
  aaguid text,
  -- Whether the credential is synced to a passkey provider; a hardware
  -- key is single-device and reports false.
  backed_up boolean NOT NULL DEFAULT false,
  device_type text NOT NULL DEFAULT 'singleDevice',
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX webauthn_credentials_user_idx ON webauthn_credentials (user_id);

-- Challenges are single-use and short-lived. A registration challenge is
-- bound to either an existing account (adding a key) or a pending signup
-- email (creating one); an authentication challenge is bound to neither,
-- because usernameless sign-in does not know who is at the keyboard yet.
CREATE TABLE webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge text NOT NULL UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('registration', 'authentication')),
  user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  email citext,
  -- Signup only: the id the account will be created with, generated here
  -- so it can serve as the WebAuthn user handle the authenticator stores
  -- against its discoverable credential. No FK — the row does not exist
  -- yet, and never will if the ceremony is abandoned.
  pending_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX webauthn_challenges_expiry_idx ON webauthn_challenges (expires_at);
