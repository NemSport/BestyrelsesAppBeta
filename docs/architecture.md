# System Architecture

## Product Principle

> Help committees remember decisions and execute actions.

This product is a multi-tenant SaaS application for associations, sports clubs,
volunteer organizations, and local committees. Its value comes from preserving
the chain between a topic, its discussion, the resulting decision, and the
actions required afterward.

The architecture is optimized for a fast MVP using a single Next.js
application, Supabase, PostgreSQL, and OpenAI.

## Design System Foundation

Phase 1.6-A2 builds on the existing Phase 1.6-A1 shell and navigation rather
than replacing it. Global CSS variables define semantic brand roles:
`--brand-primary`, `--brand-secondary`, `--brand-accent`,
`--brand-background`, `--brand-surface`, `--brand-text`,
`--brand-text-muted`, `--brand-border`, and calm danger, success, warning,
information, and progress colors.

Typography, responsive page padding, section spacing, control and panel radii,
and shadows are also tokenized. Shared classes such as `page-shell`,
`page-title`, `page-eyebrow`, `page-lead`, `section-title`, `metadata`,
`panel`, `field`, and the button classes provide the default composition
rules. Tailwind colors resolve to the same CSS variables, including
compatibility aliases used by earlier phases. This lets a future
organization-scoped branding layer override variables without duplicating
components or changing application behavior.

### Meeting Document Layout

Phase 1.6-A4 treats the meeting page as an interactive document rather than an
administration dashboard. The header combines authoritative meeting metadata
and minutes status in one surface. The agenda remains the primary work area:
number, title, compact O/D/B/F type, local minutes status, and subdued context
form a consistent hierarchy while the existing accordion behavior remains
unchanged.

Standard agenda items use a quieter administrative surface, Eventuelt uses a
subtle dashed treatment, and transferred items use a restrained progress
marker. Approved general and agenda-item minutes share document typography and
separate narrative, decisions, and follow-up into readable sections.
Approval responses, attachments, previous-minutes viewing, PDF download, and
transfer scheduling remain existing workflows and security boundaries; A4
changes presentation only.

Phase 1.6-A4.1a standardizes agenda-item document titles across meeting,
agenda, minutes, previous-minutes, transfer, and PDF views. Titles render as
`(O) Title`, `(D) Title`, `(B) Title`, or `(F) Title`, using the existing
`agenda_item_type` value as the sole source. This is a presentation convention
and introduces no database, API, authorization, or workflow changes.

Phase 1.6-A4.1b keeps meeting lists compact while exposing agenda context on
demand. The meeting-list read model embeds only occurrence position and the
agenda item's id, title, and type. A collapsed native disclosure shows summary
counts and reveals the first five document-formatted titles, while navigation
to the complete meeting remains a separate, explicit action.

Phase 1.6-A4.1c compacts the expanded agenda-item minutes surface through
presentation structure only. Notes, decision, and follow-up remain the primary
editing area; local status, responsible member, and deadline form a secondary
responsive row; attachments remain available in a collapsed extra section.
TipTap, autosave, offline drafts, validation, authorization, and persistence
workflows are unchanged.

Phase 1.6-A4.1d applies the same progressive-disclosure pattern to minutes
governance. Approval progress, response exceptions, deadline, and PDF
availability form a compact summary; detailed member responses and controls
are hidden until requested. Meeting- and agenda-level attachments expose a
file count first and retain upload, open, and download actions in expandable
content. All API, storage, PDF, RLS, and approval behavior remains unchanged.

Phase 1.6-A4.1e introduces modal-based editing for meetings and agenda items.
Shared client form components own the existing fields and PATCH endpoints;
both modal triggers and existing fallback edit routes compose those same
forms. Modal success closes the dialog and refreshes the current route, while
API authorization, service validation, repositories, and RLS remain the
authoritative write boundaries.

Phase 1.6-A6 compacts the shared TipTap toolbar without changing its command
set or persistence contract. Frequent formatting actions remain visible, while
secondary actions use progressive disclosure. Autosave, local drafts,
sanitizing, plain-text compatibility, and rendered rich text continue through
the existing editor and viewer boundaries.

Phase 1.6-A7 defines the maintenance contract in `docs/design-system.md`.
Presentation code consumes semantic CSS variables and shared components;
domain workflows continue through route handlers, services, repositories, and
RLS. The QA contract covers authentication, tenancy, memberships, meetings,
agenda scheduling, minutes, transfers, approvals, attachments, and PDF
without introducing new business behavior.

### Shared UI Composition

Phase 1.6-A3 adds a small, reusable component layer in `src/components/ui`.
`AppShell`, `PageHeader`, `PageSection`, `ContentPanel`, `DocumentPanel`, and
`ActionBar` establish the default page structure. `Button`, `Input`,
`Textarea`, `Select`, `StatusBadge`, `EmptyState`, `Table`, `Modal`, and
`Dropdown` standardize common interactions without owning domain logic.

Central organization, committee, meeting, agenda-item, member, and minutes
views compose these primitives. Sections and divided metadata rows are
preferred over wrapping every content block in a card. Modals centralize
dialog presentation, Escape handling, backdrop dismissal, and page scroll
locking. The component layer consumes the Phase 1.6-A2 semantic tokens and is
therefore compatible with future organization-scoped branding.

Future branding should be applied as validated, organization-scoped overrides
of semantic variables. It must not introduce organization names, colors, or
logos directly into shared components. A later white-label feature may add
theme administration and PDF branding, but those are outside Phase 1.6.

### Committee Overview Read Model

Phase 1.6-B1 composes the committee landing page from existing relational
records. `CommitteeService.getOverview` verifies committee membership and then
loads meeting previews, accessible meeting minutes, agenda-item minutes,
non-dismissed transfer intents, and the existing organization member
directory. The server maps these records into a presentation-only read model
for next meeting, upcoming meetings, recent minutes, action-required points,
and committee members. No new table, lifecycle, permission, or mutation flow
is introduced; PostgreSQL RLS remains the final visibility boundary.

