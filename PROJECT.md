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

Individual Job Cards can be exported as read-only PDFs for onboarding,
printing, sharing, and role handover. The server-generated PDF includes the
role description, committees, current role holders, responsibility areas,
onboarding introduction, first 30 days, practical information, task templates,
related Annual Wheel events, related decisions, document links, and export
date. PDF export does not replace the editable Job Card and does not include
email delivery, signatures, template administration, or organization branding.

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

Update 2 introduces the first organization branding foundation. Optional
branding lives in `organization_branding` and can provide a logo URL, primary,
secondary, and accent hex colors, and one controlled font choice. The
organization workspace reads this data server-side, validates it, converts
safe colors to the existing RGB CSS variable format, and applies the variables
at the organization workspace root. Missing or invalid branding falls back to
the standard calm 7R theme, and there is no branding admin/editor, font upload,
external font URL, or complete white-label system in this phase.

Update 2.1 adds a small branding editor to the existing "Rediger organisation"
page. Organization administrators can save a secure logo URL, three optional
hex colors, and a controlled font choice through the ordinary server-side
service and RLS-protected `organization_branding` table. Empty fields continue
to use the fallback theme. The editor includes only a compact preview and does
not add logo upload, external font loading, or a separate branding page.

Update 2.2 adds server-side logo upload to that same branding section. Logos
are uploaded to the `organization-logos` Supabase Storage bucket under
`{organization_id}/logo/{uuid}.{ext}` and then written back to
`organization_branding.logo_url` as a public bucket URL. Uploads are limited to
PNG, JPG, and WEBP at 2 MB, SVG is intentionally excluded, and only
organization administrators can manage files for their organization path.
Clearing the logo URL still falls back to the standard no-logo display.

Update 2.3 applies the same validated organization branding to existing PDF
exports. `pdf-report.ts` accepts an optional PDF branding object with
organization name, primary/accent colors, and a best-effort logo image. The
minutes and Job Card PDF routes resolve branding server-side through
`OrganizationBrandingService` after ordinary access checks. Missing branding,
invalid colors, unsupported logo formats, or logo fetch failures never block
PDF generation; the standard report layout is used as fallback.

Update 2.4 applies organization branding to the email template foundation. The
shared email shell accepts validated organization name, logo URL, and
primary/accent colors, then renders simple inline-safe HTML with the same
fallback palette when branding is missing. Agenda email resolves branding
server-side through `OrganizationBrandingService` before rendering; private
minutes fields, internal notes, AI drafts, and non-approved suggestions remain
excluded. Stub and Resend delivery modes are unchanged, and there is no email
marketing editor or white-label mail system.

Update 2.5 makes branding usable in the workspace itself. Logo upload now
normalizes common PNG/JPG/WEBP MIME variants, reports concrete Danish upload
errors, and keeps the existing server-side API/storage flow. The controlled
font list is expanded to common safe web and system font names, including
Ubuntu, Share, Montserrat, Open Sans, Lato, Poppins, Nunito, Merriweather,
Georgia, Verdana, Tahoma, Trebuchet MS, Times New Roman, and Courier New; it
is still not free font upload or external font URL input. Organization
branding CSS variables now drive the sidebar, active navigation marker,
primary buttons, Quick Action portal, and branding preview with contrast
fallbacks for readable navigation. Organizations without branding still use
the standard 7R theme.

Update 2.5b fixes the runtime application of that branding. The selected font
is applied on the organization workspace root and on shared modals rendered
through portals, so dashboards, sidebars, forms, buttons, and Quick Action
dialogs inherit the active organization font. Quick Action passes the
organization CSS variables to both the topbar trigger and the modal overlay,
so primary actions use the active brand colors outside the normal workspace
DOM tree. Logo-upload errors now distinguish missing storage migration,
permission/RLS failure, unsupported file type, too-large files, Storage upload
failure, and failed `logo_url` persistence.

Update 2.5c fixes the Supabase Storage runtime path for organization logos.
The upload service now sends a neutral file body to Storage instead of the
route `File` object, while keeping MIME normalization, the 2 MB limit, and the
server-side administrator check. The storage policy migration is tightened to
the exact runtime path `{organization_id}/logo/{uuid}.{ext}` and remains
idempotent for the `organization-logos` bucket. Existing branding is only
updated after a successful upload; failed uploads leave the previous logo URL
unchanged. Deployments must apply the storage migration, for example with
`supabase.cmd db push` on Windows.

