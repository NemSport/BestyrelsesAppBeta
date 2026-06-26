import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert, TableUpdate } from "@/types/database";
import type {
  Meeting,
  MeetingWithAgenda,
  MeetingWithAgendaPreview,
} from "@/types/domain";

export class MeetingRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listByCommittee(committeeId: string) {
    const { data, error } = await this.db
      .from("meetings")
      .select(
        "*, agenda_item_occurrences(position, deleted_at, agenda_items(id, title, item_type, deleted_at))",
      )
      .eq("committee_id", committeeId)
      .is("deleted_at", null)
      .order("starts_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("position", {
        referencedTable: "agenda_item_occurrences",
        ascending: true,
      });
    if (error) throw error;
    return this.activePreviews(data as unknown as MeetingWithAgendaPreview[]);
  }

  async listByOrganization(organizationId: string) {
    const { data, error } = await this.db
      .from("meetings")
      .select(
        "*, agenda_item_occurrences(position, deleted_at, agenda_items(id, title, item_type, deleted_at))",
      )
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("starts_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("position", {
        referencedTable: "agenda_item_occurrences",
        ascending: true,
      });
    if (error) throw error;
    return this.activePreviews(data as unknown as MeetingWithAgendaPreview[]);
  }

  async findWithAgenda(meetingId: string) {
    const { data, error } = await this.db
      .from("meetings")
      .select("*, agenda_item_occurrences(*, agenda_items(*))")
      .eq("id", meetingId)
      .is("deleted_at", null)
      .order("position", {
        referencedTable: "agenda_item_occurrences",
        ascending: true,
      })
      .maybeSingle();
    if (error) throw error;
    return this.activeMeeting(data as unknown as MeetingWithAgenda | null);
  }

  async findIncludingDeleted(meetingId: string) {
    const { data, error } = await this.db
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findPreviousWithAgenda(
    organizationId: string,
    committeeId: string,
    startsBefore: string,
  ) {
    const { data, error } = await this.db
      .from("meetings")
      .select("*, agenda_item_occurrences(*, agenda_items(*))")
      .eq("organization_id", organizationId)
      .eq("committee_id", committeeId)
      .is("deleted_at", null)
      .lt("starts_at", startsBefore)
      .order("starts_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("position", {
        referencedTable: "agenda_item_occurrences",
        ascending: true,
      })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return this.activeMeeting(data as unknown as MeetingWithAgenda | null);
  }

  async listFutureByCommittee(
    organizationId: string,
    committeeId: string,
    startsAfter: string,
  ) {
    const { data, error } = await this.db
      .from("meetings")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("committee_id", committeeId)
      .is("deleted_at", null)
      .gt("starts_at", startsAfter)
      .order("starts_at", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data as Meeting[];
  }

  async listAttendees(meetingId: string) {
    const { data, error } = await this.db
      .from("meeting_attendees")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at");
    if (error) throw error;
    return data;
  }

  async create(input: TableInsert<"meetings">) {
    const { data, error } = await this.db
      .from("meetings")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async createWithStandardItems(input: {
    organizationId: string;
    committeeId: string;
    title: string;
    description: string;
    startsAt: string;
    endsAt: string | null;
    location: string | null;
  }) {
    const { data, error } = await this.db.rpc(
      "create_meeting_with_standard_items",
      {
        target_organization_id: input.organizationId,
        target_committee_id: input.committeeId,
        meeting_title: input.title,
        meeting_description: input.description,
        meeting_starts_at: input.startsAt,
        meeting_ends_at: input.endsAt,
        meeting_location: input.location,
      },
    );
    if (error) throw error;
    return data;
  }

  async update(meetingId: string, input: TableUpdate<"meetings">) {
    const { data, error } = await this.db
      .from("meetings")
      .update(input)
      .eq("id", meetingId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async softDelete(meetingId: string) {
    const { data, error } = await this.db.rpc("soft_delete_meeting", {
      target_meeting_id: meetingId,
    });
    if (error) throw error;
    return data;
  }

  async restore(meetingId: string) {
    const { data, error } = await this.db.rpc("restore_meeting", {
      target_meeting_id: meetingId,
    });
    if (error) throw error;
    return data;
  }

  private activePreviews(meetings: MeetingWithAgendaPreview[]) {
    return meetings.map((meeting) => ({
      ...meeting,
      agenda_item_occurrences: meeting.agenda_item_occurrences.filter(
        (occurrence) => {
          const value = occurrence as typeof occurrence & {
            deleted_at?: string | null;
            agenda_items:
              | (NonNullable<typeof occurrence.agenda_items> & {
                  deleted_at?: string | null;
                })
              | null;
          };
          return !value.deleted_at && !value.agenda_items?.deleted_at;
        },
      ),
    }));
  }

  private activeMeeting(meeting: MeetingWithAgenda | null) {
    if (!meeting) return null;
    return {
      ...meeting,
      agenda_item_occurrences: meeting.agenda_item_occurrences.filter(
        (occurrence) =>
          !occurrence.deleted_at && !occurrence.agenda_items?.deleted_at,
      ),
    };
  }
}
