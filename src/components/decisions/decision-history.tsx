import { RelatedDecisions } from "@/components/decisions/related-decisions";
import type { AgendaItemDecisionHistory } from "@/types/domain";

export function DecisionHistory({
  history,
  organizationId,
  compact = false,
}: {
  history: AgendaItemDecisionHistory;
  organizationId: string;
  compact?: boolean;
}) {
  if (!history.categories.length) {
    return (
      <p className="text-xs text-muted">
        Tilføj en kategori på en beslutning fra punktet for at samle tidligere
        beslutninger om samme emne.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        Emne: {history.categories.join(", ")}
      </p>
      {history.decisions.length ? (
        <RelatedDecisions
          compact={compact}
          decisions={history.decisions}
          history
          organizationId={organizationId}
        />
      ) : (
        <p className="text-xs text-muted">
          Der findes ingen tidligere beslutninger i samme udvalg med denne
          kategori.
        </p>
      )}
    </div>
  );
}
