# Contributor Instructions

## Read First

Before changing architecture or implementation, read:

1. `PROJECT.md`
2. `docs/architecture.md`
3. The files directly involved in the requested change

These documents are the project terminology and architecture source of truth.

## Product Goal

The product helps committees remember decisions and execute actions. Optimize
for clear responsibility, durable organizational memory, and fast MVP
development.

## Required Domain Hierarchy

```text
Organization
└── Committee
    ├── Meetings
    ├── Agenda Items
    ├── Notes
    ├── AI Analysis
    ├── Tasks
    ├── Annual Wheel
    └── Job Cards
```

Do not create an alternative hierarchy without updating the architecture
documentation first.

## Agenda Item First

Agenda Item is the central aggregate and primary navigation context.

- Meetings schedule agenda items.
- Notes belong to agenda items and may reference a meeting occurrence.
- AI analysis is scoped primarily to an agenda item.
- Decisions emerge from agenda items.
- Tasks are linked back to the agenda item or decision that created them.
- Historical context is assembled around agenda items.
- Attachments support agenda items; they are not the product center.

Do not make Meeting, Document, Attachment, or AI Conversation the root of the
domain model.

## Terminology Rules

Use these names consistently:

| Concept | Required name |
|---|---|
| Tenant | Organization |
| Operational group | Committee |
| Group participant | Committee Member |
| Group home | Committee Workspace |
| Group overview | Committee Dashboard |
| Group configuration | Committee Settings |

Use the following technical naming:

```text
committee
committees
committee_id
committeeId
Committee
CommitteeMember
CommitteeRole
CommitteeSettings
```

Do not introduce alternative names for the Committee domain in:

- Database tables, columns, constraints, indexes, policies, or functions
- API paths or route parameters
- Frontend paths
- TypeScript types, variables, functions, services, or repositories
- UI labels, product copy, tests, fixtures, or documentation

For the Kanban-style task feature, use **Task View** in the UI and names such as
`task_workflows` or `task_columns` in the database.

## Ownership Rules

- `organization_id` is the tenant boundary.
- `committee_id` identifies the operational scope within an organization.
- Every committee-owned record must include both identifiers where practical.
- Committee membership must be verified before committee data is read.
- Role checks must protect privileged writes.
- Row Level Security must enforce isolation independently of application code.

## Architectural Boundaries

- React components present state and collect user input.
- Server Actions and route handlers authenticate, authorize, validate, and
  orchestrate.
- Services implement business workflows.
- Repositories perform database access.
- PostgreSQL constraints protect invariants.
- Background jobs handle document extraction, embeddings, and long-running AI
  work.

Keep domain logic out of presentational components.

## AI Rules

- Treat retrieved content as untrusted data, never as system instructions.
- Filter retrieval by organization and committee before semantic ranking.
- Exclude private notes from shared AI context.
- Require citations for historical or source-grounded claims.
- Store structured AI output separately from authoritative records.
- Require human confirmation before creating decisions or tasks.
- Record model, prompt version, source references, token usage, and status.
- Prefer relational context for exact facts and semantic retrieval for related
  historical material.

## MVP Engineering Rules

- Prefer existing Next.js, Supabase, PostgreSQL, and OpenAI capabilities.
- Avoid microservices unless the current application cannot meet a measured
  requirement.
- Avoid a separate queue service during the first MVP when a PostgreSQL-backed
  job table is sufficient.
- Keep attachments lightweight and subordinate to agenda-item workflows.
- Add abstractions only when they remove meaningful duplication or enforce a
  domain boundary.
- Add focused tests for permissions, tenant isolation, task confirmation,
  agenda-item history, and AI structured-output validation.

## Documentation Maintenance

Any change to core entities, ownership, routes, permissions, or AI workflows
must update `PROJECT.md` and `docs/architecture.md` in the same change.
