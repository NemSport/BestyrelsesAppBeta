import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert } from "@/types/database";
import type { PendingMinutesApprovalReminder } from "@/types/domain";

const attachmentBucket = "meeting-minute-attachments";

export class MeetingMinutesGovernanceRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async canApprove(meetingMinutesId: string) {
    const { data, error } = await this.db.rpc("can_approve_meeting_minutes", {
      target_meeting_minutes_id: meetingMinutesId,
    });
    if (error) throw error;
    return data;
  }

  async listApprovals(meetingMinutesId: string) {
    const { data, error } = await this.db
      .from("meeting_minute_approvals")
      .select("*")
      .eq("meeting_minutes_id", meetingMinutesId)
      .order("created_at");
    if (error) throw error;
    return data;
  }

  async listPendingApprovalReminders(
    organizationId: string,
    userId: string,
  ): Promise<PendingMinutesApprovalReminder[]> {
    const { data: approvals, error: approvalsError } = await this.db
      .from("meeting_minute_approvals")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .in("status", ["pending", "change_requested"])
      .order("updated_at", { ascending: true });
    if (approvalsError) throw approvalsError;
    if (!approvals.length) return [];

    const minutesIds = [
      ...new Set(approvals.map((approval) => approval.meeting_minutes_id)),
    ];
    const { data: minutesRows, error: minutesError } = await this.db
      .from("meeting_minutes")
      .select("*")
      .eq("organization_id", organizationId)
      .in("id", minutesIds)
      .eq("status", "ready_for_approval");
    if (minutesError) throw minutesError;
    if (!minutesRows.length) return [];

    const minutesById = new Map(
      minutesRows.map((minutes) => [minutes.id, minutes]),
    );
    const meetingIds = [
      ...new Set(minutesRows.map((minutes) => minutes.meeting_id)),
    ];
    const { data: meetings, error: meetingsError } = await this.db
      .from("meetings")
      .select("id, title, starts_at, committee_id, deleted_at")
      .eq("organization_id", organizationId)
      .in("id", meetingIds)
      .is("deleted_at", null);
    if (meetingsError) throw meetingsError;
    if (!meetings.length) return [];

    const meetingsById = new Map(
      meetings.map((meeting) => [meeting.id, meeting]),
    );
    const committeeIds = [
      ...new Set(meetings.map((meeting) => meeting.committee_id)),
    ];
    const { data: committees, error: committeesError } = await this.db
      .from("committees")
      .select("id, name")
      .eq("organization_id", organizationId)
      .in("id", committeeIds);
    if (committeesError) throw committeesError;
    const committeesById = new Map(
      (committees ?? []).map((committee) => [committee.id, committee]),
    );

    return approvals.flatMap((approval) => {
      const minutes = minutesById.get(approval.meeting_minutes_id);
      if (!minutes) return [];
      const meeting = meetingsById.get(minutes.meeting_id);
      if (!meeting) return [];
      const committee = committeesById.get(meeting.committee_id);
      if (!committee) return [];

      return [
        {
          id: approval.id,
          meetingMinutesId: minutes.id,
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          meetingStartsAt: meeting.starts_at,
          committeeId: committee.id,
          committeeName: committee.name,
          status: approval.status,
          approvalDeadline: minutes.approval_deadline,
          updatedAt: approval.updated_at,
        },
      ];
    });
  }

  async sendForApproval(meetingMinutesId: string, deadline: string) {
    const { data, error } = await this.db.rpc(
      "send_meeting_minutes_for_approval",
      {
        target_meeting_minutes_id: meetingMinutesId,
        target_deadline: deadline,
      },
    );
    if (error) throw error;
    return data;
  }

  async respond(
    meetingMinutesId: string,
    status: "approved" | "change_requested",
    comment: string | null,
  ) {
    const { data, error } = await this.db.rpc(
      "respond_to_meeting_minutes_approval",
      {
        target_meeting_minutes_id: meetingMinutesId,
        response_status: status,
        response_comment: comment,
      },
    );
    if (error) throw error;
    return data;
  }

  async markNoResponse(meetingMinutesId: string) {
    const { data, error } = await this.db.rpc(
      "mark_missing_approval_responses",
      { target_meeting_minutes_id: meetingMinutesId },
    );
    if (error) throw error;
    return data;
  }

  async listMeetingAttachments(meetingMinutesId: string) {
    const { data, error } = await this.db
      .from("meeting_minute_attachments")
      .select("*")
      .eq("meeting_minutes_id", meetingMinutesId)
      .order("created_at");
    if (error) throw error;
    return data;
  }

  async listAgendaItemAttachments(meetingId: string) {
    const { data, error } = await this.db
      .from("agenda_item_minute_attachments")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at");
    if (error) throw error;
    return data;
  }

  async createMeetingAttachment(
    input: TableInsert<"meeting_minute_attachments">,
  ) {
    const { data, error } = await this.db
      .from("meeting_minute_attachments")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async createAgendaItemAttachment(
    input: TableInsert<"agenda_item_minute_attachments">,
  ) {
    const { data, error } = await this.db
      .from("agenda_item_minute_attachments")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async findAttachment(attachmentId: string) {
    const meetingResult = await this.db
      .from("meeting_minute_attachments")
      .select("*")
      .eq("id", attachmentId)
      .maybeSingle();
    if (meetingResult.error) throw meetingResult.error;
    if (meetingResult.data) return meetingResult.data;

    const agendaResult = await this.db
      .from("agenda_item_minute_attachments")
      .select("*")
      .eq("id", attachmentId)
      .maybeSingle();
    if (agendaResult.error) throw agendaResult.error;
    return agendaResult.data;
  }

  async deleteMeetingAttachment(attachmentId: string) {
    const { error } = await this.db
      .from("meeting_minute_attachments")
      .delete()
      .eq("id", attachmentId);
    if (error) throw error;
  }

  async deleteAgendaItemAttachment(attachmentId: string) {
    const { error } = await this.db
      .from("agenda_item_minute_attachments")
      .delete()
      .eq("id", attachmentId);
    if (error) throw error;
  }

  async upload(storagePath: string, file: File) {
    const { error } = await this.db.storage
      .from(attachmentBucket)
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (error) throw error;
  }

  async removeUpload(storagePath: string) {
    const { error } = await this.db.storage
      .from(attachmentBucket)
      .remove([storagePath]);
    if (error) throw error;
  }

  async createDownloadUrl(
    storagePath: string,
    downloadFileName: string | null = null,
  ) {
    const { data, error } = await this.db.storage
      .from(attachmentBucket)
      .createSignedUrl(
        storagePath,
        60,
        downloadFileName ? { download: downloadFileName } : undefined,
      );
    if (error) throw error;
    return data.signedUrl;
  }

  async download(storagePath: string) {
    const { data, error } = await this.db.storage
      .from(attachmentBucket)
      .download(storagePath);
    if (error) throw error;
    return new Uint8Array(await data.arrayBuffer());
  }
}
