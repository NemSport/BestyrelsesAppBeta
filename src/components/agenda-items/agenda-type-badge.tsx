import { agendaItemTypeLabels } from "@/lib/localization";
import type { Database } from "@/types/database";
import clsx from "clsx";

export function AgendaTypeBadge({
  type,
  compact = false,
}: {
  type: Database["public"]["Enums"]["agenda_item_type"];
  compact?: boolean;
}) {
  const itemType = agendaItemTypeLabels[type];

  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center rounded-full border border-accent/15 bg-mist text-xs font-semibold text-secondary",
        compact ? "h-6 px-2" : "px-2.5 py-1",
      )}
      title={compact ? itemType.label : undefined}
    >
      {compact ? itemType.short : `${itemType.short} / ${itemType.label}`}
    </span>
  );
}
