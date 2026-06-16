# AI Committee Assistant

## Product Principle

> Help committees remember decisions and execute actions.

The product is designed primarily for associations, sports clubs, volunteer
organizations, and local committees. It gives each committee a durable memory
of what was discussed, what was decided, who accepted responsibility, and what
must happen next.

## Domain Hierarchy

```text
Organization
└── Committee
    ├── Meetings
    ├── Agenda Items
    ├── Notes
    ├── Meeting Minutes
    ├── AI Analysis
    ├── Tasks
    ├── Annual Wheel
    └── Job Cards
```

An organization is the tenant and security boundary. An organization may have
one or more committees, and every committee owns its meetings, agenda items,
tasks, recurring responsibilities, and role definitions.

Organization membership uses the roles `owner`, `admin`, `member`, and
`viewer`. In the Danish UI these are shown as Ejer, Administrator, Medlem, and
Observatør. Owners and administrators manage invitations and memberships, but
only owners may grant or remove the owner role. Every organization must retain
at least one active owner.

Owners may also create members manually with a temporary password and zero,
one, or multiple committee assignments. Each selected committee has its own
committee role. This workflow uses the Supabase Admin API exclusively on the
server and may only assign non-owner organization roles.

## Central Entity

The **Agenda Item** is the central product entity.

```text
Agenda Item
→ Notes
→ AI Analysis
→ Decisions
→ Tasks
→ Historical Context
```

A meeting schedules agenda items, but it does not own their complete history.
An agenda item is a durable topic that may appear in multiple meetings and must
retain all related notes, analyses, decisions, tasks, and historical context.

## Core Workflows

### Before a Meeting

1. Select existing agenda items or create new ones.
2. Review previous discussions, decisions, and unfinished tasks.
3. Generate an AI preparation brief.
4. Identify missing information and decisions required.

### During a Meeting

1. Capture notes against the active agenda item.
2. Record proposed or confirmed decisions.
3. Use AI to summarize discussion and identify unresolved questions.
4. Extract proposed tasks with supporting evidence.

### After a Meeting

1. Confirm decisions.
2. Review, edit, accept, or reject AI task proposals.
3. Assign owners and deadlines.
4. Carry unresolved agenda items forward.
5. Update the agenda item's historical context.

## Product Areas

### Committee Dashboard

An attention-oriented overview of upcoming meetings, unresolved decisions,
overdue tasks, unassigned work, and approaching Annual Wheel obligations.

The Phase 1.6-B1 committee page uses existing meeting, minutes, agenda-item
minutes, transfer, and membership data to show the next meeting, a compact
upcoming schedule, recent accessible minutes, points requiring action, and
committee members. It does not create a separate dashboard domain or bypass
the existing service authorization and Row Level Security boundaries.

The Phase 1.6-B2 organization page composes an organization-wide overview from
the same existing records. It shows compact metrics, committee summaries,
upcoming meetings, recent accessible minutes, and action-required agenda items
across the committees visible to the current user. This is a presentation read
model only; committee membership and PostgreSQL Row Level Security still
determine which underlying records are returned.

### Committee Workspace

The operational home for a committee's meetings, agenda items, tasks, Annual
Wheel, Job Cards, history, members, and settings.

### Meetings

Time-bound working sessions that schedule agenda items. Meetings provide
attendance, ordering, timing, meeting-specific outcomes, and one approval flow
for meeting minutes.

New meetings are created atomically with three editable standard agenda items:
Godkendelse af dagsorden, Godkendelse af seneste referat, and Eventuelt.
Eventuelt is kept last when additional items are scheduled. Standard items use
stable metadata and may be edited or removed by committee managers.

The previous-minutes approval item resolves the newest accessible meeting in
the same committee whose `starts_at` is before the current meeting. It shows
the previous meeting and minutes status inline and opens a read-only minutes
dialog on demand. The dialog includes general and agenda-item minutes but
intentionally excludes the internal note.

Committee managers can add an ordinary agenda item directly from the meeting
page in a modal without leaving the meeting workflow. The modal reuses the
same validated creation API and form fields as the standalone create page.
After creation it closes and refreshes the meeting agenda in place.

Agenda-item creation requires one explicit destination choice. Selecting an
existing meeting schedules the item on that meeting and leaves `target_date`
empty. Selecting a date keeps the item unscheduled in the backlog and stores
the date in `target_date`. The application and PostgreSQL function reject
requests with neither destination or both destinations.