Update 2.5d removes regex repetition from the logo storage path and URL
constraints. The logo URL check now uses simple length, `like`, and forbidden
character checks instead of bounded regular expressions. Storage path helpers
use `split_part(name, '/', ...)` to enforce
`{organization_id}/logo/{file}` without regex. This keeps organization logo
uploads scoped to organization administrators while avoiding PostgreSQL regex
repetition errors during `supabase.cmd db push`.

Update 2.5e improves logo presentation in the organization sidebar. Uploaded
logos are no longer shown as a small header thumbnail; when present, the logo
appears in a dedicated sidebar branding zone below navigation with centered
`object-contain` sizing and max dimensions that work better for both wide and
tall logos. The branding editor preview mirrors this placement, while
organizations without a logo keep the standard text-only sidebar fallback.

Update 2.5f removes that dedicated sidebar logo zone again after browser
testing showed it made logos look like a heavy white block in the navigation.
The organization sidebar is now intentionally branded by organization name,
color variables, active navigation treatment, and font. Uploaded logos remain
available for the branding editor preview, PDF exports, and email templates,
but they are not used as large decorative sidebar elements.

Update 12 makes the meeting page more usable as a live meeting workspace. The
meeting header is followed by a compact meeting overview with agenda count,
incoming transferred points, missing minutes, decision/follow-up indicators,
active decisions, and open tasks. Incoming transferred agenda items are shown
near the agenda with source meeting, source status, transfer reason, and a
direct jump to the relevant point when the transfer relation exists. Agenda
point headers now surface missing minutes, follow-up needs, and related
decision/task counts before the point is opened, while the existing autosave,
minutes status, AI, decision, task, attachment, PDF, and approval flows remain
unchanged.

Update 12.1 simplifies agenda-item minutes around a "notes first" workflow.
Each point now exposes one primary `Noter/referat` editor for live meeting
work, with AI help placed next to that editor. Creating decisions and tasks is
handled through compact `+ Beslutning` and `+ Opgave` actions that use the
point notes as the starting text. Follow-up status, responsible person,
deadline, transfer intent, legacy decision text, AI task analysis, and delete
actions are kept behind secondary panels so autosave and the existing minutes
model remain unchanged while the live meeting view shows fewer writing fields.

Update 12.1b keeps that workflow but calms the point card itself. Agenda points
use a tinted container with a lighter notes surface, expose point status as a
compact always-visible control, and use one shared inline action panel for
follow-up or extra fields. This keeps transfer/status behavior visible while
avoiding multiple floating action panels.

Timezone display is centralized around `Europe/Copenhagen` and `da-DK` in the
shared date-format helpers. Meeting times in UI, agenda emails, AI context,
Annual Wheel meeting placement, and PDF exports should use those helpers so a
stored UTC value such as `2026-06-26T15:00:00.000Z` is displayed as Danish
local time, for example `fredag den 26. juni 2026 kl. 17.00`.

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

PDF exports use the shared `src/lib/pdf-report.ts` layout foundation. Server
generators compose the same document header, metadata grid, section hierarchy,
status badges, tables, spacing, page footer, export date, and page numbering
instead of building one-off print layouts. The default PDF direction is a calm
A4 report suitable for sharing, printing, onboarding, and archiving. Existing
minutes and Job Card exports may apply organization branding in the shared
header and section colors, but PDF generation must remain usable without
branding or logo. Future agenda, decision, task, Annual Wheel, onboarding, and
Job Card exports should reuse this foundation before adding module-specific
content.

V1 PDF polish adds a dedicated agenda PDF download for meetings. The agenda
PDF can be downloaded before minutes are written or approved and includes the
meeting context plus agenda items in occurrence order without internal notes.
Minutes and agenda PDFs share the same branded report foundation and use
clearer agenda-item headers so long agendas and minutes are easier to scan.
PDF branding now carries the organization font choice into the report
foundation, but PDF readability takes priority over exact webfont matching.
Because the `pdf-lib` renderer cannot safely use browser CSS font stacks and
WOFF embedding produced unreadable glyph boxes in PDF readers, generated
agenda and minutes PDFs use safe built-in PDF fonts. Unsupported brand fonts
fall back server-side with a small diagnostic log instead of risking broken
text. The report header and agenda-item backgrounds still use the primary
brand color as a light print-friendly tint with a solid brand accent line
instead of the old default header surface.
Agenda PDF and agenda email use the shared Danish agenda-item type labels
instead of raw database values such as `decision` or `discussion`. Agenda
items include public purpose and background text when present, rendered through
the rich-text/plain-text helpers so HTML is not exposed and internal notes stay
out of the invitation/export.

