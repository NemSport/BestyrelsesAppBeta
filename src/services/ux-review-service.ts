import "server-only";

import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { getUxReviewEnv } from "@/lib/server-env";
import { UxReviewRepository } from "@/repositories/ux-review-repository";

const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS_PER_CLIENT = 8;
const MAX_ATTEMPTS_GLOBALLY = 80;

type ReviewSessionGrant = {
  organizationId: string;
  tokenHash: string;
  userId: string;
};

export class UxReviewService {
  async authorize(
    suppliedToken: string | null,
    clientAddress: string,
  ): Promise<ReviewSessionGrant | null> {
    const reviewEnv = getUxReviewEnv();
    if (!reviewEnv) return null;

    const repository = new UxReviewRepository(createAdminClient());
    const clientAttemptKey = createHmac("sha256", reviewEnv.UX_REVIEW_TOKEN)
      .update(`client:${clientAddress}`)
      .digest("hex");
    const globalAttemptKey = createHmac("sha256", reviewEnv.UX_REVIEW_TOKEN)
      .update("global")
      .digest("hex");

    const [clientAllowed, globallyAllowed] = await Promise.all([
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
    if (!clientAllowed || !globallyAllowed) return null;
    if (!tokensMatch(suppliedToken, reviewEnv.UX_REVIEW_TOKEN)) return null;

    const user = await repository.findExistingUserByEmail(
      reviewEnv.UX_REVIEW_USER_EMAIL,
    );
    if (
      !user ||
      user.role !== "authenticated" ||
      !user.email ||
      !user.email_confirmed_at ||
      isCurrentlyBanned(user)
    ) {
      return null;
    }

    const organizationId = await repository.findRestrictedOrganizationId(user.id);
    if (!organizationId) return null;

    const tokenHash = await repository.generateMagicLinkToken(user.email, user.id);
    if (!tokenHash) return null;

    return { organizationId, tokenHash, userId: user.id };
  }
}

function tokensMatch(suppliedToken: string | null, expectedToken: string) {
  const suppliedDigest = createHash("sha256")
    .update(suppliedToken ?? "")
    .digest();
  const expectedDigest = createHash("sha256").update(expectedToken).digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}

function isCurrentlyBanned(user: { banned_until?: string }) {
  if (!user.banned_until) return false;
  return new Date(user.banned_until).getTime() > Date.now();
}
