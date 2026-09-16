# DataGripe documentation

Living documentation for DataGripe. `docs/initial_idea.md` is the original
engineering handoff; everything in `adr/`, `spec/`, and `rfc/` reflects
decisions made after it and takes precedence where they conflict.

Six documents sit outside those folders, for the questions that are
about the repository rather than about a feature:

| File | Answers |
| --- | --- |
| [codebase-map.md](codebase-map.md) | Where things live, and which is the one place for each |
| [adding-an-action.md](adding-an-action.md) | The four edits a new WebSocket action needs |
| [testing.md](testing.md) | What `bun test` runs, and what it skips silently |
| [migrations.md](migrations.md) | Changing the app database's schema |
| [operations.md](operations.md) | Running a deployment |
| [releasing.md](releasing.md) | Publishing one |

They exist so that discovery happens once. If you had to read four files
to answer something, the answer belongs in one of them — see
[AGENTS.md](../AGENTS.md) "Before you go looking".

Everything here is for people **building** DataGripe. The documentation
for people **using** it — getting started, keyboard shortcuts, what it
can do, deploying — is [`site/content/`](../site/content), rendered to
[datagripe.com/docs](https://datagripe.com/docs/). A change to behaviour
usually touches both: the spec says what it does and why, the site page
says how to use it.

## Conventions

| Folder | Contents | Lifecycle |
| --- | --- | --- |
| `adr/` | Architecture Decision Records — one significant decision per file | Immutable once accepted; supersede, never rewrite |
| `spec/` | Feature and subsystem specifications — current intended behavior | Updated in the same change as the implementation |
| `rfc/` | Proposals under discussion | Promoted to `spec/` (plus an ADR if a decision was made) or dropped |

### ADR format

Files are numbered `NNNN-kebab-title.md` and contain: Status
(`proposed` / `accepted` / `superseded by NNNN`), Date, Context, Decision,
Consequences.

### Spec format

Files are `kebab-title.md` and contain: Status (`draft` / `current` /
`deprecated`), Goal, Non-goals, Design, and Open questions. A spec marked
`current` MUST match the code; if the code changes, the spec changes in the
same commit.

### RFC format

Same shape as a spec, plus Alternatives considered. RFCs are discussion
documents; nothing in `rfc/` is a commitment.

## Rules

- Documentation is updated in the same change as the behavior it describes.
- The [roadmap](../roadmap.md) is the single source of truth for what is
  planned, in progress, and shipped.