### Meeting Minutes

Each meeting has one general minutes record and may have one minutes record per
scheduled agenda item. General minutes move through `draft`,
`ready_for_approval`, and `approved`. Agenda-item minutes capture notes,
decisions, follow-up, an optional responsible person, an optional deadline, and
a local workflow status. Meeting pages present agenda-item minutes as
expandable sections so committees can work through one item at a time.
Available statuses depend on whether the agenda item is information,
discussion, decision, or follow-up. Responsible person and deadline remain
optional until the selected status or follow-up text creates an action.

Organization owners and administrators plus committee chairs and secretaries
may edit minutes. Committee members may read relevant minutes. Committee
viewers may only read minutes after the general meeting minutes are approved.
These rules must be enforced in services and PostgreSQL Row Level Security.

Editable minutes use debounced autosave through the existing authenticated API.
Every change is first stored as a user-scoped browser draft. Failed or offline
writes retain that draft, reconnecting retries synchronization, and differing
local/server versions require an explicit restore-or-discard choice.

Minutes fields use a shared TipTap rich text editor for headings, bold, italic,
underline, lists, quotations, links, undo/redo, and clearing formatting.
Content is stored as sanitized HTML in the existing text columns. A strict
allowlist is applied in the client, again in the service layer before
persistence, and before rendering. Existing plain text remains readable and is
converted without losing line breaks.

Committee managers send saved minutes to all active, voting committee members
with a required approval deadline. Each approver records an approval or a
change request with a required comment. After the deadline, managers may mark
pending responses as no response. A meeting minutes record becomes approved
only when no pending or change-requested responses remain. Re-sending starts a
new approval round by resetting the relevant members to pending.

Meeting and agenda-item minutes support private attachments in Supabase
Storage. Metadata remains relational and tenant-scoped, while downloads use
short-lived signed URLs after RLS authorization. Approved minutes open in a
document-oriented read view and can be exported as a server-generated PDF.
The PDF includes meeting context, agenda, public minutes, follow-up,
approvals, and attachment metadata, but never the internal note.

Type-specific point-minute statuses may create a transfer intent for unresolved
work. Transfer intents are separate from standard agenda items and retain the
source meeting, agenda item, occurrence, point minutes, reason, source status,
and proposed target type. Committee managers may select the next meeting after
the source meeting or a specific later meeting. Scheduling atomically creates
a linked agenda item with the proposed type, preserves relevant minutes
context, and records the target meeting and agenda item. If no later meeting
exists, the intent remains pending. Deadlines remain independent of meeting
selection.

### Agenda Items

Durable topics that connect discussion to memory and execution. Agenda items
may be deferred, revisited, related to other topics, or resolved over several
meetings.

Agenda items do not expose a generic lifecycle workflow. Their user-facing
state is expressed through O/D/B/F type, meeting or target date, point-minutes
status, standard or transferred origin, and meeting history. The original
Phase 1 `lifecycle_status` column remains only as a non-destructive database
compatibility field for existing records and scheduling functions; it is not
editable or displayed in the UI.

### Notes

Human or AI-generated records attached to an agenda item. Notes may be scoped
to a specific meeting occurrence and may have private, committee, or
organization visibility.

### AI Analysis

Structured preparation, discussion, decision, risk, task-extraction, and
historical-context analysis. AI output is advisory and must cite its sources.

Phase 2C.1 introduces the first server-side AI task-suggestion flow. Authorized
task editors may analyze either the general meeting minutes or one agenda-item
minutes record. The service sends only public minutes fields, never the
meeting's internal note, and converts sanitized rich text to plain text before
analysis. Referat content is treated as untrusted data.

OpenAI Structured Outputs produce validated suggestions with title,
description, optional responsible name, optional deadline, source context, and
confidence. The application validates the parsed result again and returns an
empty list for empty minutes. Requests use `store: false`; prompts and minutes
content are not logged by application code. Responses include model,
prompt version, completion status, source references, and token usage. This
phase stores no AI result and never invokes task creation directly. Phase
2C.2 adds a temporary review modal where authorized task editors can approve,
reject, and edit each suggestion's title, description, responsible person,
deadline, and category. Only an explicit click on `Opret godkendte opgaver`
sends approved items through the ordinary task service and RLS-protected task
creation flow. Rejected suggestions and cancelled reviews create no records.

