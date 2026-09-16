# Spec — Authentication, authorization, and hardening

**Status:** current
**Phase:** 4
**Supersedes:** the pre-auth stub notes in `docs/spec/connections.md`
(implements `docs/initial_idea.md` §10, §12; ADR 0002)

## Goal

Every request is authenticated and workspace-authorized; credentials and
targets are protected by session, CSRF, SSRF, and rate-limit controls
that match the self-hosted deployment model.

## Non-goals

- SAML, and OIDC providers other than Google (later, behind the same
  session contract — `oauth_identities` already carries a `provider`).
- Security keys as a *second* factor on top of a password (they are an
  alternative to one; nothing forces both).
- Attestation checks against the FIDO metadata service — registration
  asks for `attestationType: "none"`, so a deployment cannot today
  restrict which makes of key it accepts.
- Multi-workspace switching UI (users belong to one default workspace).
- Workspace invitation emails (members are added by existing owners).
- Connect-time DNS rebinding defense (see SSRF limitations).

## Design

### Accounts and sessions

- Local email+password accounts (ADR 0002), unless the deployment turned
  them off (`PASSWORD_AUTH_DISABLED`). `users.password_hash` uses
  `Bun.password` (bcrypt). Minimum password length 12. A security-key
  account has no password at all: `password_hash` is null and the
  credentials in `webauthn_credentials` are the whole story.
- Signup: allowed while zero users exist (bootstrap), or when
  `ALLOW_SIGNUP=true` (development default; production operators enable
  it deliberately). The first real user also becomes `owner` of the
  migrated stub workspace (`Local`), inheriting its connections and
  history.
- Sessions: opaque 32-byte tokens, SHA-256 hashed at rest
  (`sessions.token_hash`), 14-day expiry, hourly sweep of expired rows.
  Cookie `dg_session`: `HttpOnly`, `SameSite=Lax`, `Secure` when
  `NODE_ENV=production`, path `/`.
- Logout revokes the session and closes every socket bound to it.

### Security keys (FIDO2 / WebAuthn)

A key is an alternative to the password rather than a second factor on
top of it, for both signup and sign-in, and one account may register as
many keys as it likes — a spare in a drawer is the point.

- **Usernameless sign-in.** `POST /api/auth/passkey/login/options`
  issues a challenge with an empty `allowCredentials`, so the browser
  offers whatever discoverable credentials it holds; the credential id
  that comes back names the account on its own, and there is no email to
  type and none to leak. Registration therefore asks for
  `residentKey: "required"`.
- **User verification is required**, at registration and at every
  sign-in. On a hardware key that means a PIN. For a key-only account
  the key alone must not be enough, because there is no password behind
  it.
- **Registration** is one of two things depending on who is asking.
  Signed in (session + CSRF): the key joins that account, with the
  account's existing credentials in `excludeCredentials` so the same key
  cannot be registered twice. Signed out: the request carries the email
  for a new account, gated by the same bootstrap / `ALLOW_SIGNUP` rule
  as password signup — checked when the challenge is issued and again
  when the credential comes back.
- **The user handle is the account id.** It is decided before the
  account exists (a signup ceremony has to hand the authenticator
  *something*) and carried on the challenge row as `pending_user_id`;
  the account is created with that id when the credential verifies, or
  never, if the ceremony is abandoned. At sign-in the handle the
  authenticator reports must match the credential's owner.
- **Challenges** live in `webauthn_challenges`, expire after 5 minutes,
  and are deleted by the statement that reads them: one challenge, one
  verification, whether or not that verification succeeds. The verify
  call finds its challenge by decoding the client data the authenticator
  signed — there is no session to keep it in.
- **Signature counters** are stored and must advance. A counter that
  fails to move means a cloned authenticator, and the assertion is
  refused (`@simplewebauthn/server` enforces this).
- **Removing the last credential** of an account with no password is
  refused: it is the only way in.

