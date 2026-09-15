---
title: Limits
description: The ceilings a client cannot ask past, and what each one protects.
group: Configuration
order: 5
---

Every limit here is enforced by the server. A client can ask for more
and will be refused or clamped — the browser is not trusted to police
itself, and neither is an agent over MCP.

| | Default | |
| --- | --- | --- |
| `QUERY_TIMEOUT_MS` | `30000` | Per statement, applied by the database as well as by DataGripe, so a query that outlives the connection still stops. |
| `QUERY_MAX_ROWS` | `10000` | Rows returned to the grid. Beyond it the result is marked truncated rather than silently short. |
| `QUERY_MAX_BYTES` | `25000000` | Serialized result size, which is the limit that actually protects a browser tab. |
| `MAX_CONCURRENT_QUERIES_PER_USER` | `3` | Queries in flight per person. A fourth waits rather than adding load to a database that is already struggling. |
| `ACCESS_REPORT_MAX_CELLS` | `250000` | Above it the access report asks for a filter instead of timing out. |
| `DOMAIN_EXPORT_MAX_DATA_ROWS` | `10000` | Per table, for a domain exported with its data. Exceeding it fails that table and reports it, rather than writing a file that looks complete. |

MCP has its own, much lower, row and byte caps: the consumer there is a
context window rather than a grid. They are on [MCP](/docs/mcp/).
