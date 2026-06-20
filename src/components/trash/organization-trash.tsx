"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import type { OrganizationTrashData, OrganizationTrashItem } from "@/types/domain";

const typeLabels: Record<OrganizationTrashItem["type"], string> = {
  organization: "Organisation",
  committee: "Udvalg",
  meeting: "Møde",
  agenda_item: "Dagsordenspunkt",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(item: OrganizationTrashItem) {
  if (item.status === "ready_for_permanent_delete") {
    return "Klar til permanent sletning";
  }
  return item.daysLeft === 1
    ? "Gendannelig · 1 dag tilbage"
    : `Gendannelig · ${item.daysLeft} dage tilbage`;
}

export function OrganizationTrash({
  organizationId,
  data,
}: {
  organizationId: string;
  data: OrganizationTrashData;
}) {
  const router = useRouter();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [items, setItems] = useState(data.items);
  const [error, setError] = useState<string | null>(null);

  async function restore(item: OrganizationTrashItem) {
    if (
      !window.confirm(
        "Vil du gendanne dette element? Det bliver igen synligt i appen.",
      )
    ) {
      return;
    }
    setRestoringId(item.id);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/trash`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          type: item.type,
          id: item.id,
          committeeId: item.committeeId,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error || "Elementet kunne ikke gendannes.");
        return;
      }
      setItems((current) =>
        current.filter(
          (candidate) => candidate.id !== item.id || candidate.type !== item.type,
        ),
      );
      router.refresh();
    } catch {
      setError("Forbindelsen til serveren mislykkedes. Prøv igen.");
    } finally {
      setRestoringId(null);
    }
  }

  if (!items.length) {
    return (
      <EmptyState
        description="Når organisationer, udvalg, møder eller dagsordenspunkter flyttes til papirkurven, vises de her i 30 dage."
        title="Papirkurven er tom"
      />
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}
      <div className="border-l-2 border-warning bg-warning-soft/45 px-4 py-3">
        <p className="text-sm font-semibold">Gendannelige elementer</p>
        <p className="mt-1 text-sm text-muted">
          Papirkurven viser slettede elementer i 30 dage. Permanent sletning er
          ikke implementeret endnu; udløbne elementer markeres kun som klar til
          permanent sletning.
        </p>
      </div>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Type</TableHeaderCell>
              <TableHeaderCell>Titel/navn</TableHeaderCell>
              <TableHeaderCell>Tilknytning</TableHeaderCell>
              <TableHeaderCell>Slettet</TableHeaderCell>
              <TableHeaderCell>Slettet af</TableHeaderCell>
              <TableHeaderCell>Udløber</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell className="text-right">Handling</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={`${item.type}-${item.id}`}>
                <TableCell>
                  <StatusBadge>{typeLabels[item.type]}</StatusBadge>
                </TableCell>
                <TableCell>
                  <p className="font-semibold">{item.title}</p>
                </TableCell>
                <TableCell className="text-sm text-muted">
                  {item.type === "organization" ? (
                    "Hele organisationen"
                  ) : item.type === "committee" ? (
                    "Hele udvalget"
                  ) : (
                    <span>
                      {item.committeeName || "Ukendt udvalg"}
                      {item.meetingTitle ? ` · ${item.meetingTitle}` : ""}
                    </span>
                  )}
                </TableCell>
                <TableCell>{formatDateTime(item.deletedAt)}</TableCell>
                <TableCell>{item.deletedByName || "Ukendt bruger"}</TableCell>
                <TableCell>
                  <span>{formatDateTime(item.deleteExpiresAt)}</span>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    tone={
                      item.status === "ready_for_permanent_delete"
                        ? "warning"
                        : "success"
                    }
                  >
                    {statusLabel(item)}
                  </StatusBadge>
                  {item.restoreBlockedReason ? (
                    <p className="mt-1 text-xs text-muted">
                      {item.restoreBlockedReason}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    disabled={!item.canRestore || restoringId === item.id}
                    onClick={() => void restore(item)}
                    size="sm"
                    variant="secondary"
                  >
                    {restoringId === item.id ? "Gendanner..." : "Gendan"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
