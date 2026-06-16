import type { HTMLAttributes } from "react";
import clsx from "clsx";

import { agendaItemTypeLabels } from "@/lib/localization";
import type { Database } from "@/types/database";

export function AgendaItemDocumentTitle({
  type,
  title,
  className,
  markerClassName,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  type: Database["public"]["Enums"]["agenda_item_type"];
  title: string;
  markerClassName?: string;
}) {
  const itemType = agendaItemTypeLabels[type];

  return (
    <span className={clsx("inline", className)} {...props}>
      <span
        className={clsx(
          "mr-1.5 whitespace-nowrap font-medium text-secondary",
          markerClassName,
        )}
        title={itemType.label}
      >
        ({itemType.short})
      </span>
      <span>{title}</span>
    </span>
  );
}
