import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type {
  OrganizationInvitation,
  OrganizationMemberDirectoryEntry,
} from "@/types/domain";

export class OrganizationMemberRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listMembers(organizationId: string) {
    const { data, error } = await this.db.rpc("list_organization_members", {
      target_organization_id: organizationId,
    });
    if (error) throw error;

    return data.map((member) => ({
      ...member,
      committees: Array.isArray(member.committees)
        ? (member.committees as OrganizationMemberDirectoryEntry["committees"])
        : [],
    })) satisfies OrganizationMemberDirectoryEntry[];
  }

  async listPendingInvitations(organizationId: string) {
    const { data, error } = await this.db
      .from("organization_invitations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as OrganizationInvitation[];
  }

  async invite(
    organizationId: string,
    email: string,
    role: Database["public"]["Enums"]["organization_role"],
  ) {
    const { data, error } = await this.db.rpc("invite_organization_member", {
      target_organization_id: organizationId,
      invitation_email: email,
      invitation_role: role,
    });
    if (error) throw error;
    return data;
  }

  async updateRole(
    organizationId: string,
    userId: string,
    role: Database["public"]["Enums"]["organization_role"],
  ) {
    const { data, error } = await this.db.rpc("update_organization_member_role", {
      target_organization_id: organizationId,
      target_user_id: userId,
      new_role: role,
    });
    if (error) throw error;
    return data;
  }

  async remove(organizationId: string, userId: string) {
    const { error } = await this.db.rpc("remove_organization_member", {
      target_organization_id: organizationId,
      target_user_id: userId,
    });
    if (error) throw error;
  }
}