Phase 2C.3 enriches each proposal with separate responsibility and deadline
confidence. The server supplies only active committee member names to the
model, then maps a returned name to `responsible_user_id` only when one member
matches exactly or unambiguously. Relative deadline signals are resolved
deterministically: `inden næste møde` and `til næste gang` use the first later
meeting in the same committee, `hurtigst muligt` proposes seven days after the
source meeting, and `inden generalforsamlingen` uses a later meeting whose
title identifies it as a general assembly. Missing or ambiguous context leaves
the field empty. All values remain editable or removable in review.

Phase 2C.4 keeps AI-created work in its source context. Meeting-minute
proposals always retain the authorized meeting id, and agenda-item-minute
proposals retain both meeting and agenda-item ids. The model sees only titles
of non-cancelled decisions from that meeting. A decision is suggested only
when its title matches unambiguously, or when a point has exactly one existing
decision. Review shows linked meeting, point, and decision, and the decision
can be changed or removed. The ordinary task service validates every selected
relation again before persistence.

Phase 2C.5 hardens the suggestion boundary with a board-work-specific prompt
and a strict Structured Outputs contract. The model returns proposal content
only; organization, committee, meeting, agenda-item, and decision relations
are derived or verified from authorized server context. Unknown fields,
invalid calendar dates, refusals, incomplete responses, and malformed output
become controlled Danish errors with retry in the review modal. Empty minutes
or minutes without concrete unfinished work produce no proposals. Diagnostics
record only operational metadata, never minutes text or API keys, and task
creation still requires an explicit human confirmation through the ordinary
RLS-protected task service.

Phase 2C.6 places the manual AI trigger beside the general and point minutes
workflows. The trigger remains visible but unavailable while minutes are a
draft, with guidance to mark them ready for approval; ready and approved
minutes can be analyzed only after an explicit click. The review compares
proposal titles with already loaded tasks from the same meeting or agenda item
and with other proposals in the current session. Obvious matches are
pre-deselected and shown with a warning, while the user retains final control.
Successful creation links directly to Task View. No status transition runs AI,
and no suggestion becomes a task without review and explicit confirmation.
The meeting page also offers one `Foreslå opgaver fra hele referatet` action.
Its single authenticated request analyzes the accessible general minutes and
every agenda-item minutes record with content. Each source is parsed
separately so the server, not the model, assigns the meeting and optional
agenda-item relation. The resulting proposals share the existing review,
duplicate warnings, editing, rejection, and explicit creation flow. Existing
single-source actions remain available.

Phase 3 consolidates organization-level navigation and attention. A sticky,
responsive organization navigation exposes Overview, Meetings, Decisions,
Task View, My Tasks, and Members with active-route treatment while preserving
all existing URLs. The organization overview adds compact RLS-scoped excerpts
of the current user's open tasks, organization-wide open tasks, and active
decisions alongside the existing meeting and committee overview. On meeting
pages, related work is progressively disclosed, the whole-minutes AI action is
the primary extraction entry, and point-specific AI analysis moves under
secondary actions. No domain state, route, or permission model changes.

The first AI Assistant for committee memory lives on the Agenda Item page. It
builds an authorized preparation brief from the agenda item's prior meeting
occurrences, accessible point minutes, related decisions, and open tasks.
Last-discussed date, decisions, and tasks remain deterministic relational
facts. OpenAI Structured Outputs are used only for source-grounded discussion
questions and possible future agenda items. Every suggestion must cite
server-issued source ids; unknown citations are discarded. Retrieved minutes
are untrusted data, internal notes are excluded, requests use `store: false`,
and the assistant never creates or changes decisions, tasks, or agenda items.

### Tasks

Tasks are executable work and remain separate from decisions, which preserve
authoritative outcomes and history. Phase 2B.1 introduces a standalone,
committee-scoped task register with manual creation and editing, workflow
status, optional responsible committee member, deadline, category, internal
note, completion timestamp, and archival timestamp.

