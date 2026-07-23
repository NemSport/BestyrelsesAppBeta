import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

const USERS_PER_PAGE = 1_000;
const MAX_USER_PAGES = 100;
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

type RateLimitResult =
  | { ok: true; allowed: boolean }
  | { ok: false; diagnostic: UxReviewRateLimitDiagnostic };

type RestrictedAccessResult =
  | { ok: true; organizationId: string }
  | {
      ok: false;
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
      activeOrganizationMembership.role !== "viewer"
    ) {
      return {
        ok: false,
        reason: "invalid-organization-membership",
      };
    }

    const organizationId = activeOrganizationMembership.organization_id;
    const { data: committeeMemberships, error: committeeError } = await this.admin
      .from("committee_members")
      .select("organization_id, role, status, voting_rights")
      .eq("user_id", userId)
      .eq("status", "active");
    if (committeeError) throw committeeError;

    const hasUnsafeCommitteeMembership = committeeMemberships.some(
      (membership) =>
        membership.organization_id !== organizationId ||
        membership.role !== "viewer" ||
        membership.voting_rights,
    );

    return hasUnsafeCommitteeMembership
      ? { ok: false, reason: "invalid-committee-membership" }
      : { ok: true, organizationId };
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
