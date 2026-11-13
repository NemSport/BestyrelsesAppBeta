import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, NotFoundError } from "@/lib/errors";
import { getEmailEnv } from "@/lib/email-env";
import { meetingDatePollEmailTemplate } from "@/lib/email-templates";
import {
  createDatePoll,
  finalizeDatePoll,
  MeetingSchedulingRepository,
} from "@/repositories/meeting-scheduling-repository";
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

  async create(
    input: Scope & { title: string; options: string[]; emails: string[] },
  ) {
    await this.requireManager(input);
    return createDatePoll(this.db, input);
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
        to: [voter.email],
        ...meetingDatePollEmailTemplate(
          poll.title,
          new URL(`/meeting-vote/${voter.token}`, origin).href,
        ),
      })),
    );
    return { sent: delivery.successfulCount, total: voters.length };
  }
}
