import type { SupabaseClient } from "@supabase/supabase-js";

import { getEmailEnv } from "@/lib/email-env";
import { meetingAgendaEmailTemplate } from "@/lib/email-templates";
import { AppError, NotFoundError } from "@/lib/errors";
import { sendMeetingAgendaEmailSchema } from "@/lib/validation";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { OrganizationBrandingService } from "@/services/organization-branding-service";
import type { Database } from "@/types/database";
import type { OrganizationMemberDirectoryEntry } from "@/types/domain";

type EmailPayload = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
};

export class EmailService {
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;
  private readonly meetings: MeetingRepository;
  private readonly members: OrganizationMemberRepository;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
    this.meetings = new MeetingRepository(db);
    this.members = new OrganizationMemberRepository(db);
  }

  async sendMeetingAgenda(input: unknown, appUrl: string) {
    const user = await this.auth.requireUser();
    const parsed = sendMeetingAgendaEmailSchema.parse(input);
    const organizationContext =
      await this.authorization.requireOrganizationMember(
        parsed.organizationId,
        user.id,
      );
    const committeeContext = await this.authorization.requireCommitteeManager(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );

    const meeting = await this.meetings.findWithAgenda(parsed.meetingId);
    if (
      !meeting ||
      meeting.organization_id !== parsed.organizationId ||
      meeting.committee_id !== parsed.committeeId
    ) {
      throw new NotFoundError("Mødet");
    }

    const memberDirectory = await this.members.listMembers(parsed.organizationId);
    const recipients = this.resolveCommitteeRecipients({
      members: memberDirectory,
      committeeId: parsed.committeeId,
      selectedUserIds: parsed.recipients.memberUserIds,
      includeCommittee: parsed.recipients.includeCommittee,
    });
    if (
      !parsed.recipients.includeCommittee &&
      recipients.length !== new Set(parsed.recipients.memberUserIds).size
    ) {
      throw new AppError(
        "En eller flere valgte modtagere hører ikke til dette udvalg.",
        422,
        "EMAIL_INVALID_RECIPIENT",
      );
    }
    if (recipients.length === 0) {
      throw new AppError(
        "Der blev ikke fundet nogen gyldige modtagere.",
        422,
        "EMAIL_NO_RECIPIENTS",
      );
    }

    const agendaItems = meeting.agenda_item_occurrences.flatMap((occurrence) =>
      occurrence.agenda_items
        ? [
            {
              title: occurrence.agenda_items.title,
              item_type: occurrence.agenda_items.item_type,
            },
          ]
        : [],
    );
    const root = appUrl.replace(/\/$/, "");
    const branding = await new OrganizationBrandingService(
      this.db,
    ).getEmailBranding(
      parsed.organizationId,
      organizationContext.organization.name,
    );
    const template = meetingAgendaEmailTemplate({
      organizationName: organizationContext.organization.name,
      committeeName: committeeContext.committee.name,
      meeting,
      agendaItems,
      subject: parsed.subject,
      message: parsed.message,
      meetingUrl: `${root}/organizations/${parsed.organizationId}/committees/${parsed.committeeId}/meetings/${parsed.meetingId}`,
      branding,
    });

    const delivery = await this.deliver({
      from: getEmailEnv().EMAIL_FROM,
      to: recipients.map((recipient) => recipient.email),
      ...template,
    });

    return {
      sent: delivery.sent,
      mode: delivery.mode,
      recipientCount: recipients.length,
      recipients: recipients.map((recipient) => ({
        userId: recipient.user_id,
        name: recipient.full_name || recipient.email,
        email: recipient.email,
      })),
    };
  }

  private resolveCommitteeRecipients({
    members,
    committeeId,
    selectedUserIds,
    includeCommittee,
  }: {
    members: OrganizationMemberDirectoryEntry[];
    committeeId: string;
    selectedUserIds: string[];
    includeCommittee: boolean;
  }) {
    const selected = new Set(selectedUserIds);
    const recipients = members.filter((member) => {
      if (member.status !== "active") return false;
      const belongsToCommittee = member.committees.some(
        (committee) => committee.id === committeeId,
      );
      if (!belongsToCommittee) return false;
      return includeCommittee || selected.has(member.user_id);
    });
    const unique = new Map(recipients.map((member) => [member.email, member]));
    return [...unique.values()];
  }

  private async deliver(payload: EmailPayload) {
    const env = getEmailEnv();
    if (env.EMAIL_DELIVERY_MODE === "stub") {
      console.info("[email] Stub email prepared", {
        toCount: payload.to.length,
        subject: payload.subject,
      });
      return { sent: false, mode: "stub" as const };
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[email] Resend delivery failed", {
        status: response.status,
        detail: detail.slice(0, 500),
      });
      throw new AppError(
        "Emailen kunne ikke sendes lige nu. Prøv igen senere.",
        502,
        "EMAIL_PROVIDER_FAILED",
      );
    }
    return { sent: true, mode: "resend" as const };
  }
}