Referattekst uses document prose styling in both the web UI and PDF exports.
Sanitized TipTap content is rendered with constrained line length, generous
line height, paragraph spacing, readable lists, and clearer subpoints. PDF
generators convert rich text into structured prose blocks so paragraphs,
line breaks, headings, list items, bold/italic text, and simple a/b/c
subpoints remain readable across page breaks.

Phase 7.1 establishes the next shared frontend design foundation. The app
shell, organization navigation, page headers, panels, action rows, filter
surfaces, metadata rows, tables, status badges, empty states, modals, and
feedback states now share calmer spacing, softer surfaces, clearer hierarchy,
and responsive wrapping rules. This is a presentation foundation only: it does
not change data models, RLS, services, repositories, or product workflows.
Later redesign phases should build on these shared patterns instead of adding
one-off Tailwind layouts.

Phase 7.2 redesigns the authenticated app shell and organization navigation on
top of that foundation. The global topbar now gives the app a calmer frame with
clear access back to organizations, while the organization navigation exposes
Overview, Meetings, Decisions, Tasks, My Tasks, Annual Wheel, Job Cards,
Members, and Trash in a compact responsive module rail. The active module and
organization context are visible without changing routes, data contracts,
permissions, or feature workflows.

Phase 7.2b replaces the horizontal organization module rail with a sidebar
workspace layout. On desktop and tablet, organization pages render navigation
as a left sidebar with full readable labels and a clear active state; content
stays in a separate right-hand work area. On mobile, the same navigation
collapses into a compact vertical block above the page content. Routes,
authorization, data models, services, and feature flows remain unchanged.

Phase 7.2c tightens the sidebar typography and spacing so organization
navigation reads more like a compact admin workspace than a marketing
navigation. Labels remain fully readable, active state remains clear, and the
change is limited to presentation density.

Phase 7.3 redesigns the organization front page as a compact control center.
The page prioritizes attention items, personal tasks, deadline pressure,
upcoming meetings, active decisions, recent minutes, and committee status using
the existing organization overview read model. It does not introduce new data
contracts or feature flows; it reorganizes the available RLS-scoped data into
a more useful daily workspace.

Phase 7.4 compacts meeting, agenda, and minutes surfaces without changing
meeting workflows. Meeting lists use scanable rows with lightweight agenda
previews, meeting headers use tighter metadata, agenda-item minute cards have
smaller summaries and editor surfaces, and governance, attachment, PDF,
transfer, decision, task, and AI actions remain available through the existing
components.

Phase 7.5 applies the same compact admin direction to Decisions and Tasks.
The decision register, Task View, My Tasks, task cards, filters, edit modals,
and task comments use quieter module surfaces, tighter metadata, and clearer
deadline/status emphasis. Decisions and tasks remain separate modules and the
change is presentation-only; task and decision services, repositories, RLS,
relations, comments, reminders, and status workflows are unchanged.

Phase 7R resets the densest Phase 7 surfaces around progressive disclosure
instead of further compaction. The organization dashboard now starts with
only attention items, critical deadlines, personal tasks, and the next meeting;
secondary organization-wide lists are folded into a calmer "more overview"
area. Meeting pages keep the existing agenda/minutes flows but reduce visible
secondary actions and move meeting trash, task/decision creation, transfers,
and supporting context behind explicit controls. Decision and task registers
hide filter forms until requested, and My Tasks presents one prioritized work
summary rather than many competing metric cards. No data model, service,
repository, RLS, AI, or route contract changes are part of this reset.

Phase 7R.1 turns organization navigation into a real admin shell. The
organization sidebar sits flush to the left edge as a dark, sticky navigation
surface, and dashboard module shortcuts are removed so the sidebar is the
single primary navigation pattern. The Meetings entry now opens a dedicated
organization-level meetings route instead of scrolling to a dashboard section.
Secondary organization actions are grouped under a discreet menu, and the
dashboard avoids prominent "create committee" chrome. This is a layout and
navigation change only; no domain, RLS, service, repository, or AI behavior is
changed.

Phase 7R.2 moves the organization workspace shell to the organization route
layout so every organization page and nested committee page shares the same
sidebar, including concrete meeting pages. The layout removes the top gap
created by page-shell padding, resolves organization name display centrally,
and keeps deep meeting and Annual Wheel routes highlighted in the sidebar.
The dashboard's "more overview" area is split into smaller disclosure groups
instead of one large mixed overview. The change remains presentation and route
composition only.

