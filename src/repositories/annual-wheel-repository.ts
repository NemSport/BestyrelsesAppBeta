import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert, TableUpdate } from "@/types/database";
import type { AnnualWheelEventView } from "@/types/domain";

export class AnnualWheelRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  private readonly viewSelect =
    "*, committee:committees(id, name), meeting:meetings(id, title, starts_at), task:tasks(id, title, status), responsible:profiles!annual_wheel_events_responsible_user_id_fkey(id, full_name)";

  async listByOrganization(organizationId: string, year: number) {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const { data, error } = await this.db
      .from("annual_wheel_events")
      .select(this.viewSelect)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .lte("starts_on", to)
      .gte("ends_on", from)
      .order("starts_on");
    if (error) throw error;
    return data as unknown as AnnualWheelEventView[];
  }

  async findById(eventId: string) {
    const { data, error } = await this.db
      .from("annual_wheel_events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async createMany(input: TableInsert<"annual_wheel_events">[]) {
    const { data, error } = await this.db
      .from("annual_wheel_events")
      .insert(input)
      .select();
    if (error) throw error;
    return data;
  }

  async update(
    eventId: string,
    input: TableUpdate<"annual_wheel_events">,
  ) {
    const { data, error } = await this.db
      .from("annual_wheel_events")
      .update(input)
      .eq("id", eventId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}