### Organization Overview Read Model

Phase 1.6-B2 adds an organization-scoped read model without adding dashboard
tables or new workflow state. `OrganizationService.getOverview` verifies active
organization membership and composes RLS-visible committees, meeting previews,
meeting minutes, agenda-item minutes, and active transfer intents. The server
maps these records into compact organization metrics, committee summaries,
upcoming meetings, recent minutes, and action-required agenda items. Data from
committees the current user cannot access is excluded by the existing
PostgreSQL policies.

Phase 3 extends this presentation read model with active decisions, open
organization tasks, and open tasks assigned to the current user. The data is
loaded through the existing RLS-scoped decision and task repositories and is
limited to compact start-page excerpts. A responsive sticky organization
navigation uses the current route to mark Overview, Decisions, Task View, My
Tasks, and Members; its Meetings entry anchors to the existing cross-committee
meeting section instead of adding a parallel route.

Meeting context remains agenda-item first. Meeting-level related decisions and
tasks are collapsed into one compact context panel, while direct creation
actions stay visible inside each agenda item. Whole-minutes AI extraction is
the prominent AI action; point-specific analysis remains available under
secondary actions. These are composition changes only and do not alter
repositories, mutation routes, task confirmation, or RLS.

## Domain Hierarchy

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

### Organization

The organization is the tenant, billing, and primary security boundary. It owns
memberships and one or more committees.

### Committee

A committee is the operational scope in which people meet, discuss topics,
make decisions, and execute tasks. Committee membership may be narrower than
organization membership.

### Agenda Item

Agenda Item is the central entity and durable unit of organizational memory.
It represents a topic rather than a single slot in a single meeting.

```text
Agenda Item
├── Meeting Occurrences
├── Notes
├── AI Analyses
├── Decisions
├── Tasks
├── Related Agenda Items
└── Historical Context
```

An agenda item can appear in multiple meetings. This allows unresolved topics
to be deferred or revisited without fragmenting their history.

### Meeting

A meeting is a time-bound container. It schedules agenda items through meeting
occurrences and stores attendance, order, allocated time, and
meeting-specific outcomes.

Meeting creation uses one transactional PostgreSQL function that also creates
three standard agenda items in positions 0, 1, and 2: agenda approval, previous
minutes approval, and any other business. Their stable `standard_key` metadata
supports the Danish “Standardpunkt” label without restricting normal editing
or manager-authorized deletion. A database trigger keeps Eventuelt last when
additional items are inserted into the meeting.

Standard agenda items are presented as administrative meeting points. Their
point-minutes UI omits responsible-person and deadline controls based on
`standard_key`; any previously stored values remain untouched in the database.

For the `previous_minutes_approval` item, the meeting service resolves the
newest RLS-visible meeting in the same organization and committee where
`starts_at` is earlier than the current meeting. The read model contains only
the previous meeting identity, public minutes fields, and agenda-item minutes.
The internal note is deliberately omitted. The meeting page shows a compact
status box and opens the read-only minutes dialog only after an explicit user
action.

The meeting page creates ordinary agenda items through an on-page modal. A
shared agenda-item form component is used by both the modal and the standalone
create route, so validation, fields, API calls, and Danish error messages do
not diverge. A successful modal submission closes the dialog and refreshes the
server-rendered agenda without changing routes.

The shared form offers two mutually exclusive destination modes:

- **Existing meeting:** choose an RLS-visible, non-cancelled meeting in the
  same organization and committee. The item is scheduled through an occurrence
  and `target_date` remains empty.
- **Date:** store `target_date` and leave the item in the backlog without an
  occurrence.

Zod validation and `create_agenda_item` both require exactly one destination.
Meeting scheduling retains its stronger committee-manager permission, while
date-based backlog creation retains the existing agenda-item-editor
permission.

When `create_agenda_item` schedules a new item immediately, it invokes the same
agenda normalization used by transferred items. Opening standard items remain
first, transferred items follow, ordinary items come next, and Eventuelt
remains last.

### Meeting Minutes

A meeting has at most one general minutes record. It contains the complete
meeting narrative, consolidated decisions, an optional internal note, and the
approval status `draft`, `ready_for_approval`, or `approved`.

Each agenda-item occurrence may have its own minutes record containing notes,
decision, follow-up, optional responsible person, and optional deadline. This
structured record is the future source for AI task, owner, and deadline
suggestions. The workflow exposes type-specific status sets for information,
discussion, decision, and follow-up items while retaining the original generic
enum values for existing records. Application validation and a PostgreSQL
trigger require responsible person and deadline only when a status carries the
item forward, explicitly requires follow-up, or non-empty follow-up text
creates an action.

The typed `agendaItemTransferRules` contract prepares the next phase without
performing automatic transfers:

- Discussion + `discussion_continue` suggests a new Discussion item.
- Discussion + `needs_decision` suggests a new Decision item.
- Decision + `decision_requires_follow_up` suggests a new Follow-up item.

Saving point minutes applies these rules to a separate transfer-intent record.
The intent preserves its source meeting, agenda item, occurrence, point
minutes, source status, reason, and proposed target type. A unique constraint
prevents the same source rule from producing duplicates. Committee managers
may dismiss a pending intent or schedule it on the first meeting after the
source meeting or a specifically selected later meeting.

Transfer scheduling runs in one protected PostgreSQL function. It creates a new
agenda item linked to the source through `parent_id`, copies the source title,
objective, relevant point-minutes context, responsible person, and deadline,
creates the target occurrence, updates the transfer intent, and then
normalizes the target agenda order. The ordering groups are opening standard
items, transferred items, ordinary items, and Eventuelt. Meeting selection is
based only on meeting time; a copied deadline never determines the target
meeting. If no later non-cancelled meeting exists, the function leaves the
intent pending without creating records.

