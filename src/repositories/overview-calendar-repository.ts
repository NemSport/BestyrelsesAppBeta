import type { SupabaseClient } from "@supabase/supabase-js";

import { formatDanishDateKey, formatDanishTime } from "@/lib/date-format";
import { withMeetingReturnTo } from "@/lib/meeting-navigation";
import type { CalendarEntry, overviewMonth } from "@/lib/overview-calendar";
import type { Database } from "@/types/database";

export class OverviewCalendarRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async list(
    organizationId: string,
    userId: string,
    month: ReturnType<typeof overviewMonth>,
  ) {
    const membership = await this.db
      .from("committee_members")
      .select("committee_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "active");
    if (membership.error) throw membership.error;
    const ids = membership.data.map(({ committee_id }) => committee_id);
    if (!ids.length) return { committees: [], entries: [] };

    const committees = await this.db
      .from("committees")
      .select("id,name")
      .eq("organization_id", organizationId)
      .in("id", ids)
      .is("deleted_at", null)
      .is("archived_at", null)
      .order("name");
    if (committees.error) throw committees.error;
    const names = new Map(committees.data.map(({ id, name }) => [id, name]));
    const committeeIds = [...names.keys()];
    if (!committeeIds.length) return { committees: [], entries: [] };

    const [meetings, tasks, activities] = await Promise.all([
      this.db
        .from("meetings")
        .select("id,committee_id,title,starts_at")
        .eq("organization_id", organizationId)
        .in("committee_id", committeeIds)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .gte("starts_at", month.queryStart)
        .lt("starts_at", month.queryEnd)
        .order("starts_at"),
      this.db
        .from("tasks")
        .select("id,committee_id,title,deadline")
        .eq("organization_id", organizationId)
        .in("committee_id", committeeIds)
        .is("archived_at", null)
        .neq("status", "cancelled")
        .gte("deadline", month.first)
        .lte("deadline", month.last)
        .order("deadline"),
      this.db
        .from("annual_wheel_events")
        .select("id,committee_id,title,starts_on,ends_on")
        .eq("organization_id", organizationId)
        .in("committee_id", committeeIds)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .lte("starts_on", month.last)
        .gte("ends_on", month.first)
        .order("starts_on"),
    ]);
    if (meetings.error) throw meetings.error;
    if (tasks.error) throw tasks.error;
    if (activities.error) throw activities.error;

    const root = `/organizations/${organizationId}`;
    const entries: CalendarEntry[] = [];
    for (const meeting of meetings.data) {
      const date = formatDanishDateKey(meeting.starts_at);
      if (date < month.first || date > month.last) continue;
      entries.push({
        id: meeting.id,
        title: meeting.title,
        committeeId: meeting.committee_id,
        committee: names.get(meeting.committee_id)!,
        kind: "meeting",
        start: date,
        end: date,
        time: formatDanishTime(meeting.starts_at),
        href: withMeetingReturnTo(
          `${root}/committees/${meeting.committee_id}/meetings/${meeting.id}`,
          root,
        ),
      });
    }
    for (const task of tasks.data) {
      if (!task.deadline) continue;
      entries.push({
        id: task.id,
        title: task.title,
        committeeId: task.committee_id,
        committee: names.get(task.committee_id)!,
        kind: "task",
        start: task.deadline,
        end: task.deadline,
        href: `${root}/tasks?scope=all&task=${task.id}&committee=${task.committee_id}`,
      });
    }
    for (const activity of activities.data) {
      if (!activity.committee_id) continue;
      entries.push({
        id: activity.id,
        title: activity.title,
        committeeId: activity.committee_id,
        committee: names.get(activity.committee_id)!,
        kind: "activity",
        start: activity.starts_on,
        end: activity.ends_on,
        href: `${root}/committees/${activity.committee_id}/annual-wheel?event=${activity.id}`,
      });
    }
    return { committees: committees.data, entries };
  }
}
