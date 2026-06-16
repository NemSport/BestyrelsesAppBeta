import type { SupabaseClient } from "@supabase/supabase-js";

import { AuthorizationError, NotFoundError } from "@/lib/errors";
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

  async requireOrganizationMember(organizationId: string, userId: string) {
    const organization = await this.organizations.findById(organizationId);
    if (!organization) throw new NotFoundError("Organisationen");
    const membership = await this.organizations.getMembership(organizationId, userId);
    if (!membership) throw new AuthorizationError();
    return { organization, membership };
  }

  async requireOrganizationAdmin(organizationId: string, userId: string) {
    const context = await this.requireOrganizationMember(organizationId, userId);
    if (!["owner", "admin"].includes(context.membership.role)) {
      throw new AuthorizationError("Kun ejere og administratorer kan gøre dette.");
    }
    return context;
  }

  async requireOrganizationOwner(organizationId: string, userId: string) {
    const context = await this.requireOrganizationMember(organizationId, userId);
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
    const organizationContext = await this.requireOrganizationMember(organizationId, userId);
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

  async requireCommitteeManager(
    organizationId: string,
    committeeId: string,
    userId: string,
  ) {
    const organizationContext = await this.requireOrganizationMember(organizationId, userId);
    const committee = await this.committees.findById(committeeId);
    if (!committee || committee.organization_id !== organizationId) {
      throw new NotFoundError("Udvalget");
    }
    const membership = await this.committees.getMembership(committeeId, userId);
    const organizationAdmin = ["owner", "admin"].includes(
      organizationContext.membership.role,
    );
    if (!organizationAdmin && !membership) throw new AuthorizationError();
    if (!organizationAdmin && !["chair", "secretary"].includes(membership!.role)) {
      throw new AuthorizationError("Kun formanden eller sekretæren kan gøre dette.");
    }
    return { committee, membership, organizationMembership: organizationContext.membership };
  }

  async requireAgendaItemEditor(
    organizationId: string,
    committeeId: string,
    userId: string,
  ) {
    const organizationContext = await this.requireOrganizationMember(organizationId, userId);
    const committee = await this.committees.findById(committeeId);
    if (!committee || committee.organization_id !== organizationId) {
      throw new NotFoundError("Udvalget");
    }
    const membership = await this.committees.getMembership(committeeId, userId);
    const organizationAdmin = ["owner", "admin"].includes(
      organizationContext.membership.role,
    );
    if (
      !organizationAdmin &&
      (!membership || !["chair", "secretary", "member"].includes(membership.role))
    ) {
      throw new AuthorizationError(
        "Du har kun læseadgang til dagsordenspunkter i dette udvalg.",
      );
    }
    return { committee, membership, organizationMembership: organizationContext.membership };
  }
}
