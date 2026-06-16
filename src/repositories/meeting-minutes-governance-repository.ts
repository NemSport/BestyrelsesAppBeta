import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert } from "@/types/database";

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
}