Phase 7R.3 streamlines headers and actions across the organization workspace.
Shared page headers now render as compact flat section headers instead of large
rounded panels. Secondary and destructive actions use a common "Flere
handlinger" menu pattern, while primary creation actions remain visible. The
committee overview, meeting detail, agenda-item detail, organization edit, and
organization dashboard adopt the same action hierarchy without changing the
underlying routes, services, permissions, or mutation behavior.

Phase 7R.4 makes the Annual Wheel easier to scan without changing its read
model. Month cards and the month detail view now order meetings first, separate
meetings from tasks, decision deadlines, and Annual Wheel activities, and keep
meetings and tasks actionable through their existing meeting routes and
task-edit links. The month detail view is a presentation-only modal over the
same RLS-visible overview data.

Phase 7R.5 brings Job Cards and onboarding into the same admin workspace
language. The Job Card register now uses flatter role-profile rows, keeps only
the primary creation action visible, moves PDF, AI update, and edit actions
behind the shared action menu, and presents onboarding, task templates,
documents, Annual Wheel links, and decision context as quieter role-profile
sections. Existing Job Card CRUD, AI draft review, task-template instantiation,
PDF export, services, permissions, and RLS behavior are unchanged.

Phase 7R.6 aligns secondary organization surfaces with the same admin layout.
Member administration now uses flatter invitation and manual-creation sections,
keeps destructive member removal behind the shared action menu, and preserves
the existing role and invitation workflows. The trash view presents restore
context and retention status more calmly. Organization, committee, meeting, and
agenda-item create/edit routes use compact `PageHeader` plus flat form sections
instead of older hero/panel layouts; all forms still submit to the same routes
and mutations.

Phase 7R.7 is a regression-polish pass across the organization workspace. It
keeps the existing sidebar shell and feature flows, but tightens responsive
defaults for action menus, tables, task summary surfaces, and workspace width so
mobile layouts are less likely to overflow. The pass is intentionally limited to
presentation consistency: no data model, RLS, service, repository, AI, or route
contracts changed.

Phase 7R.8 polishes the shared PDF/export foundation. The common PDF report
renderer now handles long titles, metadata values, table cells, and URLs more
defensively so exported minutes and Job Cards remain readable on A4. Job Card
PDF prose fields are rendered through the same sanitized rich-text-to-PDF
pipeline used by minutes, avoiding raw HTML while preserving the existing PDF
download routes and authorization flows.

Update 5 adds an AI minutes assistant for general meeting minutes and
agenda-item minutes fields. Authorized minutes editors can ask AI to improve
language, formality, brevity, neutrality, decision clarity, or professional
board style. The assistant runs server-side, validates meeting and committee
access, treats minutes text as untrusted data, and returns only a sanitized
suggestion for human review. Existing text is never overwritten until the user
explicitly chooses to apply the suggestion; rejected suggestions create no
records and do not affect autosave, approval, task, or decision flows.

Update 6 adds a review-only AI meeting overview on the meeting page. Committee
members can generate a structured preparation and summary package covering a
short meeting summary, agenda summary, minutes summary, decision points,
follow-up points, preparation points, and attention risks. The server-side
service validates access to the meeting, reads the existing meeting, agenda,
minutes, related decision, and related task data, and returns Structured
Outputs for display in a modal. The overview is advisory preparation support;
it is not saved automatically and never becomes official minutes, decisions,
or tasks.

Update 7 adds the first AI transparency foundation. `ai_activity_log` stores
bounded metadata for AI-assisted suggestions, including organization, meeting,
optional agenda item, user, field, action type, original text, AI suggestion,
model, prompt version, and whether the suggestion was generated, applied, or
dismissed. The AI minutes assistant now logs generated rewrite suggestions and
marks them applied or dismissed from the review modal. The AI meeting overview
logs generated overview output as advisory preparation support. The log is
RLS-protected by the same organization, meeting, and committee access rules as
the underlying content. Task suggestions, agenda-item assistant answers, and
mobile AI assistant answers are not yet logged in this first foundation pass.

Update 9 adds a compact Quick Action entry point to the organization
workspace header. It lets authorized users create a new meeting from any
organization page while preserving the existing committee-scoped meeting API,
standard agenda-item creation, service authorization, and RLS boundaries. The
action uses the current route context when it is unambiguous; on organization
level with several committees, the user must choose the committee explicitly.
Agenda-item creation is only enabled from a meeting context, while task and
decision creation remain available through their existing module and meeting
flows until the full relation context can be supplied safely.

