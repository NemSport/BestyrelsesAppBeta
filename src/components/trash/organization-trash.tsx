"use client";

import Link from "next/link";
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
  buttonClassName,
} from "@/components/ui";
import { formatDanishDateTime } from "@/lib/date-format";
import type {
  OrganizationTrashData,
  OrganizationTrashItem,
} from "@/types/domain";

const typeLabels: Record<OrganizationTrashItem["type"], string> = {
  organization: "Organisation",
  committee: "Udvalg",
  meeting: "Møde",
  agenda_item: "Dagsordenspunkt",
};

function statusLabel(item: OrganizationTrashItem) {
  if (item.status === "ready_for_permanent_delete") {
    return "Frist passeret";
  }
  return item.daysLeft === 1
    ? "1 dag til fristen"
    : `${item.daysLeft} dage til fristen`;
}

export function OrganizationTrash({
  overviewHref,
  data,
}: {
  overviewHref: string;
  data: OrganizationTrashData;
}) {
  const router = useRouter();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [items, setItems] = useState(data.items);
  const [success, setSuccess] = useState<string | null>(null);
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
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/organizations/${item.organizationId}/trash`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: item.type,
            id: item.id,
            committeeId: item.committeeId,
          }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error || "Elementet kunne ikke gendannes.");
        return;
      }
      setItems((current) =>
        current.filter(
          (candidate) =>
            candidate.id !== item.id || candidate.type !== item.type,
        ),
      );
      setSuccess(`${item.title} er gendannet.`);
      router.refresh();
    } catch {
      setError("Forbindelsen til serveren mislykkedes. Prøv igen.");
    } finally {
      setRestoringId(null);
    }
  }

  if (!items.length) {
    return (
      <>
        {success ? <p role="status">{success}</p> : null}
        <EmptyState
          action={
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={overviewHref}
            >
              Tilbage til overblik
            </Link>
          }
          title="Papirkurven er tom"
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {success ? <p role="status">{success}</p> : null}
      {error ? (
        <div
          className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Type</TableHeaderCell>
              <TableHeaderCell>Titel/navn</TableHeaderCell>
              <TableHeaderCell>Tilknytning</TableHeaderCell>
              <TableHeaderCell>Slettet</TableHeaderCell>
              <TableHeaderCell>Slettet af</TableHeaderCell>
              <TableHeaderCell>30-dagesfrist</TableHeaderCell>
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
                <TableCell>
                  <time dateTime={item.deletedAt}>
                    {formatDanishDateTime(item.deletedAt)}
                  </time>
                </TableCell>
                <TableCell>{item.deletedByName || "Ukendt bruger"}</TableCell>
                <TableCell>
                  <time dateTime={item.deleteExpiresAt}>
                    {formatDanishDateTime(item.deleteExpiresAt)}
                  </time>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    tone={
                      item.status === "ready_for_permanent_delete"
                        ? "warning"
                        : "neutral"
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
