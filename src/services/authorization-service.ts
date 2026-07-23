import type { SupabaseClient } from "@supabase/supabase-js";

import { AuthorizationError, NotFoundError } from "@/lib/errors";
import {
  assertMeetingCapability,
  getMeetingCapabilities,
  type MeetingCapability,
} from "@/lib/permissions";
import { CommitteeRepository } from "@/repositories/committee-repository";
import { OrganizationRepository } from "@/repositories/organization-repository";
import type { Database } from "@/types/database";

export class AuthorizationService {
  private readonly organizations: OrganizationRepository;
  private readonly committees: CommitteeRepository;

  constructor(db: SupabaseClient<Database>) {
    this.organizations = new OrganizationRepository(db);
    this.committees = new CommitteeRepository(db);
  }

  async requireOrganizationMember(
    organizationId: string,
    userId: string,
    { includeDeleted = false }: { includeDeleted?: boolean } = {},
  ) {
    const organization = await this.organizations.findById(organizationId, {
      includeDeleted,
    });
    if (!organization) throw new NotFoundError("Organisationen");
    const membership = await this.organizations.getMembership(
      organizationId,
      userId,
    );
    if (!membership) throw new AuthorizationError();
    return { organization, membership };
  }

  async requireOrganizationAdmin(
    organizationId: string,
    userId: string,
    { includeDeleted = false }: { includeDeleted?: boolean } = {},
  ) {
    const context = await this.requireOrganizationMember(
      organizationId,
      userId,
      {
        includeDeleted,
      },
    );
    if (!["owner", "admin"].includes(context.membership.role)) {
      throw new AuthorizationError(
        "Kun ejere og administratorer kan gøre dette.",
      );
    }
    return context;
  }

  async requireOrganizationOwner(organizationId: string, userId: string) {
    const context = await this.requireOrganizationMember(
      organizationId,
      userId,
    );
    if (context.membership.role !== "owner") {
      throw new AuthorizationError("Kun organisationens ejer kan gøre dette.");
    }
    return context;
  }

  async requireCommitteeMember(
    organizationId: string,
    committeeId: string,
    userId: string,
  ) {
    const organizationContext = await this.requireOrganizationMember(
      organizationId,
      userId,
    );
    const committee = await this.committees.findById(committeeId);
    if (!committee || committee.organization_id !== organizationId) {
      throw new NotFoundError("Udvalget");
    }
    const membership = await this.committees.getMembership(committeeId, userId);
    const organizationAdmin = ["owner", "admin"].includes(
      organizationContext.membership.role,
    );
    if (!membership && !organizationAdmin) throw new AuthorizationError();
    return {
      committee,
      membership,
      organizationMembership: organizationContext.membership,
    };
  }

  async requireMeetingCapability(
    organizationId: string,
    committeeId: string,
    userId: string,
    capability: MeetingCapability,
  ) {
    const context = await this.requireCommitteeMember(
      organizationId,
      committeeId,
      userId,
    );
    assertMeetingCapability(
      getMeetingCapabilities(
        context.organizationMembership.role,
        context.membership?.role ?? null,
      ),
      capability,
    );
    return context;
  }

  async requireCommitteeManager(
    organizationId: string,
    committeeId: string,
    userId: string,
  ) {
    return this.requireMeetingCapability(
      organizationId,
      committeeId,
      userId,
      "editMeeting",
    );
  }

  async requireAgendaItemEditor(
    organizationId: string,
    committeeId: string,
    userId: string,
  ) {
    return this.requireMeetingCapability(
      organizationId,
      committeeId,
      userId,
      "editAgendaItems",
    );
  }
}
