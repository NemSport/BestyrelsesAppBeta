import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError, AuthorizationError, NotFoundError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  manualOrganizationMemberInputSchema,
  organizationInvitationInputSchema,
  organizationMemberRemoveSchema,
  organizationMemberRoleUpdateSchema,
} from "@/lib/validation";
import { CommitteeRepository } from "@/repositories/committee-repository";
import { ManualMemberRepository } from "@/repositories/manual-member-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { OrganizationRepository } from "@/repositories/organization-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

const controlledDatabaseMessages = [
  "Kun ejere og administratorer",
  "Kun en ejer",
  "Du kan ikke ændre din egen rolle",
  "Den sidste ejer",
  "Medlemmet blev ikke fundet",
  "Brugeren er allerede medlem",
  "Der findes allerede en afventende invitation",
  "Indtast en gyldig e-mailadresse",
];

function membershipError(error: unknown): never {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : "";
  const controlledMessage = controlledDatabaseMessages.find((candidate) =>
    message.includes(candidate),
  );
  if (controlledMessage) {
    throw new AppError(message, 409, "MEMBERSHIP_CHANGE_REJECTED");
  }
  throw new AppError(
    "Medlemsændringen kunne ikke gemmes. Prøv igen.",
    500,
    "MEMBERSHIP_CHANGE_FAILED",
  );
}

export class OrganizationMemberService {
  private readonly members: OrganizationMemberRepository;
  private readonly organizations: OrganizationRepository;
  private readonly committees: CommitteeRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.members = new OrganizationMemberRepository(db);
    this.organizations = new OrganizationRepository(db);
    this.committees = new CommitteeRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async list(organizationId: string) {
    const user = await this.auth.requireUser();
    const context = await this.authorization.requireOrganizationMember(
      organizationId,
      user.id,
    );
    const [members, invitations, committees] = await Promise.all([
      this.members.listMembers(organizationId),
      this.members.listPendingInvitations(organizationId),
      this.committees.listByOrganization(organizationId),
    ]);
    return {
      members,
      invitations,
      currentUserId: user.id,
      currentUserRole: context.membership.role,
      committees,
    };
  }

  async createManual(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = manualOrganizationMemberInputSchema.parse(input);
    await this.authorization.requireOrganizationOwner(
      parsed.organizationId,
      user.id,
    );

    const existingMembers = await this.members.listMembers(parsed.organizationId);
    if (
      existingMembers.some(
        (member) => member.email.toLowerCase() === parsed.email,
      )
    ) {
      throw new AppError(
        "Der findes allerede et medlem med denne e-mail i organisationen.",
        409,
        "MEMBER_ALREADY_EXISTS",
      );
    }

    const organizationCommittees = await this.committees.listByOrganization(
      parsed.organizationId,
    );
    const availableCommitteeIds = new Set(
      organizationCommittees.map((committee) => committee.id),
    );
    if (
      parsed.committeeAssignments.some(
        (assignment) => !availableCommitteeIds.has(assignment.committeeId),
      )
    ) {
      throw new NotFoundError("Et eller flere udvalg");
    }

    let manualMembers: ManualMemberRepository;
    try {
      manualMembers = new ManualMemberRepository(createAdminClient());
    } catch (error) {
      console.error(error);
      throw new AppError(
        "Serveren mangler konfiguration til manuel medlemsoprettelse.",
        500,
        "ADMIN_CLIENT_CONFIGURATION_MISSING",
      );
    }

    let createdUserId: string | null = null;
    try {
      const createdUser = await manualMembers.createAuthUser({
        fullName: parsed.fullName,
        email: parsed.email,
        temporaryPassword: parsed.temporaryPassword,
      });
      createdUserId = createdUser.id;

      await manualMembers.upsertProfile(createdUser.id, parsed.fullName);
      await manualMembers.addOrganizationMember(
        parsed.organizationId,
        createdUser.id,
        parsed.role,
      );
      await manualMembers.addCommitteeMembers(
        parsed.committeeAssignments.map((assignment) => ({
          organizationId: parsed.organizationId,
          committeeId: assignment.committeeId,
          userId: createdUser.id,
          role: assignment.role,
        })),
      );
      await manualMembers.acceptPendingInvitation(
        parsed.organizationId,
        parsed.email,
      );

      return {
        id: createdUser.id,
        email: parsed.email,
        fullName: parsed.fullName,
      };
    } catch (error) {
      if (createdUserId) {
        try {
          await manualMembers.deleteAuthUser(createdUserId);
        } catch (cleanupError) {
          console.error("Kunne ikke rydde Auth-bruger efter fejl.", cleanupError);
        }
      }

      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" &&
              error !== null &&
              "message" in error &&
              typeof error.message === "string"
            ? error.message
            : "";
      if (
        message.toLowerCase().includes("already") ||
        message.toLowerCase().includes("registered") ||
        message.toLowerCase().includes("duplicate")
      ) {
        throw new AppError(
          "Der findes allerede en bruger med denne e-mail.",
          409,
          "AUTH_USER_ALREADY_EXISTS",
        );
      }
      console.error(error);
      throw new AppError(
        "Medlemmet kunne ikke oprettes. Prøv igen.",
        500,
        "MANUAL_MEMBER_CREATION_FAILED",
      );
    }
  }

  async invite(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = organizationInvitationInputSchema.parse(input);
    const context = await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    if (parsed.role === "owner" && context.membership.role !== "owner") {
      throw new AuthorizationError("Kun en ejer kan invitere en ny ejer.");
    }
    try {
      return await this.members.invite(
        parsed.organizationId,
        parsed.email,
        parsed.role,
      );
    } catch (error) {
      membershipError(error);
    }
  }

  async updateRole(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = organizationMemberRoleUpdateSchema.parse(input);
    const context = await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    const target = await this.organizations.getMembership(
      parsed.organizationId,
      parsed.userId,
      false,
    );
    if (!target) throw new NotFoundError("Medlemmet");

    const actorIsOwner = context.membership.role === "owner";
    if (parsed.userId === user.id && !actorIsOwner) {
      throw new AuthorizationError("Du kan ikke ændre din egen rolle.");
    }
    if ((target.role === "owner" || parsed.role === "owner") && !actorIsOwner) {
      throw new AuthorizationError("Kun en ejer kan tildele eller fjerne ejerrollen.");
    }

    try {
      return await this.members.updateRole(
        parsed.organizationId,
        parsed.userId,
        parsed.role,
      );
    } catch (error) {
      membershipError(error);
    }
  }

  async remove(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = organizationMemberRemoveSchema.parse(input);
    const context = await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    const target = await this.organizations.getMembership(
      parsed.organizationId,
      parsed.userId,
      false,
    );
    if (!target) throw new NotFoundError("Medlemmet");
    if (target.role === "owner" && context.membership.role !== "owner") {
      throw new AuthorizationError("Kun en ejer kan fjerne en anden ejer.");
    }

    try {
      await this.members.remove(parsed.organizationId, parsed.userId);
      return { removed: true };
    } catch (error) {
      membershipError(error);
    }
  }
}