Organization owners and administrators plus committee chairs, secretaries,
and members may create and edit tasks through the existing editor permission
model. Committee viewers have read-only access. PostgreSQL independently
validates organization/committee scope and active responsible membership, and
RLS protects reads and writes. The Phase 2B.1 organization task page starts as
a compact list. Phase 2B.2 adds a presentation-only **Task View** over the same
RLS-scoped task register. Tasks are grouped by the five existing statuses and
can be moved with an accessible status selector; no drag-and-drop library or
configurable workflow column model is introduced. Users can switch between
board and list views, search title and description, and combine status,
committee, responsible person, category, and archived filters. Compact cards
show responsibility, deadline, category, committee, overdue state, and edit
or archive actions.

Phase 2B.3 connects tasks to their working context without merging tasks and
decisions. A task may optionally reference a meeting, agenda item, and
decision in the same organization and committee. Authorized users can create
an editable task proposal from each context; agenda-item minutes offer their
current follow-up text, responsible person, and deadline as defaults. Meetings,
agenda items, and decisions show compact related-task lists, and the task
register links back to every stored source relation. Multiple tasks may point
to the same decision through separate `tasks.decision_id` rows.

Task creation always requires explicit human submission. AI task suggestions
use the same task service as manually entered tasks after human review;
automatic task creation remains intentionally excluded.

Phase 2B.4 adds an organization-scoped **Mine opgaver** view for the active
user. The server query filters by `responsible_user_id` before returning the
RLS-visible rows. Open, non-archived tasks are the default and are ordered by
nearest deadline with undated work last. The view highlights overdue, due
today, and waiting work, supports the existing authorized status and
completion mutations, links to meeting, agenda item, and decision context, and
opens the shared task editor in Task View when the user has edit permission.

Phase 2B.5 adds a compact, append-only task comment thread for practical
follow-up. Comments inherit the task's organization and committee scope,
record their author and timestamp, and are shown in the existing task editor.
Relevant committee members and organization administrators may read comments;
the existing task editor permission controls creation. Comments are not a full
audit log, chat, notification, mention, or attachment system.

Phase 2B.6 prepares tasks for later reminders and email delivery without
sending anything automatically. Editors may set `reminder_at`; reserved
delivery markers record when a future worker sends or last notifies. The task
repository can identify open work due within seven days, overdue work, and
unsent reminders whose time has passed. Task View and Mine opgaver distinguish
deadlines due today, due soon, and overdue, and show a configured reminder.
No cron job, email provider, push channel, or notification center is included.

### Decisions

Phase 2A.1 introduces an organization-wide decision register backed by
committee-scoped records. A decision has a title, optional description,
workflow status, decision date, optional responsible committee member,
deadline, category, and internal note. It may reference a meeting and agenda
item in the same organization and committee.

Organization owners and administrators plus committee chairs, secretaries,
and members may create and edit decisions under the existing agenda-item
editor permission model. Committee viewers have read-only access. PostgreSQL
validates every optional relationship and Row Level Security independently
enforces organization and committee access. The register supports manual
creation, editing, cancellation, archival, title/description search, and
status and committee filters. It does not yet create tasks or decisions from
minutes or AI output.

Phase 2A.2 connects the register to the meeting workflow without making
minutes text authoritative by itself. Authorized editors can open a decision
modal from the meeting or an individual agenda item. Organization, committee,
meeting, decision date, and optional agenda item are prefilled from the active
context; point title, current decision text, responsible person, and deadline
are offered as editable defaults. Saving still requires an explicit human
action through the existing decision service and RLS-protected API.

Meeting pages show a compact list of decisions linked to the meeting, and each
agenda-item section shows decisions linked to that item. These links open the
organization decision register at the relevant record, while register entries
retain their existing links back to meeting and agenda item.

Phase 2A.3 adds predictable decision context without AI matching. An agenda
item's decision topic is the normalized category of decisions explicitly
linked to that item. Historical matches must belong to the same committee and
have the exact same category after trimming and case normalization. On a
meeting, only decisions dated before the current meeting are shown as prior
context. Archived and cancelled decisions remain visible with explicit
labels. If no linked decision establishes a category, the UI explains that a
category is needed before topic history can be assembled.

Phase 2A.4 improves the organization decision register without changing its
security or storage model. Users can combine title/description search with
status, committee, responsible person, meeting, exact normalized category,
decision-date range, and deadline range filters. Results can be ordered by
decision date, nearest deadline, or workflow status. Overdue open deadlines,
archived records, and cancelled records are marked explicitly, while empty
states distinguish an empty register from filters that return no matches.
Filtering operates only on the RLS-scoped register read model already returned
to the authenticated user.

