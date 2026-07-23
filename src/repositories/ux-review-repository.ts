import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

const USERS_PER_PAGE = 1_000;
const MAX_USER_PAGES = 100;
type OrganizationRole = Database["public"]["Enums"]["organization_role"];
type CommitteeRole = Database["public"]["Enums"]["committee_role"];
type MembershipStatus = Database["public"]["Enums"]["membership_status"];

const UX_REVIEW_ORGANIZATION_NAME = "UX Testorganisation";
const UX_REVIEW_COMMITTEE_NAME = "Test udvalg";
const OBSERVER_ORGANIZATION_ROLE = "viewer" satisfies OrganizationRole;
const OBSERVER_COMMITTEE_ROLE = "viewer" satisfies CommitteeRole;
const EDITOR_ORGANIZATION_ROLE = "member" satisfies OrganizationRole;
const EDITOR_COMMITTEE_ROLE = "member" satisfies CommitteeRole;
const VOTING_COMMITTEE_ROLES = [
  "chair",
  "secretary",
  "member",
] as const satisfies readonly CommitteeRole[];

export const UX_REVIEW_RATE_LIMIT_RPC = "consume_ux_review_attempt";
export const UX_REVIEW_RATE_LIMIT_SCHEMA = "public";

export type UxReviewRateLimitDiagnostic = {
  code: string | null;
  message: string | null;
  details: string | null;
  hint: string | null;
  rpc: typeof UX_REVIEW_RATE_LIMIT_RPC;
  schema: typeof UX_REVIEW_RATE_LIMIT_SCHEMA;
};

export type UxReviewMembershipDiagnostic = {
  organizationRoles?: OrganizationRole[];
  organizationStatuses?: MembershipStatus[];
  committeeRoles?: CommitteeRole[];
  committeeStatuses?: MembershipStatus[];
  committeeVotingRights?: boolean[];
};

export type UxReviewDiagnostic =
  | UxReviewRateLimitDiagnostic
  | UxReviewMembershipDiagnostic;

type RateLimitResult =
  | { ok: true; allowed: boolean }
  | { ok: false; diagnostic: UxReviewRateLimitDiagnostic };

type RestrictedAccessResult =
  | { ok: true; organizationId: string }
  | {
      ok: false;
      diagnostic: UxReviewMembershipDiagnostic;
      reason:
        | "invalid-organization-membership"
        | "invalid-committee-membership";
    };

export class UxReviewRepository {
  constructor(private readonly admin: SupabaseClient<Database>) {}

  async consumeAttempt(
    attemptKey: string,
    maxAttempts: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    try {
      const { data, error } = await this.admin
        .schema(UX_REVIEW_RATE_LIMIT_SCHEMA)
        .rpc(UX_REVIEW_RATE_LIMIT_RPC, {
          attempt_key: attemptKey,
          max_attempts: maxAttempts,
          window_seconds: windowSeconds,
        });
      if (error) {
        return {
          ok: false,
          diagnostic: toRateLimitDiagnostic(error),
        };
      }
      return { ok: true, allowed: data };
    } catch (error) {
      return {
        ok: false,
        diagnostic: toRateLimitDiagnostic(error),
      };
    }
  }

  async findExistingUserByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();

    for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
      const { data, error } = await this.admin.auth.admin.listUsers({
        page,
        perPage: USERS_PER_PAGE,
      });
      if (error) throw error;

