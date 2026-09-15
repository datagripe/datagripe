---
title: Datasources
description: Connections declared in a file, and which hosts the server may connect out to.
group: Configuration
order: 4
---

Most datasources are added in the app and stored encrypted. Two things
about them are the deployment's decision rather than a user's.

## Predefined connections

| | Default | |
| --- | --- | --- |
| `CONNECTIONS_FILE` | `./connections.json` | Read-only connections declared in a file, with secrets resolved from the environment at boot and held only in memory. They never touch the application database. |

A predefined connection is how a deployment hands people a datasource
without handing them its password: the file names an environment
variable, the server reads it at boot, and the value is never stored and
never sent to a browser. A connection whose variable is unset is shown
as unavailable, in those words, rather than failing when somebody runs a
query against it.

## Reaching other machines

Datasource connections are outbound connections made by the server on a
user's behalf, which is the shape of an SSRF. Private ranges, loopback
and cloud metadata endpoints are blocked by default.

| | Default | |
| --- | --- | --- |
| `TARGET_HOST_ALLOWLIST` | — | Comma-separated hosts allowed despite the private-range block. This is how you reach the database on the same private network as DataGripe. |
| `SSRF_DISABLED` | `false` | Turns the policy off entirely. Trusted networks only: the server will then connect to any host, including loopback and cloud metadata endpoints. |

Development against a database on your own machine needs
`TARGET_HOST_ALLOWLIST=localhost,127.0.0.1,::1`, which is what
`.env.example` sets. Prefer naming the hosts to switching the policy
off.
