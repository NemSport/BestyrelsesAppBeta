import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { NotFoundError } from "@/lib/errors";
import {
  followUpMutationSchema,
  followUpScopeSchema,
} from "@/lib/meeting-task-follow-up";
import { MeetingTaskFollowUpRepository } from "@/repositories/meeting-task-follow-up-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { getMeetingCapabilities } from "@/lib/meeting-capabilities";

export class MeetingTaskFollowUpService {
  private readonly repository: MeetingTaskFollowUpRepository;
  constructor(private readonly db: SupabaseClient<Database>) {
    this.repository = new MeetingTaskFollowUpRepository(db);
  }
  private async authorize(
    input: unknown,
    capability?: "editTasks" | "scheduleAgendaItem",
  ) {
    const scope = followUpScopeSchema.parse(input);
    const user = await new AuthService(this.db).requireUser();
    const authorization = new AuthorizationService(this.db);
    const context = capability
      ? await authorization.requireMeetingCapability(
          scope.organizationId,
          scope.committeeId,
          user.id,
          capability,
        )
      : await authorization.requireCommitteeMember(
          scope.organizationId,
          scope.committeeId,
          user.id,
        );
    const meeting = await new MeetingRepository(this.db).findWithAgenda(
      scope.meetingId,
    );
    if (
      !meeting ||
      meeting.organization_id !== scope.organizationId ||
      meeting.committee_id !== scope.committeeId
    )
      throw new NotFoundError("Mødet");
    return {
      scope,
      capabilities: getMeetingCapabilities(
        context.organizationMembership.role,
        context.membership?.role ?? null,
      ),
    };
  }
  async read(input: unknown) {
    const { scope, capabilities } = await this.authorize(input);
    return {
      ...(await this.repository.read(scope.meetingId)),
      canEdit: capabilities.editTasks,
      canLink: capabilities.scheduleAgendaItem,
    };
  }
  async ensure(input: unknown) {
    const { scope } = await this.authorize(input, "scheduleAgendaItem");
    return { occurrenceId: await this.repository.ensure(scope.meetingId) };
  }
  async mutate(input: unknown) {
    const parsed = followUpMutationSchema.parse(input);
    await this.authorize(
      parsed,
      parsed.action === "link" ? "scheduleAgendaItem" : "editTasks",
    );
    await this.repository.mutate(parsed);
    return { saved: true };
  }
}
