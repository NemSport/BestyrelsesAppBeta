import type {
  AgendaItemMinutes,
  MeetingMinuteApproval,
  PreviousMeetingMinutesReference,
} from "@/types/domain";

export function isManualMinutesApproval(
  approval: Pick<MeetingMinuteApproval, "status" | "user_id" | "updated_by">,
) {
  return (
    approval.status === "approved" && approval.updated_by !== approval.user_id
  );
}

export function isMinutesFullyApproved(
  reference: Pick<PreviousMeetingMinutesReference, "minutes" | "approvals">,
) {
  return (
    reference.minutes?.status === "approved" &&
    reference.approvals.every(({ status }) => status === "approved")
  );
}

export function previousMinutesAgendaStatus(
  reference: PreviousMeetingMinutesReference,
  status: AgendaItemMinutes["status"],
): AgendaItemMinutes["status"] {
  if (!reference.meeting) return status;
  if (isMinutesFullyApproved(reference)) return "decision_approved";
  return "not_started";
}

export function canRecordManualMinutesApproval(
  minutesStatus: NonNullable<
    PreviousMeetingMinutesReference["minutes"]
  >["status"],
  approvalStatus: MeetingMinuteApproval["status"],
) {
  return (
    (minutesStatus === "ready_for_approval" && approvalStatus === "pending") ||
    ((minutesStatus === "ready_for_approval" || minutesStatus === "approved") &&
      approvalStatus === "no_response")
  );
}