### Minutes Autosave and Offline Safety

Meeting and agenda-item minute forms write a versioned, user-scoped local draft
before attempting a debounced API save. Draft keys include user, organization,
committee, meeting, and agenda item identifiers. API writes continue through
the existing service, authorization, repository, and RLS layers.

While offline, users can continue editing the cached meeting page. Reconnecting
retries pending writes. Successful synchronization clears only the matching
local draft. If local and server data differ after a reload, the UI requires
the user to restore the local draft or keep the server version; it never
silently overwrites or deletes the differing local text. Logout clears cached
authenticated pages and local minutes drafts from the browser.

Meeting and point-minute narrative fields use a shared TipTap editor and store
sanitized rich-text HTML in their existing text columns, so no schema migration
is required. The editor supports headings, paragraphs, line breaks, bold,
italic, underline, bullet and numbered lists, quotations, links, undo/redo, and
clearing formatting. The allowlist sanitizer runs before persistence and before
rendering; links are limited to HTTP(S) and `mailto:` and receive safe external
link attributes. Legacy plain text is escaped and wrapped while preserving line
breaks. Autosave and local drafts continue to serialize the field values as
strings.

### Minutes Approval, Attachments, and PDF

Sending minutes for approval runs through a protected PostgreSQL function. It
sets the deadline, changes the meeting-minutes workflow to
`ready_for_approval`, and creates or resets one approval row for every active,
voting committee member with role chair, secretary, or member. Members may
approve or request changes; change requests require a comment. Managers may
convert pending responses to `no_response` only after the deadline. The
database marks the minutes approved when no pending or change-requested rows
remain.

Minutes attachments use the private `meeting-minute-attachments` Supabase
Storage bucket. Relational metadata is split between meeting-level and
agenda-item-minute attachments. Uploads and metadata writes require committee
manager access. Reads and short-lived signed download URLs follow the same RLS
rules as the associated minutes. HTML, SVG, scripts, and executable file types
are rejected.

Approved minutes are rendered primarily as a readable document; authorized
managers can explicitly return to edit mode. PDF generation runs on the server
from an RLS-authorized read model and excludes `internal_note`.

### Notes

Notes belong to an agenda item and can optionally reference its occurrence in a
meeting. Note visibility can be private, committee-wide, or
organization-wide.

### AI Analysis

AI analysis is generated for an agenda item using its authorized notes,
decisions, tasks, occurrences, Annual Wheel context, Job Cards, and selected
attachments.

The Agenda Item AI Assistant is the first historical-context preparation
surface. `POST /api/agenda-items/[agendaItemId]/assistant` authenticates the
user, verifies organization and committee membership, and loads only
RLS-visible agenda-item history, point minutes, decisions, and open tasks.
Internal notes and unrelated committee records are excluded.

Relational data remains authoritative for the last discussion, prior
decisions, and open tasks. The model receives bounded, server-labelled source
blocks and returns only Structured Outputs for discussion questions and
possible future agenda items. Every output includes source ids; the service
removes unknown ids and drops suggestions with no valid citation. Minutes are
treated as untrusted content, `store: false` is used, diagnostics omit source
text and API keys, and the endpoint performs no writes. The UI exposes a
manual `Forbered punktet med AI` action with loading, retry, empty states, and
links back to the cited meeting, decision, or task.

Phase 2C.1 adds an isolated `AiTaskSuggestionService` and the authenticated
`POST /api/meetings/[meetingId]/task-suggestions` route. The request selects
either `meeting_minutes` or `agenda_item_minutes`; a point request must include
the agenda-item id. The service verifies organization, committee, meeting, and
agenda-item scope through the existing authorization, repository, and RLS
boundaries before any model request.

Only the general minutes narrative and decisions, or the selected point's
notes, decision, and follow-up are included. Internal notes, attachments,
unrelated meetings, existing tasks, and private cross-committee context are
excluded. Rich text is converted to plain text and capped before transmission.
The prompt explicitly treats minutes as untrusted data and asks only for
concrete unfinished actions while ignoring information-only content,
unresolved discussion, completed work, and unclear notes.

The OpenAI Responses API uses `store: false` and Zod-backed Structured Outputs.
The task-suggestion request deliberately omits model-specific reasoning and
verbosity parameters so the default `gpt-4.1-mini` model and compatible
overrides use the same stable request contract.
The `task-suggestions-v2` contract returns title, description, optional
responsible name, a deadline interpretation, separate responsibility/deadline
confidence, trusted source metadata, and overall confidence. Output is
validated again after parsing, deduplicated, and has its source metadata
overwritten from the authorized server context. Empty source text returns an
empty list without calling OpenAI. Refusals, malformed output, configuration
errors, and provider failures become controlled Danish API errors and never
crash the page.

Phase 2C.3 provides the model with the source meeting date and names of active
members in the same committee. E-mail addresses and unrelated organization
members are excluded. The server maps a suggested name to a user id only for
one exact or unambiguous partial match. It also resolves relative deadlines
against authorized meeting data: next-meeting/next-time use the first later
meeting, ASAP uses source meeting date plus seven days, and general-assembly
uses the first later meeting with a matching title. No match produces an empty
field and low confidence. Review shows the reason and confidence separately
for responsibility and deadline, and both remain editable.

Phase 2C.4 extends the contract to `task-suggestions-v3`. Source meeting and
agenda-item identifiers are never trusted from model output; the server writes
them from the authorized request context. Only titles of accessible,
non-cancelled decisions on the current meeting are supplied as candidates.
For point minutes, candidates are narrowed to the same agenda item. A single
decision on that point is considered an unambiguous relation; otherwise the
server requires one exact or unique title match. Review links back to the
meeting and point and exposes a decision selector with an explicit no-relation
option. On confirmation, `meeting_id`, `agenda_item_id`, and optional
`decision_id` pass through the existing task API and `TaskService` reference
validation, so RLS and committee scope remain authoritative.