Phase 2A.5 lets authorized users turn current minutes text into an editable
decision proposal without AI or editor coupling. From an agenda item, the
source priority is the explicit decision text, then notes, then follow-up; the
agenda-item title, meeting relation, agenda-item relation, responsible person,
deadline, and known category are prefilled when available. From general
meeting minutes, the combined decisions field is preferred over the narrative
minutes text. The shared decision modal receives plain text converted from the
sanitized rich text and still requires human review and submission before an
authoritative decision is created. TipTap text selection is intentionally not
part of this phase.

### Annual Wheel

The Annual Wheel is the shared strategic calendar for organization and
committee planning. `annual_wheel_events` stores one row per occurrence with a
stable `series_id`, RRULE-compatible recurrence metadata, priority, optional
responsible member, optional committee scope, and optional meeting/task links.
Recurring creation materializes future occurrences while keeping each
historical occurrence independent; editing or removing one future occurrence
does not rewrite prior history.

The organization and committee routes provide year, quarter, and month views.
The same read model overlays RLS-visible meetings, task deadlines, and decision
deadlines without copying those records into the Annual Wheel table. Filters
cover committee, responsible member, and calendar item type.

The Annual Wheel AI assistant runs only after an explicit user action. It
receives the already authorized planning read model, treats all source content
as untrusted data, uses Structured Outputs, and returns source-grounded
activity and agenda-item suggestions. Suggestions are advisory: choosing one
only opens the normal activity form, and no record is created without human
review and submission.

### Job Cards

Job Cards are the organization's digital role handbook. `role_profiles`
stores purpose, scope, responsibilities, exclusions, competencies,
collaboration, meeting expectations, and contact knowledge. Reusable
`responsibility_areas` connect common domains such as finance, members,
sponsorship, communication, facilities, events, and sporting operations to
multiple roles.

Roles may be linked to multiple committees and active members. Assignment
changes close the previous assignment with an end date instead of deleting
history. Documents are stored as validated HTTP(S) links in the first MVP.
Each role may contain reusable task templates and one onboarding guide.
Creating work from a template produces a normal task through existing
committee authorization and RLS, optionally assigning the active role holder.

The Job Card page combines the written role description with open related
tasks, linked Annual Wheel occurrences, relevant committee decisions, role
documents, and first-30-days onboarding. Owners and administrators maintain
the handbook; organization members may read it.

The AI draft flow is manual and advisory. It analyzes only RLS-visible
minutes, tasks, decisions, and Annual Wheel activity, returns one structured
source-grounded draft, and opens the normal edit form. AI never saves or
overwrites a Job Card automatically.

## Technology

- Next.js with the App Router
- TypeScript
- Supabase Authentication and Storage
- PostgreSQL with Row Level Security
- `pgvector` for semantic retrieval
- OpenAI Responses API

## Visual Foundation

The interface uses semantic CSS variables for brand colors, surfaces, text,
borders, status colors, typography, spacing, radii, and shadows. Components
consume these values through shared CSS classes and Tailwind aliases rather
than choosing isolated palette values. The default visual direction is calm,
institutional, and document-oriented: warm off-white backgrounds, near-black
text, deep petroleum primary actions, and muted status colors.

The existing Phase 1.6-A1 shell and navigation structure remains the layout
foundation. Phase 1.6-A2 adds tokens beneath it and preserves compatibility
aliases such as `forest`, `mist`, `line`, and the existing status utility
classes. Future organization branding may override the semantic variables at
an organization-scoped root without changing component markup.

Phase 1.6-A3 defines the shared composition layer in `src/components/ui`.
Pages use `PageHeader` and `PageSection` for hierarchy, `ContentPanel` only
when a bounded surface adds meaning, and `DocumentPanel` for minutes and other
document-like content. Forms, actions, statuses, empty states, tables, modals,
and dropdowns use shared components backed by the Phase 1.6-A2 tokens.
Business workflows and authorization remain in the existing page, service,
repository, and RLS layers; the UI components contain presentation behavior
only.

