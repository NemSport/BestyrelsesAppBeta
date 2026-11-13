import type { SupabaseClient } from "@supabase/supabase-js";

import type { BestieAgendaSuggestion } from "@/lib/bestie-agenda";
import type { Database } from "@/types/database";

export class BestieAgendaRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listDrafts(meetingId: string): Promise<BestieAgendaSuggestion[]> {
    const { data, error } = await this.db
      .from("bestie_agenda_drafts")
      .select(
        "source_kind, source_id, source_title, title, description, objective",
      )
      .eq("meeting_id", meetingId)
      .order("created_at")
      .order("title")
      .order("source_id");
    if (error) throw error;
    return data.map(({ source_kind, source_id, source_title, ...content }) => ({
      ...content,
      sourceKind: source_kind,
      sourceId: source_id,
      sourceTitle: source_title,
    }));
  }
}