Phase 2C.5 advances the contract to `task-suggestions-v4`. The system prompt
defines a concrete task as an unfinished action with an expected result or
next step, rejects information-only notes and loose discussion, calibrates
uncertainty conservatively, and treats all minutes content as untrusted data.
The model schema is strict and contains proposal content only. It rejects
unknown properties and invalid calendar dates; all source and relation fields
are added from the authorized server context after parsing.

Provider errors, refusals, incomplete generations, missing parsed output, and
post-parse Zod failures are mapped to controlled Danish errors. The review
modal preserves loading, empty, error, and retry states and states explicitly
that no task is created without human confirmation. Server diagnostics include
meeting id, model, error classification, provider status/code/type, and request
id when available. They exclude prompt text, minutes content, API keys, and
model output. No AI response is persisted in this phase.

Phase 2C.6 keeps task extraction manual and places its compact trigger in the
general and agenda-item minutes actions. Draft minutes show the disabled
trigger with an explanation; `ready_for_approval` and `approved` minutes allow
the authorized editor to start analysis. Changing minutes status never invokes
AI automatically.

The review performs presentation-level duplicate checks against the already
RLS-scoped tasks loaded for the same meeting or agenda item and against titles
inside the current review session. Exact or clearly contained title matches
are warned and pre-deselected, but can be deliberately re-selected. This is
not semantic or history-wide duplicate detection and adds no persistence.
Created tasks continue through the ordinary task API and are linked from the
success state to Task View.

The same endpoint accepts a server-only orchestration mode named
`whole_meeting`. One client request loads the RLS-visible general minutes and
all agenda-item minutes for the authorized meeting. Empty sources are skipped;
the remaining sources share a bounded total character budget and are analyzed
as separate Structured Outputs calls. Each parsed result is normalized with
its server-known source type, meeting id, agenda-item id, and title before all
proposals are combined into one review response. Usage metadata is aggregated.
This preserves precise source relations without trusting the model to route a
proposal, and leaves the existing meeting- and point-specific actions intact.

The API response also carries completion status, model, prompt version, source
references, and input/output/total token usage. These fields prepare later
usage persistence and observability without adding an AI table or logging
minutes content in this phase.

`OPENAI_API_KEY` is server-only.
`OPENAI_TASK_SUGGESTION_MODEL` defaults to `gpt-4.1-mini` and can be changed
without exposing a model choice to client code. The analysis endpoint does not
persist suggestions, call `TaskService`, or run automatically on approval.

AI provider and validation failures are logged server-side with the meeting id,
selected model, error name/message, and available OpenAI status, code, type,
and request id. Prompt text, minutes content, and API keys are never included
in these logs. The client continues to receive a controlled Danish error.

Phase 2C.2 adds a client-side review modal at the general meeting minutes and
individual agenda-item minutes. Each suggestion starts as an editable proposal
and can be approved or rejected. Approved proposals are created only after the
user clicks `Opret godkendte opgaver`; each then passes through the ordinary
authenticated task API, service validation, repository, PostgreSQL constraints,
and RLS. Meeting-level suggestions retain `meeting_id`, while point-level
suggestions retain both `meeting_id` and the trusted `agenda_item_id` returned
from the server. Closing the review creates nothing, and rejected suggestions
are not stored.

### Decisions

Decisions are authoritative committee outcomes. Phase 2A.1 stores them in an
organization-wide register while preserving `committee_id` as the operational
and security scope. A decision may optionally reference a meeting and agenda
item, but both references must belong to the same organization and committee.
The initial workflow supports manual creation, editing, responsibility,
deadline, category, internal notes, cancellation, archival, and simple
search/filtering. Task creation, AI extraction, editor text selection, voting,
comments, and advanced audit history remain later-phase work.

Phase 2A.2 exposes the same decision creation service from meetings and agenda
items. Contextual modals prefill only data already available in the authorized
meeting read model. Point-minutes decision text is converted to plain text as
an editable proposal and is never persisted as a decision until the user
submits the decision form. Meeting and point sections query decisions through
the existing RLS-filtered repository and link to the organization register;
no duplicate decision workflow or database entity is introduced.

Phase 2A.3 derives simple historical context from existing decision
relationships and categories. The matching key is
`committee_id + normalized(category)`, where normalization trims whitespace
and compares case-insensitively using the Danish locale. An agenda item gains
topic categories only from decisions directly linked through
`agenda_item_id`; no title inference or semantic matching occurs. Meeting
context excludes decisions dated on or after the current meeting, while the
agenda-item overview may show the complete accessible category history.
Archived and cancelled records remain historical evidence and are marked
visibly. All source rows still pass through the existing decision RLS policy,
and internal notes are omitted from history read models.

Phase 2A.4 keeps decision discovery as a client-side presentation concern over
the existing authorized register read model. The compact register supports
combinable filters for status, committee, responsible member, meeting, exact
normalized category, decision-date range, and deadline range, plus ordering by
decision date, deadline, or status. Date comparison uses the stored ISO date
values, decisions without deadlines sort after dated decisions, and overdue
styling applies only to decisions that are neither completed nor cancelled.
No filter endpoint, database index, migration, or RLS exception is introduced
at this scale.

Phase 2A.5 reuses the existing RLS-protected decision creation route and modal
from the minutes workflow. Current client-side minutes state is converted from
sanitized rich text to plain text when the user opens the modal, so an
unfinished autosave does not prevent using the latest visible text. Agenda
item proposals prefer decision, notes, then follow-up and preserve the active
meeting and agenda-item identifiers. General meeting proposals prefer the
combined decisions field and fall back to the narrative minutes. No source
text is persisted automatically, no AI analysis occurs, and TipTap selection
state is deliberately left untouched to protect editor and offline stability.