Configuration: `WEBAUTHN_RP_ID` (defaults to `WEB_ORIGIN`'s hostname),
`WEBAUTHN_RP_NAME`, `WEBAUTHN_EXTRA_ORIGINS`. Nothing switches the
feature on — it is available whenever accounts are
(`AUTH_DISABLED=false`) and the browser is in a secure context.

| Route | Payload | Result |
| --- | --- | --- |
| `POST /api/auth/passkey/register/options` | `{ email? }` | creation options |
| `POST /api/auth/passkey/register/verify` | `{ response, name? }` | the key, or a session cookie for a signup |
| `POST /api/auth/passkey/login/options` | `{}` | request options |
| `POST /api/auth/passkey/login/verify` | `{ response }` | session cookie |
| `GET /api/auth/passkeys` | – | `{ passkeys, hasPassword }` |
| `POST /api/auth/passkeys/rename` | `{ id, name }` | `{ ok }` |
| `POST /api/auth/passkeys/delete` | `{ id }` | `{ ok }` |

Rename, delete and registration onto a signed-in account require the
`x-csrf-token` header; listing is a read and does not. All of them are
absent (404) when `AUTH_DISABLED`.

### Google sign-in

Optional, and off until a deployment configures an OAuth client:
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` together switch it on, and
setting exactly one of them is refused at startup rather than quietly
ignored. Like a security key, it is an alternative to the password, not
a factor on top of one.

- **Authorization code with PKCE.** `GET /api/auth/google/start` issues
  a state, a PKCE verifier and a nonce, seals all three into the
  short-lived `dg_oauth` cookie (HMAC over `SESSION_SECRET`,
  `SameSite=Lax` so it survives the trip back), and redirects to Google
  with `scope=openid email` — the address is all DataGripe stores.
- **The callback** (`GET /api/auth/google/callback`) needs the state it
  issued, exchanges the code on a backchannel authenticated with the
  client secret, and checks the id token's `iss`, `aud`, `exp` and
  `nonce`. The token's signature is deliberately not verified: it came
  back over TLS from Google's token endpoint rather than through the
  browser, which is the case OIDC Core §3.1.3.7 exempts.
- **Identities are matched on `sub`**, never on the email — people
  rename their address and the subject does not move. A *first* sign-in
  links to the existing account owning that address when Google reports
  `email_verified`, and otherwise creates one under the same bootstrap /
  `ALLOW_SIGNUP` rule as every other signup. An unverified address is
  refused outright.
- **`GOOGLE_ALLOWED_DOMAINS`** (comma separated) restricts sign-in to
  Google Workspace domains, matched against the `hd` claim and falling
  back to the email's domain. Empty means any Google account, which with
  `ALLOW_SIGNUP=true` means anyone on the internet — a deployment that
  opens signup to Google should set this.
- Failures come back as a redirect to `WEB_ORIGIN` with an `auth_error`
  query parameter, because a redirect is all a navigation can return;
  the sign-in screen shows it and scrubs it from the address bar.

Configuration: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI` (defaults to `WEB_ORIGIN` +
`/api/auth/google/callback`), `GOOGLE_ALLOWED_DOMAINS`.

| Route | Payload | Result |
| --- | --- | --- |
| `GET /api/auth/google/start` | – | 302 to Google + `dg_oauth` cookie |
| `GET /api/auth/google/callback` | `?code&state` | session cookie, or 302 with `auth_error` |

### Roles

Superseded by `docs/spec/permissions.md`: a role is a project's own
name and set of capabilities, and the three ranks are seeded rows with
the capabilities they always had. What is still true here is where the
check happens — on every message, in the dispatcher, against what the
socket resolved at upgrade.

### Which methods a deployment offers

Each method is independently switchable, so a server can be locked to
one of them:

| Variable | Effect |
| --- | --- |
| `PASSWORD_AUTH_DISABLED=true` | no login/signup routes, no password form |
| `PASSKEY_AUTH_DISABLED=true` | every `/api/auth/passkey*` route is absent |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Google sign-in appears |

Off means **absent** — 404, not a form that refuses. `GET /api/session`
reports `passwordAuthEnabled`, `passkeysEnabled` and `googleAuthEnabled`
so the sign-in screen only renders what exists. Turning off the last way
in fails at startup: a server with accounts and no method to reach them
is only discovered at the login screen otherwise. `AUTH_DISABLED=true`
is exempt, having no accounts to sign in to.

Removing a security key still refuses to remove the *only* way into an
account — a linked Google identity now counts as one of those ways,
alongside a password and a second key.

### CSRF and origin checks

- `GET /api/session` returns `{ user, workspace, role, csrfToken,
  wsUrl, bootstrap }`. State-changing HTTP routes (login exempt — it
  has no session yet; logout) require the `x-csrf-token` header to match
  the session's token.
- HTTP and WebSocket requests validate `Origin` against `WEB_ORIGIN`.
  The WS upgrade additionally requires the session cookie — browser
  WebSocket APIs cannot attach authorization headers.

### WebSocket authorization

Upgrade binds the socket to `{ userId, sessionId, workspaceId, role }`
(the user's default workspace: their first `workspace_members` row).
Every action handler receives this context and the dispatcher enforces
the role matrix on **every** message — socket authentication is not
object authorization (initial_idea.md §10).

| Action | viewer | editor | owner |
| --- | :-: | :-: | :-: |
| `workspace.open`, `schema.children`, `history.list`, `execution.subscribe`, `workspace.members` | ✓ | ✓ | ✓ |
| `execution.start`, `execution.cancel` | – | ✓ | ✓ |
| `connection.create/update/delete/test` | – | ✓ | ✓ |
| `workspace.member.add`, `workspace.member.remove` | – | – | ✓ |
| `document.*`, `layout.save` (server sync, later) | ✓ | ✓ | ✓ |

Violations return `FORBIDDEN`. New actions:

| Action | Payload | Result |
| --- | --- | --- |
| `workspace.members` | `{}` | `[{ userId, email, role, since }]` |
| `workspace.member.add` | `{ email, role }` | the added member |
| `workspace.member.remove` | `{ userId }` | `{}` (owners cannot remove the last owner) |

### SSRF policy (`security/ssrf.ts`)

Before opening any target connection (test, introspection, execution),
the hostname is resolved (`node:dns`) and **every** returned address is
classified. Blocked by default: loopback, RFC1918, link-local
(including 169.254.169.254 cloud metadata), ULA, multicast,
unspecified, and reserved ranges. `TARGET_HOST_ALLOWLIST` (comma
separated, exact or `*.suffix`) overrides per hostname — development
uses `localhost,127.0.0.1,::1`. `SSRF_DISABLED=true` bypasses the
policy entirely; intended only for trusted-network deployments, since
the server will then connect to any host, including loopback and cloud
metadata endpoints.

Limitation (accepted): Bun.SQL resolves hostnames itself at connect
time, so a DNS answer can change between our check and the driver's
connection (rebinding TOCTOU). Full defense requires a connect-time
address hook Bun.SQL does not expose; deployments that need it must
enforce egress at the network layer.

### Rate limits (`security/rateLimit.ts`)

In-memory token buckets, keyed per scope:

| Scope | Key | Limit |
| --- | --- | --- |
| `auth.login` | IP | 30/min |
| `auth.login` | email | 5/min |
| `auth.passkey` | IP | 60/min |
| `connection.test` | user | 10/min |
| `execution.start` | user | 30/min |
| `schema.children` | user | 120/min |

Exhaustion returns `RATE_LIMITED` (HTTP 429 / WS error).

### Audit logging

`log.audit(event, fields)` emits structured records for:
`auth.signup`, `auth.login.success`, `auth.login.failure`,
`auth.logout`, `auth.passkey.register`, `auth.passkey.register.failure`,
`auth.passkey.login.failure`, `auth.passkey.remove`,
`connection.create/update/delete`,
`execution.start/cancel`, `workspace.member.add/remove`, and
`ssrf.blocked`. Never passwords, secrets, or result values. Dispatch
logs every action's duration and outcome at debug level.

## Open questions

- Sliding session renewal vs fixed 14-day expiry (currently fixed).
- Per-workspace role selection when users join multiple workspaces.
- Lockout vs rate-limit-only for repeated login failures (currently
  rate-limit-only; audit events enable alerting).
- Whether an account should be able to add a password after being
  created with a key alone (today it cannot: the only route to a
  password is signup).