Update 9.1 adds "Hurtigt møde" as a separate Quick Action for ad hoc meetings.
It uses the same committee context rules as ordinary meeting creation, but
creates the meeting without standard agenda items and writes the user's first
free notes to a draft general minutes record. The meeting is marked through the
existing description field rather than a new database field, and the user is
sent directly to the general minutes section. A "Strukturer med AI" placeholder
is visible only as future intent; no AI structuring, decisions, tasks, or agenda
items are created automatically.

Update 10 makes committees easier to reach from the organization dashboard.
The existing organization overview read model now exposes compact per-committee
counts for open tasks and active decisions alongside next meeting and open
follow-up counts. The dashboard presents these as a flat "Mine udvalg" section
with one-click links to each committee workspace, ordered by attention need and
upcoming meeting timing. This is a navigation and presentation improvement only;
committee pages, permissions, services, repositories, and RLS remain unchanged.

Mobile App v1 introduces an Expo/React Native companion app under
`apps/mobile`. It is not a full copy of the web app; it focuses on Home, My
Tasks, Meetings and minutes, My Committees, AI Assistant, Profile, and Quick
Action for quick meetings. The mobile app authenticates with Supabase on the
device and calls a small `/api/mobile/*` API surface with a bearer token. Those
routes create a Supabase client scoped to that token and then call existing
services and repositories, so organization membership, committee membership,
role checks, and Row Level Security remain server-side boundaries.

Mobile v1 can read RLS-scoped organization overviews, update task status,
create task comments, read meeting agendas and minutes, create quick meetings
without agenda items, and ask a source-oriented AI Assistant. Quick meetings
reuse `MeetingService.createQuick` and create a draft general minutes record
from the free-note field. AI responses are suggestions only and never mutate
records automatically. Push notifications are prepared in the Expo client, but
server-side token registration and notification dispatch are deferred. Offline
support is limited to friendly Danish error messages plus simple cached reads
for the latest organizations, overview, tasks, meetings, comments, and meeting
detail data.

Update 11 adds an explicit email foundation. Email delivery is server-side only
through `EmailService`, with Resend prepared as the first real provider and
`EMAIL_DELIVERY_MODE=stub` as the safe default for development and test. The
first fully exposed flow is sending a meeting agenda from the meeting page.
Committee managers can choose the whole committee or individual active
committee members, review the subject and a short message, and send manually.
Recipients are validated again on the server against organization and
committee membership before delivery. Internal notes, AI drafts, and private
minutes fields are not included.

The email template layer includes simple Danish templates for agendas,
approved minutes, task reminders, and decision overviews, but only agenda
email has UI and route support in this update. No automatic reminders or bulk
schedulers are active yet. Email event persistence is intentionally deferred
until a dedicated audit/logging migration is needed.

Email templates may receive the same organization branding used by the app and
PDF exports. Branding is presentation-only: logo and colors are validated,
missing branding falls back to the standard email look, and email generation or
delivery must not depend on a logo being reachable.

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

Organizations, committees, meetings, durable agenda items, and agenda-item
occurrences use soft delete metadata: `deleted_at`, `deleted_by`, and
`delete_expires_at`.
Moving a record to trash sets a 30-day retention deadline; restoring it clears
all three fields. Application repositories exclude trashed records from normal
reads, while dedicated restore paths may load them explicitly.

Organizations are root-level trash records. Moving an organization to trash
hides it from normal organization lists and blocks ordinary organization
flows, but it does not hard-delete or cascade-delete committees, meetings,
decisions, tasks, minutes, Annual Wheel records, Job Cards, or history.
Owners and administrators can restore the organization through the trash flow.

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

The organization trash page lives at `/organizations/[organizationId]/trash`.
It lists the deleted organization itself when relevant plus deleted
committees, meetings, and durable agenda items. It shows who deleted the item
when that profile is available and restores through the existing service and
PostgreSQL restore functions. Expired records are marked as ready for
permanent deletion, but permanent deletion remains deferred.

Authorized UI flows move committees, meetings, and durable agenda items to the
trash through those same service/RLS boundaries. On a meeting, removing an
agenda item from the agenda is a separate occurrence-level action: it hides
only that meeting occurrence and preserves the durable agenda item, decisions,
tasks, minutes, and history. Moving the durable agenda item itself to trash is
always shown as an explicit action.

## Terminology Contract

Use **Organization**, **Committee**, and **Committee Member** consistently in
database names, API routes, frontend routes, TypeScript types, services,
repositories, tests, and UI copy.

The legacy organizational term beginning with `B` must not be introduced in
domain naming. A Kanban-style task interface should be called **Task View** or
**Task Workflow**, not by terminology that conflicts with the Committee model.
