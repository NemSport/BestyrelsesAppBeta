import type { MeetingCapabilities } from "@/lib/meeting-capabilities";
import type { Database } from "@/types/database";
import type { MeetingWithAgendaPreview } from "@/types/domain";

export type MeetingListPeriod = "upcoming" | "previous" | "cancelled";
export type MeetingListStatus = MeetingWithAgendaPreview["status"];

export type MeetingListFilters = {
  committeeId: string;
  date: string;
  period: MeetingListPeriod | "";
  status: MeetingListStatus | "";
};
type MinutesStatus = Database["public"]["Enums"]["meeting_minutes_status"];

const meetingStatuses = new Set<MeetingListStatus>([
  "draft",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);
const meetingListDateKeyFormatter = new Intl.DateTimeFormat("sv-SE", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Copenhagen",
  year: "numeric",
});

function meetingListDateKey(value: string) {
  return meetingListDateKeyFormatter.format(new Date(value));
}

export function parseMeetingListFilters(input: {
  committee?: string;
  date?: string;
  period?: string;
  status?: string;
}): MeetingListFilters {
  const committeeId = input.committee?.trim() ?? "";
  const date =
    input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : "";
  const period = ["upcoming", "previous", "cancelled"].includes(
    input.period ?? "",
  )
    ? (input.period as MeetingListPeriod)
    : "";
  const status =
    input.status && meetingStatuses.has(input.status as MeetingListStatus)
      ? (input.status as MeetingListStatus)
      : "";

  return { committeeId, date, period, status };
}

export function getMeetingListPeriod(
  meeting: Pick<MeetingWithAgendaPreview, "starts_at" | "status">,
  now: number,
): MeetingListPeriod {
  if (meeting.status === "cancelled") return "cancelled";
  if (meeting.status === "in_progress") return "upcoming";
  if (
    meeting.status === "completed" ||
    new Date(meeting.starts_at).getTime() < now
  ) {
    return "previous";
  }
  return "upcoming";
}

export function sortMeetingList<
  T extends Pick<
    MeetingWithAgendaPreview,
    "created_at" | "starts_at" | "status"
  >,
>(meetings: T[], period: MeetingListPeriod) {
  const direction = period === "upcoming" ? 1 : -1;
  return [...meetings].sort((left, right) => {
    const byStart =
      (new Date(left.starts_at).getTime() -
        new Date(right.starts_at).getTime()) *
      direction;
    if (byStart !== 0) return byStart;
    return (
      (new Date(left.created_at).getTime() -
        new Date(right.created_at).getTime()) *
      direction
    );
  });
}

export function filterMeetingList<
  T extends Pick<
    MeetingWithAgendaPreview,
    "committee_id" | "starts_at" | "status"
  >,
>(meetings: T[], filters: MeetingListFilters, now: number) {
  return meetings.filter(
    (meeting) =>
      (!filters.committeeId || meeting.committee_id === filters.committeeId) &&
      (!filters.date ||
        meetingListDateKey(meeting.starts_at) === filters.date) &&
      (!filters.period ||
        getMeetingListPeriod(meeting, now) === filters.period) &&
      (!filters.status || meeting.status === filters.status),
  );
}

export function groupMeetingList<
  T extends Pick<
    MeetingWithAgendaPreview,
    "created_at" | "starts_at" | "status"
  >,
>(meetings: T[], now: number) {
  const upcoming = meetings.filter(
    (meeting) => getMeetingListPeriod(meeting, now) === "upcoming",
  );
  const previous = meetings.filter(
    (meeting) => getMeetingListPeriod(meeting, now) === "previous",
  );
  const cancelled = meetings.filter(
    (meeting) => getMeetingListPeriod(meeting, now) === "cancelled",
  );

  return {
    upcoming: sortMeetingList(upcoming, "upcoming"),
    previous: sortMeetingList(previous, "previous"),
    cancelled: sortMeetingList(cancelled, "cancelled"),
  };
}

export function getMeetingListAction(
  status: MeetingListStatus,
  capabilities: Pick<
    MeetingCapabilities,
    "editOfficialMinutes" | "updateMeeting"
  >,
  minutesStatus: MinutesStatus | null = null,
) {
  if (status === "draft" || status === "scheduled") {
    return { destination: "meeting", label: "Åbn dagsorden" } as const;
  }
  if (capabilities.editOfficialMinutes && status === "in_progress") {
    return { destination: "minutes", label: "Fortsæt møde" } as const;
  }
  if (status === "completed") {
    if (capabilities.editOfficialMinutes && minutesStatus === "draft") {
      return { destination: "minutes", label: "Færdiggør referat" } as const;
    }
    return { destination: "minutes", label: "Se referat" } as const;
  }
  return { destination: "meeting", label: "Åbn møde" } as const;
}
