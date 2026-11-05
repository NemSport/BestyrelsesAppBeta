# Meeting focus layout

The meeting page defaults to a focused presentation. The existing organization
navigation folds into a disclosure on desktop; the active agenda item uses the
remaining width. Point views separate minutes, decisions/tasks, personal notes,
and history/AI. All editors stay mounted, including while changing layout or
point views, so existing autosave, conflict handling and draft ownership remain
unchanged. No database, permission, export or API changes are included.

The “Vis klassisk layout” button restores the original columns immediately for
the current page. Refreshing defaults to the focused layout. The continuation
import action is available under “Flere” in both layouts.

## Rollback

This change is isolated on `codex/meeting-focus-layout`. Before merge, the live
main branch is unchanged. After merge, reverting the layout commit and
redeploying restores the old presentation without changing meeting records.