      const user = data.users.find(
        (candidate) => candidate.email?.trim().toLowerCase() === normalizedEmail,
      );
      if (user) return user;
      if (data.users.length < USERS_PER_PAGE) return null;
    }

    return null;
  }

  async findRestrictedAccess(userId: string): Promise<RestrictedAccessResult> {
    const { data: organizationMemberships, error: organizationError } =
      await this.admin
        .from("organization_members")
        .select("organization_id, role, status")
        .eq("user_id", userId);
    if (organizationError) throw organizationError;

    const activeOrganizationMemberships = organizationMemberships.filter(
      (membership) => membership.status === "active",
    );
    const activeOrganizationMembership = activeOrganizationMemberships[0];
    if (
      activeOrganizationMemberships.length !== 1 ||
      !activeOrganizationMembership ||
      !isAllowedOrganizationRole(activeOrganizationMembership.role)
    ) {
      return {
        ok: false,
        diagnostic: {
          organizationRoles: organizationMemberships.map(
            (membership) => membership.role,
          ),
          organizationStatuses: organizationMemberships.map(
            (membership) => membership.status,
          ),
        },
        reason: "invalid-organization-membership",
      };
    }

    const organizationId = activeOrganizationMembership.organization_id;
    const { data: reviewOrganization, error: organizationLookupError } =
      await this.admin
        .from("organizations")
        .select("id")
        .eq("id", organizationId)
        .eq("name", UX_REVIEW_ORGANIZATION_NAME)
        .is("deleted_at", null)
        .maybeSingle();
    if (organizationLookupError) throw organizationLookupError;
    if (!reviewOrganization) {
      return {
        ok: false,
        diagnostic: {
          organizationRoles: organizationMemberships.map(
            (membership) => membership.role,
          ),
          organizationStatuses: organizationMemberships.map(
            (membership) => membership.status,
          ),
        },
        reason: "invalid-organization-membership",
      };
    }

    const { data: committeeMemberships, error: committeeError } = await this.admin
      .from("committee_members")
      .select("committee_id, organization_id, role, status, voting_rights")
      .eq("user_id", userId);
    if (committeeError) throw committeeError;

    const committeeIds = committeeMemberships.map(
      (membership) => membership.committee_id,
    );
    const { data: reviewCommittees, error: committeeLookupError } =
      committeeIds.length === 0
        ? { data: [], error: null }
        : await this.admin
            .from("committees")
            .select("id")
            .in("id", committeeIds)
            .eq("organization_id", organizationId)
            .eq("name", UX_REVIEW_COMMITTEE_NAME)
            .is("archived_at", null)
            .is("deleted_at", null);
    if (committeeLookupError) throw committeeLookupError;

    const hasUnsafeCommitteeMembership = committeeMemberships.some(
      (membership) =>
        membership.organization_id !== organizationId ||
        membership.status !== "active" ||
        !isAllowedCommitteeMembership(
          activeOrganizationMembership.role,
          membership.role,
          membership.voting_rights,
        ),
    );

    if (
      committeeMemberships.length === 0 ||
      reviewCommittees.length !== committeeMemberships.length ||
      hasUnsafeCommitteeMembership
    ) {
      return {
        ok: false,
        diagnostic: {
          committeeRoles: committeeMemberships.map(
            (membership) => membership.role,
          ),
          committeeStatuses: committeeMemberships.map(
            (membership) => membership.status,
          ),
          committeeVotingRights: committeeMemberships.map(
            (membership) => membership.voting_rights,
          ),
        },
        reason: "invalid-committee-membership",
      };
    }

    return { ok: true, organizationId };
  }

  async generateMagicLinkToken(email: string, expectedUserId: string) {
    const { data, error } = await this.admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (error) throw error;
    if (data.user.id !== expectedUserId) return null;
    return data.properties.hashed_token;
  }
}

function isAllowedOrganizationRole(role: OrganizationRole) {
  return (
    role === OBSERVER_ORGANIZATION_ROLE ||
    role === EDITOR_ORGANIZATION_ROLE
  );
}

function isAllowedCommitteeMembership(
  organizationRole: OrganizationRole,
  committeeRole: CommitteeRole,
  votingRights: boolean,
) {
  if (organizationRole === EDITOR_ORGANIZATION_ROLE) {
    return committeeRole === EDITOR_COMMITTEE_ROLE;
  }

  // In the authoritative voting/approval functions, voting_rights only grants
  // voting access together with chair, secretary, or member. The viewer enum
  // remains read-only, including legacy rows carrying the table's true default.
  return (
    organizationRole === OBSERVER_ORGANIZATION_ROLE &&
    committeeRole === OBSERVER_COMMITTEE_ROLE &&
    !hasEffectiveVotingRights(committeeRole, votingRights)
  );
}

function hasEffectiveVotingRights(
  role: CommitteeRole,
  votingRights: boolean,
) {
  return (
    votingRights &&
    VOTING_COMMITTEE_ROLES.some((votingRole) => votingRole === role)
  );
}

function toRateLimitDiagnostic(error: unknown): UxReviewRateLimitDiagnostic {
  const candidate =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};

  return {
    code: sanitizeDiagnosticField(candidate.code),
    message: sanitizeDiagnosticField(candidate.message),
    details: sanitizeDiagnosticField(candidate.details),
    hint: sanitizeDiagnosticField(candidate.hint),
    rpc: UX_REVIEW_RATE_LIMIT_RPC,
    schema: UX_REVIEW_RATE_LIMIT_SCHEMA,
  };
}

function sanitizeDiagnosticField(value: unknown) {
  if (typeof value !== "string") return null;

  let sanitized = value.slice(0, 1_000);
  const secrets = [
    process.env.UX_REVIEW_TOKEN,
    process.env.UX_REVIEW_USER_EMAIL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ].filter((secret): secret is string => Boolean(secret));

  for (const secret of secrets) {
    sanitized = sanitized.split(secret).join("[redacted]");
  }

  return sanitized;
}
