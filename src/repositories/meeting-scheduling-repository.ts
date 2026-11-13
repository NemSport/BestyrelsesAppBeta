import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { meetingCanReceiveResponses } from "@/lib/meeting-scheduling";
import type { MeetingMaterialRecipientSnapshot } from "@/types/meeting-materials";
import type { Database, TableInsert } from "@/types/database";

export class MeetingSchedulingRepository {
  private readonly admin = createAdminClient();

  async listPolls(organizationId: string, committeeId: string) {
    const { data, error } = await this.admin
      .from("meeting_date_polls")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("committee_id", committeeId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async findPoll(organizationId: string, committeeId: string, pollId: string) {
    const { data, error } = await this.admin
      .from("meeting_date_polls")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("committee_id", committeeId)
      .eq("id", pollId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async voters(pollId: string) {
    const { data, error } = await this.admin
      .from("meeting_date_poll_voters")
      .select("email,choices,maybe_choices,comment,token")
      .eq("poll_id", pollId)
      .order("email");
    if (error) throw error;
    return data;
  }

  async voter(token: string) {
    const { data, error } = await this.admin
      .from("meeting_date_poll_voters")
      .select("poll_id,choices,maybe_choices,comment")
      .eq("token", token)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { data: poll, error: pollError } = await this.admin
      .from("meeting_date_polls")
      .select("*")
      .eq("id", data.poll_id)
      .single();
    if (pollError) throw pollError;
    return (await this.activeScope(poll.organization_id, poll.committee_id))
      ? { poll, choices: data.choices, maybe_choices: data.maybe_choices, comment: data.comment }
      : null;
  }

  async vote(token: string, answers: { yes: number[]; maybe: number[]; no: number[] }, comment: string) {
    const { data, error } = await this.admin.rpc("submit_meeting_date_vote_details", {
      voter_token: token,
      yes_options: answers.yes,
      maybe_options: answers.maybe,
      no_options: answers.no,
      voter_comment: comment,
    });
    if (error) throw error;
    return data;
  }

  async prepareInvitations(
    rows: TableInsert<"meeting_invitation_responses">[],
  ) {
    const { error } = await this.admin
      .from("meeting_invitation_responses")
      .upsert(rows, {
        onConflict: "meeting_id,starts_at,email",
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }

  async invitations(meetingId: string, startsAt: string) {
    const { data, error } = await this.admin
      .from("meeting_invitation_responses")
      .select("*")
      .eq("meeting_id", meetingId)
      .eq("starts_at", startsAt)
      .order("name");
    if (error) throw error;
    return data;
  }

  async recordSent(meetingId: string, startsAt: string, emails: string[]) {
    if (!emails.length) return;
    const { error } = await this.admin
      .from("meeting_invitation_responses")
      .update({ sent_at: new Date().toISOString() })
      .eq("meeting_id", meetingId)
      .eq("starts_at", startsAt)
      .in(
        "email",
        emails.map((email) => email.trim().toLowerCase()),
      );
    // Delivery already succeeded. Avoid reporting a failed send and prompting a duplicate.
    if (error)
      console.error("Could not record delivery of meeting invitation links", {
        code: error.code,
      });
  }

  async invitation(token: string) {
    const { data, error } = await this.admin
      .from("meeting_invitation_responses")
      .select("meeting_id,starts_at,response")
      .eq("token", token)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { data: meeting, error: meetingError } = await this.admin
      .from("meetings")
      .select("organization_id,committee_id,title,starts_at,status,deleted_at")
      .eq("id", data.meeting_id)
      .maybeSingle();
    if (meetingError) throw meetingError;
    if (
      !meeting ||
      meeting.deleted_at ||
      !(await this.activeScope(meeting.organization_id, meeting.committee_id))
    )
      return null;
    return { invitation: data, meeting };
  }

  async respond(token: string, answer: "accepted" | "declined") {
    const { data, error } = await this.admin.rpc(
      "submit_meeting_invitation_response",
      { invitation_token: token, answer },
    );
    if (error) throw error;
    return data;
  }

  private async activeScope(organizationId: string, committeeId: string) {
    const [organization, committee] = await Promise.all([
      this.admin
        .from("organizations")
        .select("id")
        .eq("id", organizationId)
        .is("deleted_at", null)
        .maybeSingle(),
      this.admin
        .from("committees")
        .select("id")
        .eq("id", committeeId)
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);
    if (organization.error) throw organization.error;
    if (committee.error) throw committee.error;
    return Boolean(organization.data && committee.data);
  }
}

export async function createDatePoll(
  db: SupabaseClient<Database>,
  input: {
    organizationId: string;
    committeeId: string;
    title: string;
    options: string[];
    emails: string[];
  },
) {
  const { data, error } = await db.rpc("create_meeting_date_poll", {
    target_organization: input.organizationId,
    target_committee: input.committeeId,
    poll_title: input.title,
    poll_options: input.options,
    voter_emails: input.emails,
  });
  if (error) throw error;
  return data;
}

export async function finalizeDatePoll(
  db: SupabaseClient<Database>,
  input: {
    organizationId: string;
    committeeId: string;
    pollId: string;
    optionIndex: number;
  },
) {
  const { data, error } = await db.rpc("finalize_meeting_date_poll", {
    target_organization: input.organizationId,
    target_committee: input.committeeId,
    target_poll: input.pollId,
    option_index: input.optionIndex,
  });
  if (error) throw error;
  return data;
}

export async function meetingInvitationLinks(
  meeting: { id: string; starts_at: string; status: string },
  recipients: Pick<MeetingMaterialRecipientSnapshot, "name" | "email">[],
  origin: string,
) {
  if (!meetingCanReceiveResponses(meeting)) return new Map<string, string>();
  const repository = new MeetingSchedulingRepository();
  await repository.prepareInvitations(
    recipients.map((recipient) => ({
      meeting_id: meeting.id,
      starts_at: meeting.starts_at,
      name: recipient.name,
      email: recipient.email.trim().toLowerCase(),
    })),
  );
  return new Map(
    (await repository.invitations(meeting.id, meeting.starts_at)).map((row) => [
      row.email,
      new URL(`/meeting-response/${row.token}`, origin).href,
    ]),
  );
}
