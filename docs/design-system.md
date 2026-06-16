# Design System and Branding Foundation

## Purpose

Phase 1.6 gives the application a calm, professional, and document-oriented
visual foundation for Danish associations and committees. The design system
supports existing workflows without owning domain logic or authorization.

The interface should help users concentrate on agendas, decisions, minutes,
and follow-up. It should not feel like a generic analytics dashboard or a
large office editor.

## Design Principles

1. **Agenda and minutes first.** Meeting content and decisions have stronger
   visual hierarchy than administration and metadata.
2. **Calm institutional tone.** Warm surfaces, near-black text, deep petroleum
   actions, and muted status colors replace isolated bright palette choices.
3. **Progressive disclosure.** Secondary controls, attachments, approval
   details, and less-used formatting actions stay available without dominating
   the page.
4. **Document before cards.** Use sections, dividers, metadata rows, and
   document surfaces. Use panels only when a bounded surface clarifies a
   workflow.
5. **Consistent interaction.** Buttons, fields, badges, tables, empty states,
   dropdowns, and modals come from `src/components/ui`.
6. **Accessible and responsive.** Controls keep visible focus states, readable
   contrast, useful labels, and layouts that work without horizontal overflow.
7. **Presentation stays separate.** Components present state and collect input;
   services, repositories, APIs, and RLS remain responsible for business rules.

## Tokens

Global tokens live in `src/app/globals.css`. Color values use space-separated
RGB channels so Tailwind opacity modifiers continue to work.

### Brand colors

| Token | Purpose |
|---|---|
| `--brand-primary` | Primary actions and strong navigation emphasis |
| `--brand-primary-hover` | Primary action hover state |
| `--brand-secondary` | Supporting emphasis |
| `--brand-accent` | Focus, highlights, and restrained active states |
| `--brand-accent-soft` | Quiet accent surfaces |
| `--brand-background` | Application background |
| `--brand-surface` | Panels, documents, dialogs, and fields |
| `--brand-surface-subtle` | Secondary surfaces and quiet toolbars |
| `--brand-text` | Primary text |
| `--brand-text-muted` | Metadata and secondary text |
| `--brand-text-subtle` | Placeholders and low-emphasis text |
| `--brand-border` | Standard separators and borders |
| `--brand-border-strong` | Interactive control borders |

Status tokens are provided for danger, success, warning, information, and
progress, each with a matching soft surface.

### Layout tokens

- `--space-page-x` and `--space-page-y` control responsive page padding.
- `--space-section` controls spacing between major page sections.
- `--space-card` controls internal bounded-surface spacing.
- `--radius-control`, `--radius-panel`, and `--radius-dialog` define shape.
- `--shadow-panel` and `--shadow-dialog` define restrained elevation.
- `--font-sans` is the application typeface.
- `--font-document` is reserved for document-oriented presentation where
  appropriate.

## Component Structure

Shared primitives are exported from `src/components/ui`.

| Component | Use |
|---|---|
| `AppShell` | Authenticated application frame and navigation |
| `PageHeader` | Page title, context, and primary actions |
| `PageSection` | Major content section with optional actions |
| `ContentPanel` | Bounded application workflow |
| `DocumentPanel` | Minutes and document-like content |
| `ActionBar` | Form or section actions separated from content |
| `Button` | Primary, secondary, danger, and ghost actions |
| `Input`, `Textarea`, `Select` | Standard form controls |
| `StatusBadge` | Compact semantic state |
| `EmptyState` | Helpful absence of content, optionally with one action |
| `Table` components | Member and administration data |
| `Modal` | Focused create/edit/read workflows without navigation |
| `Dropdown` | Compact secondary actions |

Domain components should compose these primitives instead of reproducing their
base borders, spacing, colors, and interaction states.

## Meeting and Minutes UI

- Meeting headers collect authoritative meeting metadata in one place.
- Agenda titles use document notation such as `(B) Godkendelse af dagsorden`.
- Standard points are visually administrative; transferred points are marked
  without overpowering ordinary agenda content.
- General minutes, approval, attachments, and PDF controls use progressive
  disclosure.
- Agenda-item minutes keep notes, decisions, and follow-up primary.
- Phase 1.6-B3 places the agenda and point minutes before general minutes and
  governance controls on the meeting page. Point accordions and general
  minutes start compact, while errors or local draft conflicts still open the
  relevant general-minutes section automatically.
- TipTap uses a compact toolbar. Common actions remain visible; less-used
  actions live under `Flere`.
- Rich text storage, sanitizing, autosave, and offline drafts are independent
  of toolbar presentation.

## Branding Extension

The current foundation is ready for future organization branding through
organization-scoped CSS variable overrides:

```css
[data-organization-theme="example"] {
  --brand-primary: 24 49 62;
  --brand-accent: 71 111 101;
}
```

Future branding may add validated organization colors, logos, and PDF theme
values. It must preserve contrast, focus visibility, status semantics, and
Committee terminology. Components should continue consuming semantic tokens
instead of organization-specific class names or hardcoded colors.

## Phase 1.6 Scope

Phase 1.6 includes:

- Existing application shell and navigation
- Semantic color, type, spacing, radius, and shadow tokens
- Shared layout and UI primitives
- Document-oriented meeting, agenda, and minutes presentation
- Compact previews, minutes sections, governance controls, and TipTap toolbar
- Modal editing for meetings and agenda items
- Responsive and consistency stabilization

Phase 1.6 does not include:

- A user-configurable white-label system
- Logo upload or organization theme administration
- Organization-specific hardcoded colors
- PDF branding
- New domain workflows, permissions, or database entities
- Replacement of authorization, autosave, sanitizing, or RLS behavior

## QA Contract

Changes to shared UI must verify:

1. Login and signup remain usable.
2. Organization, committee, member, meeting, and agenda routes still build.
3. Create and edit forms retain Danish validation feedback.
4. Meeting and agenda modals retain their API/service validation.
5. Meeting/date selection, standard points, previous minutes, and transfers
   retain their existing business logic.
6. Minutes autosave, offline drafts, approval, attachments, and PDF endpoints
   retain their existing security boundaries.
7. Desktop and mobile layouts avoid accidental horizontal overflow.
8. `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` pass.

Phase 1.6-B4 stabilizes these flows without adding visual or domain scope.
Modal edit forms remount when a refreshed record has a newer `updated_at`, so
uncontrolled form defaults cannot show stale values after a successful PATCH.
Minutes approval controls likewise synchronize their deadline from refreshed
minutes data. Active minutes drafts remain protected by the existing
timestamp comparison and local-draft conflict flow.

Missing Supabase sessions are treated as normal unauthenticated state rather
than repository failures. This preserves the login redirect and prevents
protected routes from rendering a server error when a session is absent or
has been cleared.
