import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableUpdate } from "@/types/database";
import type {
  AgendaItemMinutes,
  MeetingMinutes,
  Organization,
  OrganizationMember,
  TransferredAgendaItem,
} from "@/types/domain";

type OrganizationMembershipResult = Pick<OrganizationMember, "role"> & {
  organizations: Organization | null;
};

export class OrganizationRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listForCurrentUser(userId: string) {
    const { data, error } = await this.db
      .from("organization_members")
      .select("role, organizations(*)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const memberships = (data as unknown as OrganizationMembershipResult[]).filter(
      (membership) =>
        Boolean(membership.organizations) &&
        !membership.organizations?.deleted_at,
    );
    return [
      ...new Map(
        memberships.map((membership) => [
          membership.organizations!.id,
          membership,
        ]),
      ).values(),
    ];
  }

  async findById(
    organizationId: string,
    { includeDeleted = false }: { includeDeleted?: boolean } = {},
  ) {
    let query = this.db
      .from("organizations")
      .select("*")
      .eq("id", organizationId);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
  }

  async getMembership(
    organizationId: string,
    userId: string,
    activeOnly = true,
  ) {
    let query = this.db
      .from("organization_members")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("user_id", userId);
    if (activeOnly) query = query.eq("status", "active");
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
  }

  async create(name: string, slug: string) {
    const { data, error } = await this.db.rpc("create_organization_with_owner", {
      organization_name: name,
      organization_slug: slug,
    });
    if (error) throw error;
    return data;
  }

  async update(organizationId: string, input: TableUpdate<"organizations">) {
    const { data, error } = await this.db
      .from("organizations")
      .update(input)
      .eq("id", organizationId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async softDelete(organizationId: string) {
    const { data, error } = await this.db.rpc("soft_delete_organization", {
      target_organization_id: organizationId,
    });
    if (error) throw error;
    return data;
  }

  async restore(organizationId: string) {
    const { data, error } = await this.db.rpc("restore_organization", {
      target_organization_id: organizationId,
    });
    if (error) throw error;
    return data;
  }

  async listRecentMinutes(organizationId: string) {
    const { data, error } = await this.db
      .from("meeting_minutes")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(8);
    if (error) throw error;
    return data as MeetingMinutes[];
  }

  async listAgendaItemMinutes(organizationId: string) {
    const { data, error } = await this.db
      .from("agenda_item_minutes")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data as AgendaItemMinutes[];
  }

  async listActiveTransfers(organizationId: string) {
    const { data, error } = await this.db
      .from("transferred_agenda_items")
      .select("*")
      .eq("organization_id", organizationId)
      .neq("status", "dismissed")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data as TransferredAgendaItem[];
  }
}
