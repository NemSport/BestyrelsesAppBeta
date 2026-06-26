import type { SupabaseClient } from "@supabase/supabase-js";

import { getEmailEnv } from "@/lib/email-env";
import {
  meetingAgendaEmailTemplate,
  meetingMinutesApprovalEmailTemplate,
  type MinutesApprovalEmailTask,
} from "@/lib/email-templates";
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
  attachments?: Array<{
    filename: string;
    content: string;
  }>;
};

export type EmailDeliveryStatus =
  | "sent"
  | "stubbed"
  | "failed"
  | "skipped_missing_config";

export type EmailDeliveryResult = {
  status: EmailDeliveryStatus;
  sent: boolean;
  mode: "stub" | "resend";
  recipientCount: number;
  successfulCount: number;
  failedCount: number;
  error?: string;
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

    const memberDirectory = await this.members.listMembers(
      parsed.organizationId,
    );
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
              objective: occurrence.agenda_items.objective,
              description: occurrence.agenda_items.description,
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
      ...delivery,
      recipientCount: recipients.length,
      recipients: recipients.map((recipient) => ({
        userId: recipient.user_id,
        name: recipient.full_name || recipient.email,
        email: recipient.email,
      })),
    };
  }

  async sendMeetingMinutesApprovalEmail(input: {
    to: string;
    recipientName: string;
    organizationName: string;
    committeeName: string;
    meetingTitle: string;
    meetingDate: string;
    approvalUrl: string;
    personalTasks: MinutesApprovalEmailTask[];
    unassignedTasks: MinutesApprovalEmailTask[];
    pdf: Uint8Array;
    pdfFileName: string;
    branding?: Awaited<
      ReturnType<OrganizationBrandingService["getEmailBranding"]>
    >;
  }) {
    const template = meetingMinutesApprovalEmailTemplate({
      organizationName: input.organizationName,
      committeeName: input.committeeName,
      meetingTitle: input.meetingTitle,
      meetingDate: input.meetingDate,
      approvalUrl: input.approvalUrl,
      recipientName: input.recipientName,
      personalTasks: input.personalTasks,
      unassignedTasks: input.unassignedTasks,
      branding: input.branding,
    });

    return this.deliver({
      from: getEmailEnv().EMAIL_FROM,
      to: [input.to],
      ...template,
      attachments: [
        {
          filename: input.pdfFileName,
          content: Buffer.from(input.pdf).toString("base64"),
        },
      ],
    });
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

  private async deliver(payload: EmailPayload): Promise<EmailDeliveryResult> {
    const env = getEmailEnv();
    const recipientCount = payload.to.length;
    if (env.EMAIL_DELIVERY_MODE_REQUESTED === "resend") {
      const missingConfig = [
        !env.RESEND_API_KEY_CONFIGURED ? "RESEND_API_KEY" : null,
        !env.EMAIL_FROM_CONFIGURED ? "EMAIL_FROM" : null,
      ].filter(Boolean);
      if (missingConfig.length > 0) {
        console.warn("[email] Resend email skipped: missing config", {
          missingConfig,
          toCount: recipientCount,
          subject: payload.subject,
          attachmentCount: payload.attachments?.length ?? 0,
        });
        return {
          status: "skipped_missing_config",
          sent: false,
          mode: "stub",
          recipientCount,
          successfulCount: 0,
          failedCount: 0,
          error: `Manglende email-konfiguration: ${missingConfig.join(", ")}`,
        };
      }
    }

    if (env.EMAIL_DELIVERY_MODE !== "resend") {
      console.info("[email] Stub email prepared", {
        toCount: recipientCount,
        subject: payload.subject,
        attachmentCount: payload.attachments?.length ?? 0,
      });
      return {
        status: "stubbed",
        sent: false,
        mode: "stub",
        recipientCount,
        successfulCount: 0,
        failedCount: 0,
      };
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
        toCount: recipientCount,
        subject: payload.subject,
      });
      throw new AppError(
        "Emailen kunne ikke sendes lige nu. Prøv igen senere.",
        502,
        "EMAIL_PROVIDER_FAILED",
      );
    }
    return {
      status: "sent",
      sent: true,
      mode: "resend",
      recipientCount,
      successfulCount: recipientCount,
      failedCount: 0,
    };
  }
}