### Tasks

Phase 2B.1 introduces tasks as standalone committee actions, separate from the
decision register. A task contains title, description, workflow status,
optional responsible active committee member, deadline, category, internal
note, completion timestamp, and archival timestamp. The service layer and RLS
reuse the established committee editor permission model.

Phase 2B.2 provides the first **Task View** without introducing configurable
workflow columns. It groups the existing stable task statuses into compact
board columns and keeps the Phase 2B.1 list as an alternate view. Quick status
changes use the existing authenticated task PATCH route with the complete
validated task payload, so service authorization, scope validation, database
triggers, and RLS remain authoritative. Search and filters run only over the
already authorized task register read model. Drag-and-drop and custom columns
remain later-phase work.

Phase 2B.3 adds optional `meeting_id`, `agenda_item_id`, and `decision_id`
provenance directly to `tasks`. The application and PostgreSQL trigger both
verify that every referenced record belongs to the same organization and
committee as the task. This keeps decisions as authoritative outcomes and
tasks as executable work while allowing one decision to have any number of
task rows. Contextual creation modals prefill current meeting, point-minutes,
or decision data, but the user must review and submit every task. Meeting,
agenda-item, and decision views load related tasks through the normal
RLS-scoped repository.

Phase 2B.4 adds `/organizations/[organizationId]/tasks/my` as a personal read
model over the same task table. `TaskRepository.listByResponsible` applies the
organization and active-user responsibility filters in the database query;
RLS still removes inaccessible committee rows. The default presentation
excludes archived, completed, and cancelled work and sorts dated tasks by
nearest deadline. Quick status and completion actions reuse the existing
`PATCH /api/tasks/[taskId]` service authorization, while contextual links and
the shared register editor preserve navigation without introducing a personal
task ownership or permission model.

A later phase may extend Task View into a configurable workflow:

```text
Backlog → To Do → In Progress → Blocked → Review → Done
```

### Annual Wheel

The Annual Wheel uses `annual_wheel_events` as a shared organization and
committee planning model. Each row is a concrete occurrence with start/end
dates, category, priority, optional responsible member, optional committee,
and optional meeting/task links. Recurring activities share `series_id` and
store an RRULE-compatible `recurrence_rule`; future occurrences are
materialized during creation so historical occurrences remain stable and a
single future occurrence can become an exception.

`AnnualWheelService.getOverview` overlays RLS-visible meetings, task
deadlines, and decision deadlines at read time. These source records remain
authoritative and are not copied into `annual_wheel_events`. Organization and
committee pages compose the same year/quarter/month component with committee,
responsible-person, and item-type filters.

The Annual Wheel AI endpoint is manual and read-only. It analyzes only the
authorized overview returned through existing repositories and RLS. OpenAI
Structured Outputs return source-grounded activity and agenda-item proposals;
unknown source ids are discarded. Selecting a proposal pre-fills the standard
activity form, and a separate human submit action remains mandatory.

### Job Cards

Job Cards are organization-owned role profiles. They combine structured role
scope, reusable responsibility areas, committee links, dated member
assignments, document links, task templates, and one onboarding guide.
Assignment history is append-preserving: removing a current role holder sets
`ends_on`, while a new holder receives a new assignment row.

Task templates create ordinary tasks through the existing task authorization
boundary. The resulting task retains `role_profile_id` and
`task_template_id`; the template's committee remains the operational scope,
and the current role holder is used only when one exists. Annual Wheel
occurrences may also link to a role profile.

The read model combines role data with accessible open tasks, Annual Wheel
events, committee decisions, documents, and onboarding content. AI generation
is a manual, organization-admin-only draft workflow. It uses RLS-visible
minutes, tasks, decisions, and planning history, logs no source text, validates
Structured Output, and requires normal form submission before persistence.

## Database Overview

All primary keys use UUIDs. Tenant-owned tables include `organization_id`;
committee-owned tables also include `committee_id`. Application tables include
timestamps and use PostgreSQL constraints and Supabase Row Level Security.

### Identity and Tenancy

#### `profiles`

Extends `auth.users` with display name, avatar, locale, timezone, and onboarding
state.

#### `organizations`

Stores tenant identity, slug, settings, and creator.

#### `organization_members`

Connects users to organizations with roles such as `owner`, `admin`, `member`,
and `viewer`. The Danish UI labels are Ejer, Administrator, Medlem, and
Observatør.

#### `organization_invitations`

Stores pending invitations with organization, normalized e-mail address,
intended role, inviter, status, and timestamps. Phase 1 stores invitations
without sending e-mail. A later acceptance flow may add secure tokens and
expiration.

Membership administration follows these invariants:

- Organization members may read the member directory.
- Owners and administrators may invite, change roles, and remove members.
- Administrators cannot grant, modify, or remove the owner role.
- Administrators cannot change their own role.
- Owners may transfer ownership by adding another owner and then changing or
  removing an existing owner.
- The last active owner cannot be demoted or removed.
- Removing an organization member also removes their committee memberships.
- Direct member writes are blocked by RLS; protected PostgreSQL functions
  perform mutations atomically.
- Owners may manually create an authenticated user with a temporary password,
  a non-owner organization role, and zero, one, or multiple committee
  assignments. Each selected committee stores its own committee role.
- Manual creation uses a server-only Supabase Admin client. The service role
  key is validated separately from public environment variables and is never
  imported into client components.
- Manually created e-mail addresses are confirmed for local onboarding. If a
  later database step fails, the newly created Auth user is deleted again.
- Duplicate committee selections are rejected by input validation and by the
  `committee_members` primary key. Committee memberships are inserted together
  after organization membership creation.

### Committee Structure

#### `committees`

Stores the committee name, description, organization, settings, and archival
state.

#### `committee_members`

