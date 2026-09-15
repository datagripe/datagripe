---
title: Accounts and sign-in
description: Whether a deployment has accounts at all, which of the three ways in it offers, and how to configure security keys and Google.
group: Configuration
order: 2
---

Two decisions, in this order: whether there are accounts, and which ways
in exist if there are.

## Whether there are accounts

| | Default | |
| --- | --- | --- |
| `AUTH_DISABLED` | derived | `true` means there is no sign-in at all: the session is implicit and everybody who reaches the port is the same person. Off in external mode, on in embedded — set it to override either. |
| `ALLOW_SIGNUP` | `false` | The first account may always sign up, because a server nobody can get into is not a server. This governs the ones after it. |
| `SESSION_SECRET` | — | Signs session cookies. Required in external mode; regenerating it signs everyone out and does nothing worse. |

`AUTH_DISABLED=true` is the personal and desktop shape — one person, one
machine, nothing to log into. It pairs with `HOST=127.0.0.1`: a server
with no accounts has no business answering the network it happens to be
plugged into. Turning accounts off does **not** turn the roles off
inside a project; it means there is one person to hold them.

## Which ways in exist

Three methods — password, security key, Google — each independently
switchable, so a deployment can be locked to one of them. Off means
**absent**: the route answers 404 and the sign-in screen does not draw a
form that would refuse. Turning off the last way in fails at startup
rather than at the login screen, where you would find out by being
locked out.

| | Default | |
| --- | --- | --- |
| `PASSWORD_AUTH_DISABLED` | `false` | Turns off email and password entirely: no login form, no password signup. What a deployment sets when every account is supposed to arrive through Google or a security key. |
| `PASSKEY_AUTH_DISABLED` | `false` | The same, for security keys. |

Google is the third and is configured rather than switched: setting its
OAuth client is what turns it on.

None of the three is a second factor on top of another. A security key
and a Google identity are each an *alternative* to a password, and an
account may hold several ways in at once — the server refuses to remove
the last one.

## Security keys

A FIDO2 key — a YubiKey, or a passkey your device or phone holds — works
for both signup and sign-in, and sign-in is usernameless: insert the key
and touch it, with no email to type and none to leak. Nothing to switch
on; these only tune where credentials are scoped.

| | Default | |
| --- | --- | --- |
| `WEBAUTHN_RP_ID` | `WEB_ORIGIN`'s host | The registrable domain a credential is bound to. Set it to a parent domain when the app answers on several subdomains and one key should work across all of them. It must be that host or a parent of it. |
| `WEBAUTHN_RP_NAME` | `DataGripe` | The name the key shows while asking for a touch. |
| `WEBAUTHN_EXTRA_ORIGINS` | — | Comma-separated. `WEB_ORIGIN` is always accepted; this is for the second hostname a proxy answers on, or the desktop shell's own origin. |

WebAuthn needs a secure context — https, or localhost. On plain http
anywhere else the browser refuses the ceremony, and the app says so
rather than failing silently.

## Google sign-in

Off until you configure an OAuth client. `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` **together** switch it on; setting exactly one is
refused at startup rather than quietly ignored.

| | Default | |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | — | The OAuth 2.0 client id, from Google Cloud console → APIs & Services → Credentials → *Create credentials* → *OAuth client ID*, application type **Web application**. |
| `GOOGLE_CLIENT_SECRET` | — | Its secret. The authorization code is exchanged on a backchannel from the server, so this never reaches a browser. |
| `GOOGLE_REDIRECT_URI` | `WEB_ORIGIN` + `/api/auth/google/callback` | Must match an *Authorised redirect URI* on that client exactly. The default is right whenever the browser reaches the API on the origin it loaded the app from; set it when it does not. |
| `GOOGLE_ALLOWED_DOMAINS` | — | Comma-separated Google Workspace domains allowed to sign in, matched against the `hd` claim and falling back to the email's domain. |

Setting it up is four steps:

1. Create the OAuth client as above, and put
   `https://your-host/api/auth/google/callback` in its authorised
   redirect URIs — the same value `GOOGLE_REDIRECT_URI` would have.
2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
3. Set `GOOGLE_ALLOWED_DOMAINS` to your Workspace domain.
4. Restart. The sign-in screen grows a Google button; nothing else
   changes, and existing accounts keep their passwords and keys.

**Set `GOOGLE_ALLOWED_DOMAINS` if signup is open.** Empty means any
Google account, and with `ALLOW_SIGNUP=true` that means anyone on the
internet can make themselves an account on your deployment.

Three things worth knowing about how it behaves:

- **Identities are matched on Google's `sub`, never on the email.**
  People rename their address; the subject does not move.
- **A first sign-in links to the existing account owning that address**
  when Google reports the address verified, and otherwise creates one
  under the same bootstrap / `ALLOW_SIGNUP` rule as any other signup. An
  unverified address is refused outright.
- **Failures come back as a redirect** to `WEB_ORIGIN` with an
  `auth_error` parameter — a navigation cannot return anything else. The
  sign-in screen shows it and scrubs it from the address bar.

The scope asked for is `openid email`: the address is all DataGripe
stores. There is no refresh token and no Google API call after sign-in.

## See also

- [Security](/docs/security/) — the session model, CSRF and the rest of
  the hardening.
- [auth-and-hardening](/specs/auth-and-hardening/) — the design, and
  what was deliberately not built.
