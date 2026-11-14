import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, NotFoundError } from "@/lib/errors";
import { getEmailEnv } from "@/lib/email-env";
import { meetingDatePollEmailTemplate } from "@/lib/email-templates";
import {
  createDatePoll,
  finalizeDatePoll,
  MeetingSchedulingRepository,
} from "@/repositories/meeting-scheduling-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { EmailService } from "@/services/email-service";
import type { Database } from "@/types/database";

type Scope = { organizationId: string; committeeId: string };

export class MeetingSchedulingService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  private async requireManager(scope: Scope) {
    const user = await new AuthService(this.db).requireUser();
    return new AuthorizationService(this.db).requireCommitteeManager(
      scope.organizationId,
      scope.committeeId,
      user.id,
    );
  }

  async list(scope: Scope) {
    await this.requireManager(scope);
    return new MeetingSchedulingRepository().listPolls(
      scope.organizationId,
      scope.committeeId,
    );
  }

  async get(scope: Scope, pollId: string) {
    await this.requireManager(scope);
    const repository = new MeetingSchedulingRepository();
    const poll = await repository.findPoll(
      scope.organizationId,
      scope.committeeId,
      pollId,
    );
    if (!poll) throw new NotFoundError("Datoafstemningen");
    return { poll, voters: await repository.voters(poll.id) };
  }

  async committeeRecipients(scope: Scope) {
    const { committee } = await this.requireManager(scope);
    const members = await new OrganizationMemberRepository(this.db).listMembers(
      scope.organizationId,
    );
    return {
      committeeName: committee.name,
      members: members
        .filter(
          (member) =>
            member.status === "active" &&
            member.committees.some(
              (membership) => membership.id === scope.committeeId,
            ),
        )
        .map((member) => ({
          id: member.user_id,
          name: member.full_name || member.email || "Medlem",
          email: member.email?.trim() || null,
        })),
    };
  }

  async create(
    input: Scope & {
      title: string;
      options: string[];
      emails: string[];
      memberIds: string[];
    },
  ) {
    const { members } = await this.committeeRecipients(input);
    const emailsById = new Map(members.map(({ id, email }) => [id, email]));
    const selectedEmails = input.memberIds.map((id) => emailsById.get(id));
    if (selectedEmails.some((email) => !email)) {
      throw new AppError(
        "Et valgt medlem mangler en mailadresse eller er ikke længere i udvalget. Genindlæs siden.",
        422,
      );
    }
    const emails = [
      ...new Set([
        ...input.emails,
        ...selectedEmails.flatMap((email) =>
          email ? [email.toLowerCase()] : [],
        ),
      ]),
    ];
    if (!emails.length || emails.length > 50) {
      throw new AppError("Vælg mellem 1 og 50 modtagere med mailadresse.", 422);
    }
    return createDatePoll(this.db, { ...input, emails });
  }

  async finalize(input: Scope & { pollId: string; optionIndex: number }) {
    await this.requireManager(input);
    return finalizeDatePoll(this.db, input);
  }

  async sendPoll(scope: Scope, pollId: string, origin: string) {
    const { poll, voters } = await this.get(scope, pollId);
    if (
      poll.meeting_id ||
      !poll.options.some((value) => Date.parse(value) > Date.now())
    ) {
      throw new AppError("Datoafstemningen er lukket.", 409);
    }
    const email = new EmailService(this.db);
    const from = getEmailEnv().EMAIL_FROM;
    const delivery = await email.sendPreparedBatch(
      voters.map((voter) => ({
        from,
        organizationId: scope.organizationId,
        notificationPath: `/api/organizations/${scope.organizationId}/overview/poll/${pollId}`,
        to: [voter.email],
        push: {
          path: `/meeting-vote/${voter.token}`,
          body: `Datoafstemning: ${poll.title}. Vælg de tider, der passer dig.`,
        },
        ...meetingDatePollEmailTemplate(
          poll.title,
          new URL(`/meeting-vote/${voter.token}`, origin).href,
        ),
      })),
    );
    return { sent: delivery.successfulCount, total: voters.length };
  }
}
