import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type OrganizationRole = Database["public"]["Enums"]["organization_role"];
type CommitteeRole = Database["public"]["Enums"]["committee_role"];

export class ManualMemberRepository {
  constructor(private readonly admin: SupabaseClient<Database>) {}

  async createAuthUser(input: {
    fullName: string;
    email: string;
    temporaryPassword: string;
  }) {
    const { data, error } = await this.admin.auth.admin.createUser({
      email: input.email,
      password: input.temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });
    if (error) throw error;
    return data.user;
  }

  async upsertProfile(userId: string, fullName: string) {
    const { error } = await this.admin.from("profiles").upsert(
      {
        id: userId,
        full_name: fullName,
      },
      { onConflict: "id" },
    );
    if (error) throw error;
  }

  async addOrganizationMember(
    organizationId: string,
    userId: string,
    role: Exclude<OrganizationRole, "owner">,
  ) {
    const { error } = await this.admin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: userId,
      role,
      status: "active",
    });
    if (error) throw error;
  }

  async addCommitteeMembers(
    assignments: Array<{
      organizationId: string;
      committeeId: string;
      userId: string;
      role: CommitteeRole;
    }>,
  ) {
    if (assignments.length === 0) return;

    const { error } = await this.admin.from("committee_members").insert(
      assignments.map((assignment) => ({
        organization_id: assignment.organizationId,
        committee_id: assignment.committeeId,
        user_id: assignment.userId,
        role: assignment.role,
        status: "active" as const,
      })),
    );
    if (error) throw error;
  }

  async acceptPendingInvitation(organizationId: string, email: string) {
    const { error } = await this.admin
      .from("organization_invitations")
      .update({ status: "accepted" })
      .eq("organization_id", organizationId)
      .eq("email", email)
      .eq("status", "pending");
    if (error) throw error;
  }

  async deleteAuthUser(userId: string) {
    const { error } = await this.admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  }
}