Connects organization members to committees with committee-specific role,
title, voting rights, and status.

### Meetings and Agenda Items

#### `meetings`

Belongs to a committee and stores title, status, schedule, location, and
creator.

#### `meeting_attendees`

Connects users to meetings with attendance status and meeting role.

#### `meeting_minutes`

Stores one general minutes record per meeting with organization, committee,
meeting, narrative, decisions, internal note, approval status, authors, and
timestamps. Organization owners and administrators plus committee chairs and
secretaries may write. Committee members may read relevant records, while
committee viewers may only read approved records.

`approval_deadline` records the current response deadline.

#### `meeting_minute_approvals`

Stores one response per relevant member and approval round with status
`pending`, `approved`, `change_requested`, or `no_response`. Change-request
comments are stored on the response without modifying minutes content.

#### `meeting_minute_attachments`

Stores meeting-level attachment metadata and the private Storage object path.

#### `agenda_item_minute_attachments`

Stores point-minute attachment metadata and links each object to its meeting,
agenda item, and structured point-minutes record.

#### `agenda_item_minutes`

Stores one structured minutes record for each agenda item in a meeting:
notes, decision, follow-up, optional responsible person, optional deadline,
local workflow status, authors, and timestamps. Database triggers verify that the organization,
committee, meeting, agenda item, occurrence, and responsible member share a
valid scope. Viewers may read these records only when the associated general
meeting minutes are approved.

#### `agenda_items`

The durable topic record. Important fields include:

- `organization_id`
- `committee_id`
- `parent_id`
- `title`
- `description`
- `objective`
- `item_type`
- `owner_id`
- `job_card_id`
- `source`
- `target_date`
- `resolved_at`

The original Phase 1 schema introduced `lifecycle_status` and
`agenda_item_status` as a generic backlog-to-archive workflow. In the current
Agenda Item-first model, that workflow is legacy rather than a product
feature: it previously supplied create/edit selects, list badges, dashboard
filtering, and internal scheduling defaults. The UI, validation, and dashboard
no longer expose or depend on it. The column and enum remain non-destructively
for existing data and database-function compatibility; new records receive
only an internal `backlog` or `scheduled` value based on whether they are
created for a date or a meeting, and ordinary edits preserve the stored value.

#### `agenda_item_occurrences`

Connects agenda items to meetings and stores position, presenter, duration,
meeting status, outcome summary, and carry-forward state.

The pair `(agenda_item_id, meeting_id)` is unique.

#### `transferred_agenda_items`

Stores unresolved-item transfer intents separately from standard agenda items.
Each row links to the source meeting, agenda item, occurrence when available,
and source point-minutes record. It records a stable transfer reason, source
status, proposed target item type, and workflow status `pending`, `scheduled`,
or `dismissed`. Source-rule fields are immutable; target meeting and target
agenda item remain empty while pending. Scheduling fills both target
references atomically, and the new agenda item uses `parent_id` to link back to
the original agenda item.

#### `agenda_item_links`

Connects related topics using relationships such as `related`, `depends_on`,
`follow_up_to`, and `supersedes`.

### Notes and Supporting Material

#### `notes`

Stores agenda-item notes with optional occurrence, author, note type,
visibility, source, and content.

#### `attachments`

Stores lightweight supporting files linked to agenda items or notes. Attachment
processing may extract searchable text, but attachment management is not the
primary product workflow.

### Decisions and Execution

#### `decisions`

Stores manually confirmed decisions with organization and committee scope,
optional meeting and agenda-item references, title, description, status,
responsible committee member, decision date, optional deadline and category,
internal note, authorship timestamps, and archival/cancellation timestamps.
Database triggers reject cross-committee references and non-member
responsibility. RLS permits reads only through relevant committee membership
or organization administration and writes through the established
agenda-item editor permission.

#### `votes`

Stores one vote per user and decision when formal voting is required.

#### `task_workflows`

Stores a committee's task workflow configuration.

#### `task_columns`

Stores ordered workflow columns and whether a column represents completion.

#### `tasks`

Stores the Phase 2B.1 standalone committee actions with organization and
committee scope, title, description, workflow status, optional responsible
active committee member, deadline, category, internal note, authorship
timestamps, completion timestamp, and archival timestamp. A trigger
synchronizes `completed_at` with completed status. RLS permits relevant
committee members and organization administrators to read, while the existing
committee editor permission controls inserts and updates. Optional meeting,
agenda-item, and decision references preserve the origin of manually confirmed
work and are scope-validated independently in PostgreSQL. Job Card, AI,
notification, and workflow-column relations remain later-phase work.

Phase 2B.6 adds optional `reminder_at`, `reminder_sent_at`, and
`last_notified_at` columns to this same task aggregate. `reminder_at` is
user-editable preparation data. The delivery fields are reserved for a future
server-side worker and are never set by client components. Changing the
reminder time clears the sent marker so the revised reminder can be processed.
Repository queries expose three RLS-scoped candidate sets: open tasks due
soon, open overdue tasks, and unsent reminders whose scheduled time has
passed.

A later email implementation should run server-side on a trusted schedule,
load candidates through the task service, resolve the responsible member's
email through authorized membership data, send through the chosen provider,
and update `reminder_sent_at` and `last_notified_at` only after confirmed
delivery. It must be idempotent and retain PostgreSQL tenant isolation. Phase
2B.6 deliberately adds no scheduler, provider integration, automatic email,
push notification, or notification center.

#### `task_labels` and `task_label_assignments`

Provide committee-specific task categorization.

#### `task_comments`

Stores compact, append-only task follow-up comments. Each row repeats
`organization_id` and `committee_id` from its task so PostgreSQL can enforce
tenant and committee isolation directly. A scope trigger rejects mismatched
task relations and records the active user as author. Relevant committee
members and organization administrators may read comments; the existing task
editor permission controls inserts. Phase 2B.5 intentionally does not add
comment editing, deletion, real-time chat, mentions, notifications, files, or
a general audit log.

