import "server-only";

import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { getUxReviewEnv } from "@/lib/server-env";
import {
  UxReviewRepository,
  type UxReviewDiagnostic,
} from "@/repositories/ux-review-repository";

const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS_PER_CLIENT = 8;
const MAX_ATTEMPTS_GLOBALLY = 80;
const CALLBACK_LIFETIME_SECONDS = 2 * 60;

type ReviewSessionGrant = {
  callbackExpiresAt: number;
  callbackSignature: string;
  organizationId: string;
  tokenHash: string;
};

export type UxReviewFailureReason =
  | "environment-not-preview"
  | "review-disabled"
  | "invalid-server-environment"
  | "token-missing"
  | "token-length-mismatch"
  | "token-mismatch"
  | "rate-limit-rejected"
  | "review-user-not-found"
  | "review-user-not-confirmed"
  | "review-user-ineligible"
  | "invalid-organization-membership"
  | "invalid-committee-membership"
  | "supabase-operation-failed";

export type UxReviewAuthorizationResult =
  | { ok: true; grant: ReviewSessionGrant }
  | {
      ok: false;
      diagnostic?: UxReviewDiagnostic;
      reason: UxReviewFailureReason;
      stage: string;
    };

export class UxReviewService {
  async authorize(
    suppliedToken: string | null,
    clientAddress: string,
  ): Promise<UxReviewAuthorizationResult> {
    const environment = getUxReviewEnv();
    if (!environment.ok) {
      return {
        ok: false,
        stage: "environment-validation",
        reason: environment.reason,
      };
    }
    const reviewEnv = environment.value;

    if (!suppliedToken) {
      return { ok: false, stage: "token-validation", reason: "token-missing" };
    }
    if (suppliedToken.length !== reviewEnv.UX_REVIEW_TOKEN.length) {
      return {
        ok: false,
        stage: "token-validation",
        reason: "token-length-mismatch",
      };
    }

    let repository: UxReviewRepository;
    try {
      repository = new UxReviewRepository(createAdminClient());
    } catch {
      return {
        ok: false,
        stage: "environment-validation",
        reason: "invalid-server-environment",
      };
    }
    const clientAttemptKey = createHmac("sha256", reviewEnv.UX_REVIEW_TOKEN)
      .update(`client:${clientAddress}`)
      .digest("hex");
    const globalAttemptKey = createHmac("sha256", reviewEnv.UX_REVIEW_TOKEN)
      .update("global")
      .digest("hex");

    const rateLimitResults = await Promise.all([
      repository.consumeAttempt(
        clientAttemptKey,
        MAX_ATTEMPTS_PER_CLIENT,
        RATE_LIMIT_WINDOW_SECONDS,
      ),
      repository.consumeAttempt(
        globalAttemptKey,
        MAX_ATTEMPTS_GLOBALLY,
        RATE_LIMIT_WINDOW_SECONDS,
      ),
    ]);
    const failedRateLimit = rateLimitResults.find((result) => !result.ok);
    if (failedRateLimit && !failedRateLimit.ok) {
      return {
        ok: false,
        diagnostic: failedRateLimit.diagnostic,
        stage: "rate-limit",
        reason: "supabase-operation-failed",
      };
    }
    const rateLimitRejected = rateLimitResults.some(
      (result) => result.ok && !result.allowed,
    );
    if (rateLimitRejected) {
      return {
        ok: false,
        stage: "rate-limit",
        reason: "rate-limit-rejected",
      };
    }
    if (!tokensMatch(suppliedToken, reviewEnv.UX_REVIEW_TOKEN)) {
      return { ok: false, stage: "token-validation", reason: "token-mismatch" };
    }

    let user;
    try {
      user = await repository.findExistingUserByEmail(
        reviewEnv.UX_REVIEW_USER_EMAIL,
      );
    } catch {
      return {
        ok: false,
        stage: "review-user",
        reason: "supabase-operation-failed",
      };
    }
    if (!user) {
      return {
        ok: false,
        stage: "review-user",
        reason: "review-user-not-found",
      };
    }
    if (!user.email_confirmed_at) {
      return {
        ok: false,
        stage: "review-user",
        reason: "review-user-not-confirmed",
      };
    }
    if (
      user.role !== "authenticated" ||
      !user.email ||
      isCurrentlyBanned(user)
    ) {
      return {
        ok: false,
        stage: "review-user",
        reason: "review-user-ineligible",
      };
    }

    let restrictedAccess;
    try {
      restrictedAccess = await repository.findRestrictedAccess(user.id);
    } catch {
      return {
        ok: false,
        stage: "membership-validation",
        reason: "supabase-operation-failed",
      };
    }
    if (!restrictedAccess.ok) {
      return {
        ok: false,
        diagnostic: restrictedAccess.diagnostic,
        stage: "membership-validation",
        reason: restrictedAccess.reason,
      };
    }

    let tokenHash;
    try {
      tokenHash = await repository.generateMagicLinkToken(user.email, user.id);
    } catch {
      return {
        ok: false,
        stage: "magic-link",
        reason: "supabase-operation-failed",
      };
    }
    if (!tokenHash) {
      return {
        ok: false,
        stage: "magic-link",
        reason: "review-user-not-found",
      };
    }

    const callbackExpiresAt =
      Math.floor(Date.now() / 1_000) + CALLBACK_LIFETIME_SECONDS;

    return {
      ok: true,
      grant: {
        callbackExpiresAt,
        callbackSignature: signCallbackGrant(
          tokenHash,
          restrictedAccess.organizationId,
          callbackExpiresAt,
          reviewEnv.UX_REVIEW_TOKEN,
        ),
        organizationId: restrictedAccess.organizationId,
        tokenHash,
      },
    };
  }
}

export function isValidUxReviewCallbackGrant(input: {
  expiresAt: number;
  organizationId: string;
  signature: string;
  tokenHash: string;
}, secret: string) {
  const currentTime = Math.floor(Date.now() / 1_000);
  if (
    !Number.isSafeInteger(input.expiresAt) ||
    input.expiresAt < currentTime ||
    input.expiresAt > currentTime + CALLBACK_LIFETIME_SECONDS
  ) {
    return false;
  }

  const expectedSignature = signCallbackGrant(
    input.tokenHash,
    input.organizationId,
    input.expiresAt,
    secret,
  );
  return tokensMatch(input.signature, expectedSignature);
}

function tokensMatch(suppliedToken: string | null, expectedToken: string) {
  const suppliedDigest = createHash("sha256")
    .update(suppliedToken ?? "")
    .digest();
  const expectedDigest = createHash("sha256").update(expectedToken).digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}

function signCallbackGrant(
  tokenHash: string,
  organizationId: string,
  expiresAt: number,
  secret: string,
) {
  return createHmac("sha256", secret)
    .update(`v1\n${tokenHash}\n${organizationId}\n${expiresAt}`)
    .digest("hex");
}

function isCurrentlyBanned(user: { banned_until?: string }) {
  if (!user.banned_until) return false;
  return new Date(user.banned_until).getTime() > Date.now();
}
