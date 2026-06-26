"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button, StatusBadge, buttonClassName } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/localization";
import type { PendingMinutesApprovalReminder } from "@/types/domain";

type PendingMinutesApprovalReminderProps = {
  organizationId: string;
  reminders: PendingMinutesApprovalReminder[];
};

export function PendingMinutesApprovalReminder({
  organizationId,
  reminders,
}: PendingMinutesApprovalReminderProps) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const visibleReminders = useMemo(
    () => reminders.filter((reminder) => !dismissedIds.includes(reminder.id)),
    [dismissedIds, reminders],
  );

  if (!visibleReminders.length) return null;

  const primaryReminder = visibleReminders[0];
  const remainingCount = visibleReminders.length - 1;
  const approvalHref = `/organizations/${organizationId}/committees/${primaryReminder.committeeId}/meetings/${primaryReminder.meetingId}#minutes-approval`;

  return (
    <section
      aria-label="Referater der afventer din godkendelse"
      className="border-l-4 border-warning bg-warning-soft px-4 py-3 shadow-sm sm:px-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">
              Du har et referat, der afventer din godkendelse
            </p>
            <StatusBadge tone="warning">
              {visibleReminders.length} afventer
            </StatusBadge>
          </div>
          <p className="mt-1 text-sm text-muted">
            Referatet fra {primaryReminder.meetingTitle} mangler din
            godkendelse.
          </p>
          <p className="mt-1 text-xs text-muted">
            {formatDateTime(primaryReminder.meetingStartsAt)} ·{" "}
            {primaryReminder.committeeName}
            {primaryReminder.approvalDeadline
              ? ` · Frist ${formatDate(primaryReminder.approvalDeadline)}`
              : ""}
          </p>
          {remainingCount > 0 ? (
            <details className="group mt-3">
              <summary className="cursor-pointer list-none text-xs font-semibold text-warning hover:underline [&::-webkit-details-marker]:hidden">
                + {remainingCount} flere referater afventer
              </summary>
              <div className="mt-2 divide-y divide-warning/15 border-y border-warning/15">
                {visibleReminders.slice(1).map((reminder) => (
                  <Link
                    className="block py-2 text-sm hover:text-brand"
                    href={`/organizations/${organizationId}/committees/${reminder.committeeId}/meetings/${reminder.meetingId}#minutes-approval`}
                    key={reminder.id}
                  >
                    <span className="font-semibold">
                      {reminder.meetingTitle}
                    </span>
                    <span className="block text-xs text-muted">
                      {formatDateTime(reminder.meetingStartsAt)} ·{" "}
                      {reminder.committeeName}
                    </span>
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Link className={buttonClassName({ size: "sm" })} href={approvalHref}>
            Gå til godkendelse
          </Link>
          <Button
            onClick={() =>
              setDismissedIds((current) => [...current, primaryReminder.id])
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            Luk midlertidigt
          </Button>
        </div>
      </div>
    </section>
  );
}