Phase 1.6-A4 applies this foundation to meetings, agendas, and minutes. A
meeting uses one document header for title, committee, date, meeting status,
minutes status, location, attendee count, agenda count, and transfer count.
Agenda items retain their interactive accordions but use document numbering,
compact O/D/B/F markers, subdued metadata, and calm treatments for standard,
transferred, and Eventuelt items. Approved minutes use a readable document
surface where decisions and follow-up are visually distinct without becoming
dashboard cards. Approval, attachments, previous minutes, and transfer
scheduling retain their existing behavior inside the same visual hierarchy.

Phase 1.6-A4.1a presents every central agenda-item title in document form:
`(O) Title`, `(D) Title`, `(B) Title`, or `(F) Title`. The marker is derived
from the existing `item_type` and changes presentation only; numbering, data,
permissions, transfers, and minutes workflows remain unchanged.

Phase 1.6-A4.1b adds a collapsed agenda preview to committee meeting lists.
Each meeting summary includes agenda, decision, and follow-up counts and can
reveal at most the first five agenda items using the same document-title
format. The list query selects only occurrence position and agenda-item
identity, title, and type for this preview.

Phase 1.6-A4.1c reduces the visual weight of open agenda-item minutes without
changing their fields or behavior. Narrative fields remain primary, status and
follow-up controls share a compact responsive row, editor minimum heights are
reduced, and attachments are grouped in a collapsed extra section.

Phase 1.6-A4.1d presents minutes governance as compact status-first rows.
Approval progress, deadline, response exceptions, and PDF availability remain
visible immediately, while member responses and management controls open on
demand. Attachment areas show only their file count initially and reveal
upload and file actions inside a disclosure panel.

Phase 1.6-A4.1e moves meeting and agenda-item editing into modal workflows on
their primary context pages. Both modal and fallback edit routes use the same
shared PATCH forms, field definitions, validation responses, services, and
permissions. Successful modal updates close the dialog and refresh the current
server-rendered context without navigation.

Phase 1.6-A6 keeps TipTap formatting available while reducing its visual
weight. Bold, italic, lists, and links remain immediately accessible; less-used
formatting and history actions are grouped under a compact secondary menu.
This is a presentation change only and does not alter rich-text storage,
sanitizing, autosave, offline drafts, or PDF rendering.

Phase 1.6-A7 closes the visual phase with a documented design contract and
regression QA. The component catalog, semantic tokens, branding extension
boundary, non-goals, and shared-flow checklist live in
`docs/design-system.md`. New UI should compose the shared primitives and
semantic tokens rather than add isolated palette values or organization-
specific styling.

## MVP Constraints

- Build as one Next.js application.
- Use PostgreSQL as the source of truth.
- Use Supabase Row Level Security as the final tenant-isolation boundary.
- Route membership changes through protected PostgreSQL functions that enforce
  owner invariants independently of the application UI.
- Keep documents and attachments secondary to agenda-item workflows.
- Require human confirmation before AI output becomes an authoritative
  decision or task.
- Prefer simple PostgreSQL-backed asynchronous jobs before introducing a
  separate queue platform.

## Trash And Retention Foundation

Committees, meetings, durable agenda items, and agenda-item occurrences use
soft delete metadata: `deleted_at`, `deleted_by`, and `delete_expires_at`.
Moving a record to trash sets a 30-day retention deadline; restoring it clears
all three fields. Application repositories exclude trashed records from normal
reads, while dedicated restore paths may load them explicitly.

Trashing a committee also trashes its active meetings and agenda-item
occurrences. Trashing a meeting also trashes its active occurrences. Durable
agenda items are not cascaded when a committee or meeting is trashed because
they remain part of the organization history and may occur in several
meetings. Trashing a durable agenda item is therefore an explicit, separate
operation and also trashes its occurrences.

Restore operations only restore child rows carrying the exact deletion marker
and actor from the parent operation. This preserves rows that were already in
trash independently. Hard delete and automatic expiry processing are not part
of this foundation phase.

## Terminology Contract

Use **Organization**, **Committee**, and **Committee Member** consistently in
database names, API routes, frontend routes, TypeScript types, services,
repositories, tests, and UI copy.

The legacy organizational term beginning with `B` must not be introduced in
domain naming. A Kanban-style task interface should be called **Task View** or
**Task Workflow**, not by terminology that conflicts with the Committee model.
