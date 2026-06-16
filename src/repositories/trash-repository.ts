import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableRow } from "@/types/database";

type ProfileName = Pick<TableRow<"profiles">, "id" | "full_name">;

export type TrashedCommitteeRow = TableRow<"committees">;
export type TrashedOrganizationRow = TableRow<"organizations">;

export type TrashedMeetingRow = TableRow<"meetings"> & {
  committee:
    | (Pick<TableRow<"committees">, "id" | "name" | "deleted_at">)
    | null;
};

export type TrashedAgendaItemRow = TableRow<"agenda_items"> & {
  committee:
    | (Pick<TableRow<"committees">, "id" | "name" | "deleted_at">)
    | null;
  agenda_item_occurrences: Array<{
    id: string;
    deleted_at: string | null;
    meetings:
      | Pick<TableRow<"meetings">, "id" | "title" | "starts_at" | "deleted_at">
      | null;
  }>;
};

export class TrashRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findDeletedOrganization(organizationId: string) {
    const { data, error } = await this.db
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .not("deleted_at", "is", null)
      .maybeSingle();
    if (error) throw error;
    return data as TrashedOrganizationRow | null;
  }

  async listDeletedCommittees(organizationId: string) {
    const { data, error } = await this.db
      .from("committees")
      .select("*")
      .eq("organization_id", organizationId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return data as TrashedCommitteeRow[];
  }

  async listDeletedMeetings(organizationId: string) {
    const { data, error } = await this.db
      .from("meetings")
      .select("*, committee:committees(id, name, deleted_at)")
      .eq("organization_id", organizationId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return data as unknown as TrashedMeetingRow[];
  }

  async listDeletedAgendaItems(organizationId: string) {
    const { data, error } = await this.db
      .from("agenda_items")
      .select(
        "*, committee:committees(id, name, deleted_at), agenda_item_occurrences(id, deleted_at, meetings(id, title, starts_at, deleted_at))",
      )
      .eq("organization_id", organizationId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return data as unknown as TrashedAgendaItemRow[];
  }

  async listDeletedByProfiles(userIds: string[]) {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (!uniqueIds.length) return new Map<string, ProfileName>();
    const { data, error } = await this.db
      .from("profiles")
      .select("id, full_name")
      .in("id", uniqueIds);
    if (error) throw error;
    return new Map((data as ProfileName[]).map((profile) => [profile.id, profile]));
  }
}
