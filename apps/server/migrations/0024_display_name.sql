-- A name to be called by (docs/spec/updates.md "The account menu").
--
-- Nullable, and the address stays the identity: this is what the header
-- button and the online list show instead of an email, not a second way
-- to name an account. Nothing looks it up, nothing enforces uniqueness,
-- and an account that never sets one is not incomplete.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
