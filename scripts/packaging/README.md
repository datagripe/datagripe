# DataGripe

A web-based database IDE inspired by DataGrip. Browse schemas, edit
tables, write SQL, keep documents beside the data — PostgreSQL, MySQL,
SQLite and Redis.

[datagripe.com](https://datagripe.com) ·
[source](https://github.com/datagripe/datagripe) ·
[changelog](https://github.com/datagripe/datagripe/blob/main/CHANGELOG.md)

## Run it

```bash
bunx @datagripe/cli personal      # or: npx @datagripe/cli personal
```

Then open <http://localhost:3001>. That is the whole setup: DataGripe
starts its own PostgreSQL cluster for its own state, migrates it, and
runs direct-in with no accounts to create. It listens on loopback only —
a DataGripe with no accounts has no business answering the network it is
plugged into. State lives under `~/.local/share/datagripe`
(`~/Library/Application Support/DataGripe` on macOS,
`%LOCALAPPDATA%\DataGripe` on Windows), so it is still there next time
wherever you run the command from.

`personal` pins that shape rather than defaulting to it, which matters
because a developer's shell usually has an `APP_DATABASE_URL` in it:
without the word, that variable would be taken as an instruction to run
a shared deployment and DataGripe would stop, asking for two secrets you
did not mean to need.

DataGripe's server runs on [Bun](https://bun.sh). Under `bunx` it uses
the Bun you already have; under `npx` it uses the one on your PATH, and
installs a copy if there is none.

```
  -p, --port <port>     Port to listen on (default 3001)
      --data-dir <dir>  Where the embedded database and its secrets live
  -h, --help            Every option
```

## Run it for a team

Point `APP_DATABASE_URL` at a PostgreSQL you manage and DataGripe
switches to a shared deployment: accounts, sign-in, and no embedded
cluster.

```bash
APP_DATABASE_URL=postgres://…/datagripe \
CONNECTION_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
SESSION_SECRET="$(openssl rand -base64 32)" \
WEB_ORIGIN=https://datagripe.example.com \
NODE_ENV=production \
  bunx @datagripe/cli --port 3001
```

Without `personal`, DataGripe reads its configuration from the
environment: `APP_DATABASE_URL` selects that shared mode, and `HOST`
chooses the interface (every one of them, by default).

Keep `CONNECTION_ENCRYPTION_KEY` — the connection passwords in the
database are encrypted with it, and a backup without it cannot open
them. `WEB_ORIGIN` must be the exact origin browsers reach the app on:
both the HTTP routes and the WebSocket upgrade check it.

For containers there is an image and a Helm chart:
[deploy/](https://github.com/datagripe/datagripe/tree/main/deploy).

Every other setting is an environment variable —
[.env.example](https://github.com/datagripe/datagripe/blob/main/.env.example)
lists them, and
[docs/operations.md](https://github.com/datagripe/datagripe/blob/main/docs/operations.md)
covers backups, the audit log and the production checklist.

MIT licensed.