#### `task_activity`

Provides an append-only history of task status, ownership, deadline, and
completion changes.

### Annual Wheel and Job Cards

#### `annual_wheel_events`

Stores organization- or committee-scoped activity occurrences. A stable
`series_id`, `occurrence_index`, recurrence frequency, interval, and
RRULE-compatible string connect recurring occurrences. `is_exception` marks a
changed occurrence without mutating historical rows. Soft deletion preserves
history, and optional `meeting_id` and `task_id` prepare later calendar
integrations.

#### `role_profiles`

Stores the structured Job Card role description and archive state.

#### `role_profile_assignments`

Connects current and historical role holders through dated assignment rows.

#### `responsibility_areas`

Stores reusable organization-level responsibility domains.

#### `role_profile_responsibility_areas`

Connects reusable responsibility areas to role profiles.

#### `role_profile_committees`

Connects a role profile to one or more committees.

#### `task_templates`

Stores reusable task definitions with committee, category, and optional
relative deadline.

#### `role_documents`

Stores validated document and knowledge links for a role profile.

#### `onboarding_guides`

Stores the role introduction, first-30-days plan, and practical onboarding
information.

### Historical Context and AI

#### `context_chunks`

Stores searchable representations of agenda items, notes, decisions, tasks,
and attachments with embeddings and source metadata.

#### `ai_analyses`

Stores structured preparation, discussion, decision, risk, task-extraction,
and historical-context analyses.

#### `ai_task_proposals`

Keeps proposed AI tasks separate from authoritative tasks until a person
accepts, edits, or rejects them.

#### `ai_jobs`

Provides a PostgreSQL-backed queue for extraction, embedding, analysis, and
generation workflows.

#### `ai_usage`

Tracks model, token usage, estimated cost, user, committee, and related job.

#### `audit_logs`

Stores append-only records for sensitive membership, decision, task, and
configuration changes.

## Key Relationships

```text
Organization
├── Organization Members
└── Committees
    ├── Committee Members
    ├── Meetings
    │   └── Agenda Item Occurrences
    ├── Agenda Items
    │   ├── Notes
    │   ├── AI Analyses
    │   ├── Decisions
    │   ├── Tasks
    │   └── Context Chunks
    ├── Task Workflow
    │   └── Task Columns
    ├── Annual Wheels
    │   └── Annual Wheel Items and Instances
    └── Job Cards
        └── Job Card Assignments
```

## Frontend Route Structure

Annual Wheel routes are:

- `/organizations/[organizationId]/annual-wheel`
- `/organizations/[organizationId]/committees/[committeeId]/annual-wheel`

Both routes use the same RLS-scoped read model and calendar component. The
committee route starts with its committee filter selected; neither route
creates a parallel planning domain.

The organization Job Card handbook is available at
`/organizations/[organizationId]/job-cards`. It combines role maintenance,
onboarding, task-template instantiation, and read-only operational context in
one route without introducing a second membership or task system.

```text
/
├── login
├── signup
├── forgot-password
├── invite/[token]
├── onboarding
└── organizations/[organizationId]/
    ├── dashboard
    ├── members
    ├── decisions
    ├── committees
    └── committees/[committeeId]/
        ├── dashboard
        ├── meetings
        │   ├── new
        │   └── [meetingId]/
        │       ├── agenda
        │       ├── live-notes
        │       ├── ai-review
        │       └── outcomes
        ├── agenda-items
        │   ├── backlog
        │   └── [agendaItemId]/
        │       ├── overview
        │       ├── notes
        │       ├── analysis
        │       ├── decisions
        │       ├── tasks
        │       ├── history
        │       └── attachments
        ├── tasks
        │   ├── workflow
        │   ├── my-tasks
        │   └── completed
        ├── decisions
        ├── annual-wheel
        │   ├── calendar
        │   ├── list
        │   └── templates
        ├── job-cards
        │   └── [jobCardId]
        ├── history
        ├── members
        └── settings
```

The Agenda Item page is the primary work surface. It should place historical
context, notes, AI analysis, decisions, and task execution in one coherent
workflow.

Phase 2B.1 also exposes the organization-scoped task register at
`/organizations/[organizationId]/tasks`.

Phase 2B.3 reuses that register and its modal from meeting, agenda-item, and
decision contexts. Related-task links return to
`/organizations/[organizationId]/tasks#task-[taskId]`.

Phase 2B.4 exposes the active user's deadline-oriented view at
`/organizations/[organizationId]/tasks/my`.

## API Route Structure

Server Actions should handle most same-application mutations. Route handlers
are reserved for streaming, uploads, callbacks, scheduled jobs, and external
integrations.

```text
/api
├── auth/callback
├── organizations/[organizationId]/
│   ├── members
│   ├── invitations
│   ├── members/[memberId]
│   └── decisions
├── decisions/[decisionId]
├── committees/[committeeId]/
│   ├── members
│   ├── meetings
│   ├── agenda-items
│   ├── tasks
│   ├── annual-wheel
│   └── job-cards
├── meetings/[meetingId]/
│   ├── agenda
│   ├── attendees
│   └── outcomes
├── agenda-items/[agendaItemId]/
│   ├── notes
│   ├── analysis
│   ├── decisions
│   ├── task-proposals
│   └── history
├── ai/
│   ├── prepare-agenda-item
│   ├── analyze-discussion
│   ├── extract-tasks
│   └── historical-context
├── jobs/[jobId]
├── webhooks
└── cron/process-ai-jobs
```

Each request must authenticate the user, verify organization and committee
membership, enforce role permissions, validate input, invoke a service, and
audit sensitive changes.

Phase 2B.1 uses `GET` and `POST` on
`/api/organizations/[organizationId]/tasks` and `PATCH` on
`/api/tasks/[taskId]`. These routes call the task service and do not bypass
PostgreSQL Row Level Security.

