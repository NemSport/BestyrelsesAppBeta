# Meeting focus layout

The meeting page defaults to a focused presentation. Organization navigation is always visible in two horizontal rows across all
organization pages. It stays below the measured app-header height on desktop;
below 768px it wraps in normal document flow to leave space for content. The
active agenda item uses the remaining width. Point views separate minutes, decisions/tasks, personal notes,
and history/AI. All editors stay mounted, including while changing layout or
point views, so existing autosave, conflict handling and draft ownership remain
unchanged. No database, permission, export or API changes are included.

The “Vis klassisk layout” button restores the original meeting columns (the shared top navigation remains) immediately for
the current page. Refreshing defaults to the focused layout. The continuation
import action is available under “Flere” in both layouts.

## Rollback

This change is isolated on `codex/meeting-focus-layout`. Before merge, the live
main branch is unchanged. After merge, reverting the layout commit and
redeploying restores the old presentation without changing meeting records.
