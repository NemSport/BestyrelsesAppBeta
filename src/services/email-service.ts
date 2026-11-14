import type { SupabaseClient } from "@supabase/supabase-js";

import { after } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailEnv } from "@/lib/email-env";
import {
  meetingAgendaEmailTemplate,
  meetingMinutesApprovalEmailTemplate,
  type MinutesApprovalEmailTask,
} from "@/lib/email-templates";
import { formatDateTime } from "@/lib/localization";
import { AppError, NotFoundError } from "@/lib/errors";
import { sendMeetingAgendaEmailSchema } from "@/lib/validation";
import { meetingInvitationLinks, MeetingSchedulingRepository } from "@/repositories/meeting-scheduling-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { OrganizationBrandingService } from "@/services/organization-branding-service";
import { sendEmailPushes, type EmailPush } from "@/services/push-notification-service";
import type { Database } from "@/types/database";
import type { OrganizationMemberDirectoryEntry } from "@/types/domain";

export type EmailPayload = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  push: EmailPush;
  organizationId?: string;
  notificationPath?: string;
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
    const committeeContext = await this.authorization.requireMeetingCapability(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
      "sendAgendaEmail",
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
    const meetingPath = `/organizations/${parsed.organizationId}/committees/${parsed.committeeId}/meetings/${parsed.meetingId}`;
    const branding = await new OrganizationBrandingService(
      this.db,
    ).getEmailBranding(
      parsed.organizationId,
      organizationContext.organization.name,
    );
    const responseLinks = await meetingInvitationLinks(
      meeting,
      recipients.map((recipient) => ({ name: recipient.full_name || recipient.email, email: recipient.email })),
      root,
    );
    const messages = recipients.map((recipient) => {
      const responseUrl = responseLinks.get(recipient.email.trim().toLowerCase());
      return {
        from: getEmailEnv().EMAIL_FROM,
        organizationId: parsed.organizationId,
        notificationPath: responseUrl ? `/api/organizations/${parsed.organizationId}/overview/meeting/${meeting.id}` : meetingPath,
        to: [recipient.email],
        push: {
          path: responseUrl ? new URL(responseUrl).pathname : meetingPath,
          body: responseUrl ? `Mødeindkaldelse: ${meeting.title} · ${formatDateTime(meeting.starts_at)}. Svar om du deltager.` : `Dagsorden klar til ${meeting.title}.`,
        },
        ...meetingAgendaEmailTemplate({
          organizationName: organizationContext.organization.name,
          committeeName: committeeContext.committee.name,
          meeting,
          agendaItems,
          subject: parsed.subject,
          message: parsed.message,
          meetingUrl: `${root}/organizations/${parsed.organizationId}/committees/${parsed.committeeId}/meetings/${parsed.meetingId}`,
          branding,
          invitationResponseUrl: responseUrl,
        }),
      };
    });
    let delivery: EmailDeliveryResult;
    if (responseLinks.size) {
      const repository = new MeetingSchedulingRepository();
      let successfulCount = 0;
      let lastDelivery: EmailDeliveryResult | undefined;
      for (let index = 0; index < messages.length; index += 100) {
        const batch = messages.slice(index, index + 100);
        try {
          lastDelivery = await this.sendPreparedBatch(batch);
        } catch (error) {
          if (!lastDelivery) throw error;
          break;
        }
        if (!lastDelivery.sent) break;
        successfulCount += batch.length;
        await repository.recordSent(meeting.id, meeting.starts_at, batch.flatMap(({ to }) => to));
      }
      if (!lastDelivery) throw new AppError("Udsendelsen mislykkedes.", 502);
      const failedCount = lastDelivery.sent ? messages.length - successfulCount : 0;
      delivery = {
        ...lastDelivery,
        recipientCount: messages.length,
        successfulCount,
        failedCount,
        sent: successfulCount === messages.length,
        error: failedCount ? `${failedCount} modtagere fik ikke deres indkaldelse.` : lastDelivery.error,
      };
    } else {
      delivery = await this.deliver({ ...messages[0], to: recipients.map(({ email }) => email) });
    }

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
    organizationId: string;
    to: string;
    recipientName: string;
    organizationName: string;
    committeeName: string;
    meetingTitle: string;
    meetingDate: string;
    approvalUrl: string;
    pushPath: string;
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
      organizationId: input.organizationId,
      push: { path: input.pushPath, body: `Referat fra ${input.meetingTitle} er klar til din godkendelse.` },
      ...template,
      attachments: [
        {
          filename: input.pdfFileName,
          content: Buffer.from(input.pdf).toString("base64"),
        },
      ],
    });
  }

  async sendPrepared(payload: EmailPayload) {
    return this.deliver(payload);
  }

  async sendPreparedBatch(messages: Omit<EmailPayload, "attachments">[]) {
    return this.deliver(messages);
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

  private async deliver(payload: EmailPayload | Omit<EmailPayload, "attachments">[]): Promise<EmailDeliveryResult> {
    const env = getEmailEnv();
    const batch = Array.isArray(payload);
    const recipientCount = batch ? payload.reduce((count, mail) => count + mail.to.length, 0) : payload.to.length;
    const subject = batch ? payload[0]?.subject : payload.subject;
    const attachmentCount = batch ? 0 : payload.attachments?.length ?? 0;
    if (env.EMAIL_DELIVERY_MODE_REQUESTED === "resend") {
      const missingConfig = [
        !env.RESEND_API_KEY_CONFIGURED ? "RESEND_API_KEY" : null,
        !env.EMAIL_FROM_CONFIGURED ? "EMAIL_FROM" : null,
      ].filter(Boolean);
      if (missingConfig.length > 0) {
        console.warn("[email] Resend email skipped: missing config", {
          missingConfig,
          toCount: recipientCount,
          subject,
          attachmentCount,
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
        subject,
        attachmentCount,
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

    if (batch && payload.length > 100) {
      throw new AppError("Udsendelsen kan højst indeholde 100 personlige mails.", 422);
    }
    const messages: EmailPayload[] = batch ? payload : [payload];
    const emails = messages.map(({ from, to, subject, text, html, attachments }) => ({
      from, to, subject, text, html, attachments,
    }));
    const response = await fetch(batch ? "https://api.resend.com/emails/batch" : "https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batch ? emails : emails[0]),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[email] Resend delivery failed", {
        status: response.status,
        detail: detail.slice(0, 500),
        toCount: recipientCount,
        subject,
      });
      throw new AppError(
        "Emailen kunne ikke sendes lige nu. Prøv igen senere.",
        502,
        "EMAIL_PROVIDER_FAILED",
      );
    }
    const notifications = messages.map(({ to, push }) => ({ to, push }));
    try {
      const admin = createAdminClient();
      const records = messages.flatMap(({ organizationId, to, push, notificationPath }) => organizationId
        ? [admin.rpc("record_organization_email_notification", {
            target_org: organizationId,
            recipient_emails: to.map((email) => email.trim().toLowerCase()),
            notification_path: notificationPath ?? push.path,
            push_path: push.path,
            notification_title: push.body,
          })]
        : []);
      const results = await Promise.all(records);
      if (results.some(({ error }) => error)) console.warn("Some emails could not be listed in Overblik.");
    } catch {
      console.warn("Sent emails could not be listed in Overblik.");
    }
    after(async () => {
      try {
        await sendEmailPushes(notifications);
      } catch {
        console.warn("[push] Could not deliver notifications for an email send.");
      }
    });
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