Phase 2B.3 extends the existing task payload with optional `meetingId`,
`agendaItemId`, and `decisionId`; it introduces no parallel task endpoint.

Meeting minutes use:

- `GET /api/meetings/[meetingId]/minutes`
- `PUT /api/meetings/[meetingId]/minutes`
- `PUT /api/meetings/[meetingId]/agenda-items/[agendaItemId]/minutes`
- `POST /api/meetings/[meetingId]/minutes/approval`
- `POST /api/meetings/[meetingId]/minutes/attachments`
- `GET /api/meetings/[meetingId]/minutes/pdf`
- `GET /api/minutes-attachments/[attachmentId]/download`
- `POST /api/transferred-agenda-items/[transferId]`
- `PATCH /api/transferred-agenda-items/[transferId]`

The meeting-level endpoint creates or updates the single general minutes
record, including status changes. The agenda-item endpoint creates or updates
the structured minutes for that item occurrence and synchronizes any matching
transfer intent. `POST` schedules a pending transfer through the atomic
database function, while `PATCH` dismisses it. Both repeat committee-manager
authorization before the database independently enforces the same role check.

The membership endpoints call PostgreSQL functions for invitation creation,
role changes, and removals. These functions repeat authorization checks and
protect the last-owner invariant so security does not depend on hidden UI
controls or service code alone.

## Trash And Retention

The first trash foundation applies to `committees`, `meetings`,
`agenda_items`, and `agenda_item_occurrences`. Each table stores
`deleted_at`, `deleted_by`, and `delete_expires_at`; the protected PostgreSQL
functions set a 30-day expiry and enforce existing committee-management
authorization independently of the service layer.

Normal repositories filter out rows with `deleted_at`. Restore repositories
load a specific trashed row explicitly and services repeat organization and
committee scope validation before invoking the restore function.

Deletion propagation follows ownership without destroying durable memory:

- Committee trash propagates to active meetings and occurrences.
- Meeting trash propagates to active occurrences.
- Durable agenda items do not follow committee or meeting trash.
- Explicit agenda-item trash propagates to its occurrences.
- Decisions, tasks, minutes, and historical records remain unchanged.

Direct table `DELETE` access is revoked for the covered records. Permanent
deletion, expiry jobs, and trash UI are intentionally deferred.

## AI Architecture

### Principle

AI turns committee discussion into durable memory and accountable execution.
It does not replace human authority.

### Agenda-Item Pipeline

```text
Open agenda item
→ Load exact relational history
→ Retrieve semantically related context
→ Generate preparation or discussion analysis
→ Propose decisions and tasks with evidence
→ Human review
→ Confirm authoritative records
→ Re-index accepted outcomes
```

### Historical Context Engine

The engine combines:

1. **Relational retrieval** for exact agenda-item history, decisions, open
   tasks, role assignments, and Annual Wheel obligations.
2. **Semantic retrieval** through `pgvector` for similar discussions and
   related topics.

Ranking should prioritize:

1. The same agenda item.
2. Explicit agenda-item links.
3. The same committee.
4. Current decisions and open tasks.
5. Recency.
6. Semantic similarity.

The generated historical brief includes prior discussions, decision history,
unfinished commitments, completed work, recurring concerns, related topics,
and source citations.

### AI Task Extraction

AI produces task proposals containing:

- Proposed title and description
- Suggested Committee Member or Job Card
- Suggested due date
- Confidence
- Evidence references
- Related agenda item and decision

Proposals remain in `ai_task_proposals` until a person accepts, edits, or
rejects them. Only accepted proposals create `tasks`.

### AI Guardrails

- Apply organization and committee filters before vector retrieval.
- Exclude private notes from shared analysis.
- Treat retrieved content as data, not instructions.
- Require structured output validation.
- Cite notes, decisions, tasks, or attachments used as evidence.
- Clearly identify superseded decisions.
- Require human confirmation for decisions and tasks.
- Store model, prompt version, latency, token usage, and sources.

### Background Processing

Use `ai_jobs` as a PostgreSQL-backed queue during the MVP. A protected scheduled
endpoint claims and processes jobs. Introduce dedicated queue infrastructure
only after measured volume or reliability needs justify it.

## MVP Phases

### Phase 1: Committee Memory and Execution

- Supabase authentication and onboarding
- Organizations, committees, invitations, and memberships
- Committee Dashboard and Committee Workspace
- Meeting creation and attendance
- General and agenda-item meeting minutes with approval status
- Agenda-item backlog and meeting scheduling
- Agenda-item notes and historical timeline
- Decision recording
- Configurable Task View
- Manual task assignment and deadlines
- AI preparation brief with citations
- AI task extraction with human confirmation
- Basic Annual Wheel and Job Cards
- Row Level Security, audit logging, and AI usage tracking

**Success criterion:** A committee can prepare a meeting, preserve each topic's
history, record decisions, and track resulting actions.

### Phase 2: Operational SaaS

- Subscription billing and usage limits
- Email notifications and task reminders
- Microsoft and Google authentication
- Calendar integration
- Advanced task filters and reporting
- Decision and task export
- Annual Wheel templates
- Improved Job Card workflows
- Full-text and semantic search across committee history
- Version history and retention controls

**Success criterion:** Multiple independent organizations can onboard, operate,
and pay for the service.

### Phase 3: Intelligence and Scale

- Real-time collaborative notes
- Transcription integrations
- Cross-meeting trends and unresolved-theme detection
- Advanced approval workflows
- Enterprise SSO and automated provisioning
- Regional data residency
- Dedicated background-job infrastructure
- AI evaluation, prompt versioning, and quality monitoring
- Public API and external integrations

**Success criterion:** The system supports complex organizations while
preserving reliable committee memory, accountability, and tenant isolation.
