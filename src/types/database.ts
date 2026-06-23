export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          avatar_url: string | null;
          timezone: string;
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          avatar_url?: string | null;
          timezone?: string;
          onboarding_completed_at?: string | null;
        };
        Update: {
          full_name?: string;
          avatar_url?: string | null;
          timezone?: string;
          onboarding_completed_at?: string | null;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_by: string;
          deleted_at: string | null;
          deleted_by: string | null;
          delete_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_by: string;
        };
        Update: {
          name?: string;
          slug?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          delete_expires_at?: string | null;
        };
        Relationships: [];
      };
      organization_branding: {
        Row: {
          id: string;
          organization_id: string;
          logo_url: string | null;
          primary_color: string | null;
          secondary_color: string | null;
          accent_color: string | null;
          font_family:
            | "Inter"
            | "System"
            | "Arial"
            | "Roboto"
            | "Source Sans 3"
            | "Ubuntu"
            | "Share"
            | "Montserrat"
            | "Open Sans"
            | "Lato"
            | "Poppins"
            | "Nunito"
            | "Merriweather"
            | "Georgia"
            | "Verdana"
            | "Tahoma"
            | "Trebuchet MS"
            | "Times New Roman"
            | "Courier New"
            | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          logo_url?: string | null;
          primary_color?: string | null;
          secondary_color?: string | null;
          accent_color?: string | null;
          font_family?:
            | "Inter"
            | "System"
            | "Arial"
            | "Roboto"
            | "Source Sans 3"
            | "Ubuntu"
            | "Share"
            | "Montserrat"
            | "Open Sans"
            | "Lato"
            | "Poppins"
            | "Nunito"
            | "Merriweather"
            | "Georgia"
            | "Verdana"
            | "Tahoma"
            | "Trebuchet MS"
            | "Times New Roman"
            | "Courier New"
            | null;
        };
        Update: {
          logo_url?: string | null;
          primary_color?: string | null;
          secondary_color?: string | null;
          accent_color?: string | null;
          font_family?:
            | "Inter"
            | "System"
            | "Arial"
            | "Roboto"
            | "Source Sans 3"
            | "Ubuntu"
            | "Share"
            | "Montserrat"
            | "Open Sans"
            | "Lato"
            | "Poppins"
            | "Nunito"
            | "Merriweather"
            | "Georgia"
            | "Verdana"
            | "Tahoma"
            | "Trebuchet MS"
            | "Times New Roman"
            | "Courier New"
            | null;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["organization_role"];
          status: Database["public"]["Enums"]["membership_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["organization_role"];
          status?: Database["public"]["Enums"]["membership_status"];
        };
        Update: {
          role?: Database["public"]["Enums"]["organization_role"];
          status?: Database["public"]["Enums"]["membership_status"];
        };
        Relationships: [];
      };
      ai_activity_log: {
        Row: {
          id: string;
          organization_id: string;
          meeting_id: string | null;
          agenda_item_id: string | null;
          user_id: string;
          field: string;
          action_type: string;
          original_text: string | null;
          ai_suggestion: string | null;
          status: Database["public"]["Enums"]["ai_activity_status"];
          provider: string | null;
          model: string | null;
          prompt_version: string | null;
          label: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
          applied_at: string | null;
          dismissed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          meeting_id?: string | null;
          agenda_item_id?: string | null;
          user_id: string;
          field: string;
          action_type: string;
          original_text?: string | null;
          ai_suggestion?: string | null;
          status?: Database["public"]["Enums"]["ai_activity_status"];
          provider?: string | null;
          model?: string | null;
          prompt_version?: string | null;
          label: string;
          metadata?: Json;
          applied_at?: string | null;
          dismissed_at?: string | null;
        };
        Update: {
          field?: string;
          action_type?: string;
          original_text?: string | null;
          ai_suggestion?: string | null;
          status?: Database["public"]["Enums"]["ai_activity_status"];
          provider?: string | null;
          model?: string | null;
          prompt_version?: string | null;
          label?: string;
          metadata?: Json;
          applied_at?: string | null;
          dismissed_at?: string | null;
        };
        Relationships: [];
      };
      organization_invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: Database["public"]["Enums"]["organization_role"];
          status: Database["public"]["Enums"]["invitation_status"];
          invited_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role?: Database["public"]["Enums"]["organization_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          invited_by: string;
        };
        Update: {
          email?: string;
          role?: Database["public"]["Enums"]["organization_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
        };
        Relationships: [];
      };
      committees: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string;
          created_by: string;
          archived_at: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          delete_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string;
          created_by: string;
          archived_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          delete_expires_at?: string | null;
        };
        Update: {
          name?: string;
          description?: string;
          archived_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          delete_expires_at?: string | null;
        };
        Relationships: [];
      };
      committee_members: {
        Row: {
          organization_id: string;
          committee_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["committee_role"];
          title: string | null;
          voting_rights: boolean;
          status: Database["public"]["Enums"]["membership_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          committee_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["committee_role"];
          title?: string | null;
          voting_rights?: boolean;
          status?: Database["public"]["Enums"]["membership_status"];
        };
        Update: {
          role?: Database["public"]["Enums"]["committee_role"];
          title?: string | null;
          voting_rights?: boolean;
          status?: Database["public"]["Enums"]["membership_status"];
        };
        Relationships: [];
      };
      meetings: {
        Row: {
          id: string;
          organization_id: string;
          committee_id: string;
          title: string;
          description: string;
          status: Database["public"]["Enums"]["meeting_status"];
          starts_at: string;
          ends_at: string | null;
          location: string | null;
          created_by: string;
          deleted_at: string | null;
          deleted_by: string | null;
          delete_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          committee_id: string;
          title: string;
          description?: string;
          status?: Database["public"]["Enums"]["meeting_status"];
          starts_at: string;
          ends_at?: string | null;
          location?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          delete_expires_at?: string | null;
          created_by: string;
        };
        Update: {
          title?: string;
          description?: string;
          status?: Database["public"]["Enums"]["meeting_status"];
          starts_at?: string;
          ends_at?: string | null;
          location?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          delete_expires_at?: string | null;
        };
        Relationships: [];
      };
      meeting_attendees: {
        Row: {
          organization_id: string;
          committee_id: string;
          meeting_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["meeting_role"];
          attendance_status: Database["public"]["Enums"]["attendance_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          committee_id: string;
          meeting_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["meeting_role"];
          attendance_status?: Database["public"]["Enums"]["attendance_status"];
        };
        Update: {
          role?: Database["public"]["Enums"]["meeting_role"];
          attendance_status?: Database["public"]["Enums"]["attendance_status"];
        };
        Relationships: [];
      };
      agenda_items: {
        Row: {
          id: string;
          organization_id: string;
          committee_id: string;
          parent_id: string | null;
          title: string;
          description: string;
          objective: string;
          item_type: Database["public"]["Enums"]["agenda_item_type"];
          lifecycle_status: Database["public"]["Enums"]["agenda_item_status"];
          owner_id: string | null;
          source: Database["public"]["Enums"]["agenda_item_source"];
          standard_key:
            | Database["public"]["Enums"]["standard_agenda_item_key"]
            | null;
          target_date: string | null;
          resolved_at: string | null;
          created_by: string;
          deleted_at: string | null;
          deleted_by: string | null;
          delete_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          committee_id: string;
          parent_id?: string | null;
          title: string;
          description?: string;
          objective?: string;
          item_type?: Database["public"]["Enums"]["agenda_item_type"];
          lifecycle_status?: Database["public"]["Enums"]["agenda_item_status"];
          owner_id?: string | null;
          source?: Database["public"]["Enums"]["agenda_item_source"];
          standard_key?:
            | Database["public"]["Enums"]["standard_agenda_item_key"]
            | null;
          target_date?: string | null;
          resolved_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          delete_expires_at?: string | null;
          created_by: string;
        };
        Update: {
          parent_id?: string | null;
          title?: string;
          description?: string;
          objective?: string;
          item_type?: Database["public"]["Enums"]["agenda_item_type"];
          lifecycle_status?: Database["public"]["Enums"]["agenda_item_status"];
          owner_id?: string | null;
          standard_key?:
            | Database["public"]["Enums"]["standard_agenda_item_key"]
            | null;
          target_date?: string | null;
          resolved_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          delete_expires_at?: string | null;
        };
        Relationships: [];
      };
      agenda_item_occurrences: {
        Row: {
          id: string;
          organization_id: string;
          committee_id: string;
          agenda_item_id: string;
          meeting_id: string;
          position: number;
          presenter_id: string | null;
          duration_minutes: number | null;
          meeting_status: Database["public"]["Enums"]["occurrence_status"];
          outcome_summary: string;
          carried_forward: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          delete_expires_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          committee_id: string;
          agenda_item_id: string;
          meeting_id: string;
          position: number;
          presenter_id?: string | null;
          duration_minutes?: number | null;
          meeting_status?: Database["public"]["Enums"]["occurrence_status"];
          outcome_summary?: string;
          carried_forward?: boolean;
          deleted_at?: string | null;
          deleted_by?: string | null;
          delete_expires_at?: string | null;
        };
        Update: {
          position?: number;
          presenter_id?: string | null;
          duration_minutes?: number | null;
          meeting_status?: Database["public"]["Enums"]["occurrence_status"];
          outcome_summary?: string;
          carried_forward?: boolean;
          deleted_at?: string | null;
          deleted_by?: string | null;
          delete_expires_at?: string | null;
        };
        Relationships: [];
      };
      meeting_minutes: {
        Row: {
          id: string;
          organization_id: string;
          committee_id: string;
          meeting_id: string;
          minutes_text: string;
          decisions: string;
          internal_note: string | null;
          status: Database["public"]["Enums"]["meeting_minutes_status"];
          approval_deadline: string | null;
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          committee_id: string;
          meeting_id: string;
          minutes_text?: string;
          decisions?: string;
          internal_note?: string | null;
          status?: Database["public"]["Enums"]["meeting_minutes_status"];
          approval_deadline?: string | null;
          created_by: string;
          updated_by: string;
        };
        Update: {
          minutes_text?: string;
          decisions?: string;
          internal_note?: string | null;
          status?: Database["public"]["Enums"]["meeting_minutes_status"];
          approval_deadline?: string | null;
          updated_by?: string;
        };
        Relationships: [];
      };
      agenda_item_minutes: {
        Row: {
          id: string;
          organization_id: string;
          committee_id: string;
          meeting_id: string;
          agenda_item_id: string;
          agenda_item_occurrence_id: string | null;
          notes: string;
          decision: string;
          follow_up: string;
          responsible_user_id: string | null;
          deadline: string | null;
          status: Database["public"]["Enums"]["agenda_item_minutes_status"];
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          committee_id: string;
          meeting_id: string;
          agenda_item_id: string;
          agenda_item_occurrence_id?: string | null;
          notes?: string;
          decision?: string;
          follow_up?: string;
          responsible_user_id?: string | null;
          deadline?: string | null;
          status?: Database["public"]["Enums"]["agenda_item_minutes_status"];
          created_by: string;
          updated_by: string;
        };
        Update: {
          agenda_item_occurrence_id?: string | null;
          notes?: string;
          decision?: string;
          follow_up?: string;
          responsible_user_id?: string | null;
          deadline?: string | null;
          status?: Database["public"]["Enums"]["agenda_item_minutes_status"];
          updated_by?: string;
        };
        Relationships: [];
      };
      meeting_minute_approvals: {
        Row: {
          id: string;
          organization_id: string;
          committee_id: string;
          meeting_id: string;
          meeting_minutes_id: string;
          user_id: string;
          status: Database["public"]["Enums"]["meeting_minute_approval_status"];
          comment: string | null;
          responded_at: string | null;
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          committee_id: string;
          meeting_id: string;
          meeting_minutes_id: string;
          user_id: string;
          status?: Database["public"]["Enums"]["meeting_minute_approval_status"];
          comment?: string | null;
          responded_at?: string | null;
          created_by: string;
          updated_by: string;
        };
        Update: {
          status?: Database["public"]["Enums"]["meeting_minute_approval_status"];
          comment?: string | null;
          responded_at?: string | null;
          updated_by?: string;
        };
        Relationships: [];
      };
      meeting_minute_attachments: {
        Row: {
          id: string;
          organization_id: string;
          committee_id: string;
          meeting_id: string;
          meeting_minutes_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          file_size: number;
          uploaded_by: string;
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          committee_id: string;
          meeting_id: string;
          meeting_minutes_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          file_size: number;
          uploaded_by: string;
          created_by: string;
          updated_by: string;
        };
        Update: {
          file_name?: string;
          mime_type?: string;
          updated_by?: string;
        };
        Relationships: [];
      };
      agenda_item_minute_attachments: {
        Row: {
          id: string;
          organization_id: string;
          committee_id: string;
          meeting_id: string;
          agenda_item_id: string;
          agenda_item_minutes_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          file_size: number;
          uploaded_by: string;
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          committee_id: string;
          meeting_id: string;
          agenda_item_id: string;
          agenda_item_minutes_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          file_size: number;
          uploaded_by: string;
          created_by: string;
          updated_by: string;
        };
        Update: {
          file_name?: string;
          mime_type?: string;
          updated_by?: string;
        };
        Relationships: [];
      };
      transferred_agenda_items: {
        Row: {
          id: string;
          organization_id: string;
          committee_id: string;
          source_meeting_id: string;
          source_agenda_item_id: string;
          source_agenda_item_occurrence_id: string | null;
          source_agenda_item_minutes_id: string;
          target_meeting_id: string | null;
          target_agenda_item_id: string | null;
          transfer_reason: Database["public"]["Enums"]["agenda_item_transfer_reason"];
          source_status: Database["public"]["Enums"]["agenda_item_minutes_status"];
          target_item_type: Database["public"]["Enums"]["agenda_item_type"];
          status: Database["public"]["Enums"]["transferred_agenda_item_status"];
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          committee_id: string;
          source_meeting_id: string;
          source_agenda_item_id: string;
          source_agenda_item_occurrence_id?: string | null;
          source_agenda_item_minutes_id: string;
          target_meeting_id?: string | null;
          target_agenda_item_id?: string | null;
          transfer_reason: Database["public"]["Enums"]["agenda_item_transfer_reason"];
          source_status: Database["public"]["Enums"]["agenda_item_minutes_status"];
          target_item_type: Database["public"]["Enums"]["agenda_item_type"];
          status?: Database["public"]["Enums"]["transferred_agenda_item_status"];
          created_by: string;
          updated_by: string;
        };
        Update: {
          target_meeting_id?: string | null;
          target_agenda_item_id?: string | null;
          status?: Database["public"]["Enums"]["transferred_agenda_item_status"];
          updated_by?: string;
        };
        Relationships: [];
      };
      decisions: {
        Row: {
          id: string;
          organization_id: string;
          committee_id: string;
          meeting_id: string | null;
          agenda_item_id: string | null;
          title: string;
          description: string;
          status: Database["public"]["Enums"]["decision_status"];
          responsible_user_id: string | null;
          decision_date: string;
          deadline: string | null;
          category: string | null;
          internal_note: string | null;
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
          cancelled_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          committee_id: string;
          meeting_id?: string | null;
          agenda_item_id?: string | null;
          title: string;
          description?: string;
          status?: Database["public"]["Enums"]["decision_status"];
          responsible_user_id?: string | null;
          decision_date: string;
          deadline?: string | null;
          category?: string | null;
          internal_note?: string | null;
          created_by: string;
          updated_by: string;
          archived_at?: string | null;
          cancelled_at?: string | null;
        };
        Update: {
          committee_id?: string;
          meeting_id?: string | null;
          agenda_item_id?: string | null;
          title?: string;
          description?: string;
          status?: Database["public"]["Enums"]["decision_status"];
          responsible_user_id?: string | null;
          decision_date?: string;
          deadline?: string | null;
          category?: string | null;
          internal_note?: string | null;
          updated_by?: string;
          archived_at?: string | null;
          cancelled_at?: string | null;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          organization_id: string;
          committee_id: string;
          meeting_id: string | null;
          agenda_item_id: string | null;
          decision_id: string | null;
          role_profile_id: string | null;
          task_template_id: string | null;
          annual_wheel_event_id: string | null;
          annual_wheel_task_template_id: string | null;
          annual_wheel_activation_year: number | null;
          title: string;
          description: string;
          status: Database["public"]["Enums"]["task_status"];
          responsible_user_id: string | null;
          deadline: string | null;
          reminder_at: string | null;
          reminder_sent_at: string | null;
          last_notified_at: string | null;
          category: string | null;
          internal_note: string | null;
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          committee_id: string;
          meeting_id?: string | null;
          agenda_item_id?: string | null;
          decision_id?: string | null;
          role_profile_id?: string | null;
          task_template_id?: string | null;
          annual_wheel_event_id?: string | null;
          annual_wheel_task_template_id?: string | null;
          annual_wheel_activation_year?: number | null;
          title: string;
          description?: string;
          status?: Database["public"]["Enums"]["task_status"];
          responsible_user_id?: string | null;
          deadline?: string | null;
          reminder_at?: string | null;
          reminder_sent_at?: string | null;
          last_notified_at?: string | null;
          category?: string | null;
          internal_note?: string | null;
          created_by: string;
          updated_by: string;
          archived_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          committee_id?: string;
          meeting_id?: string | null;
          agenda_item_id?: string | null;
          decision_id?: string | null;
          role_profile_id?: string | null;
          task_template_id?: string | null;
          annual_wheel_event_id?: string | null;
          annual_wheel_task_template_id?: string | null;
          annual_wheel_activation_year?: number | null;
          title?: string;
          description?: string;
          status?: Database["public"]["Enums"]["task_status"];
          responsible_user_id?: string | null;
          deadline?: string | null;
          reminder_at?: string | null;
          reminder_sent_at?: string | null;
          last_notified_at?: string | null;
          category?: string | null;
          internal_note?: string | null;
          updated_by?: string;
          archived_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      task_comments: {
        Row: {
          id: string;
          task_id: string;
          organization_id: string;
          committee_id: string;
          body: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          organization_id: string;
          committee_id: string;
          body: string;
          created_by: string;
        };
        Update: {
          body?: string;
        };
        Relationships: [];
      };
      annual_wheel_events: {
        Row: {
          id: string;
          organization_id: string;
          committee_id: string | null;
          meeting_id: string | null;
          task_id: string | null;
          role_profile_id: string | null;
          series_id: string;
          occurrence_index: number;
          title: string;
          description: string;
          starts_on: string;
          ends_on: string;
          responsible_user_id: string | null;
          category: string | null;
          priority: Database["public"]["Enums"]["annual_wheel_priority"];
          status: Database["public"]["Enums"]["annual_wheel_event_status"];
          recurrence: Database["public"]["Enums"]["annual_wheel_recurrence"];
          recurrence_interval: number;
          recurrence_rule: string | null;
          is_exception: boolean;
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          committee_id?: string | null;
          meeting_id?: string | null;
          task_id?: string | null;
          role_profile_id?: string | null;
          series_id?: string;
          occurrence_index?: number;
          title: string;
          description?: string;
          starts_on: string;
          ends_on: string;
          responsible_user_id?: string | null;
          category?: string | null;
          priority?: Database["public"]["Enums"]["annual_wheel_priority"];
          status?: Database["public"]["Enums"]["annual_wheel_event_status"];
          recurrence?: Database["public"]["Enums"]["annual_wheel_recurrence"];
          recurrence_interval?: number;
          recurrence_rule?: string | null;
          is_exception?: boolean;
          created_by: string;
          updated_by: string;
          deleted_at?: string | null;
        };
        Update: {
          committee_id?: string | null;
          meeting_id?: string | null;
          task_id?: string | null;
          role_profile_id?: string | null;
          title?: string;
          description?: string;
          starts_on?: string;
          ends_on?: string;
          responsible_user_id?: string | null;
          category?: string | null;
          priority?: Database["public"]["Enums"]["annual_wheel_priority"];
          status?: Database["public"]["Enums"]["annual_wheel_event_status"];
          recurrence?: Database["public"]["Enums"]["annual_wheel_recurrence"];
          recurrence_interval?: number;
          recurrence_rule?: string | null;
          is_exception?: boolean;
          updated_by?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      annual_wheel_key_people: {
        Row: {
          id: string;
          organization_id: string;
          annual_wheel_event_id: string;
          user_id: string | null;
          name: string;
          role_title: string;
          phone: string | null;
          email: string | null;
          sort_order: number;
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          annual_wheel_event_id: string;
          user_id?: string | null;
          name: string;
          role_title: string;
          phone?: string | null;
          email?: string | null;
          sort_order?: number;
          created_by: string;
          updated_by: string;
          archived_at?: string | null;
        };
        Update: {
          user_id?: string | null;
          name?: string;
          role_title?: string;
          phone?: string | null;
          email?: string | null;
          sort_order?: number;
          updated_by?: string;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      annual_wheel_task_templates: {
        Row: {
          id: string;
          organization_id: string;
          annual_wheel_event_id: string;
          title: string;
          description: string;
          suggested_responsible_user_id: string | null;
          deadline_anchor: Database["public"]["Enums"]["annual_wheel_deadline_anchor"];
          deadline_offset_days: number | null;
          sort_order: number;
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          annual_wheel_event_id: string;
          title: string;
          description?: string;
          suggested_responsible_user_id?: string | null;
          deadline_anchor?: Database["public"]["Enums"]["annual_wheel_deadline_anchor"];
          deadline_offset_days?: number | null;
          sort_order?: number;
          created_by: string;
          updated_by: string;
          archived_at?: string | null;
        };
        Update: {
          title?: string;
          description?: string;
          suggested_responsible_user_id?: string | null;
          deadline_anchor?: Database["public"]["Enums"]["annual_wheel_deadline_anchor"];
          deadline_offset_days?: number | null;
          sort_order?: number;
          updated_by?: string;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      responsibility_areas: {
        Row: {
          id: string; organization_id: string; name: string; description: string;
          created_by: string; created_at: string; updated_at: string; archived_at: string | null;
        };
        Insert: {
          id?: string; organization_id: string; name: string; description?: string;
          created_by: string; archived_at?: string | null;
        };
        Update: { name?: string; description?: string; archived_at?: string | null };
        Relationships: [];
      };
      role_profiles: {
        Row: {
          id: string; organization_id: string; title: string; purpose: string;
          description: string; responsibilities: string; exclusions: string;
          competencies: string; collaboration: string; meeting_expectations: string;
          contact_people: string; created_by: string; updated_by: string;
          created_at: string; updated_at: string; archived_at: string | null;
        };
        Insert: {
          id?: string; organization_id: string; title: string; purpose?: string;
          description?: string; responsibilities?: string; exclusions?: string;
          competencies?: string; collaboration?: string; meeting_expectations?: string;
          contact_people?: string; created_by: string; updated_by: string;
          archived_at?: string | null;
        };
        Update: {
          title?: string; purpose?: string; description?: string; responsibilities?: string;
          exclusions?: string; competencies?: string; collaboration?: string;
          meeting_expectations?: string; contact_people?: string; updated_by?: string;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      role_profile_responsibility_areas: {
        Row: { role_profile_id: string; responsibility_area_id: string; organization_id: string };
        Insert: { role_profile_id: string; responsibility_area_id: string; organization_id: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      role_profile_committees: {
        Row: { role_profile_id: string; committee_id: string; organization_id: string };
        Insert: { role_profile_id: string; committee_id: string; organization_id: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      role_profile_decisions: {
        Row: {
          organization_id: string;
          role_profile_id: string;
          decision_id: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          role_profile_id: string;
          decision_id: string;
          created_by: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      role_profile_assignments: {
        Row: {
          id: string; role_profile_id: string; organization_id: string; user_id: string;
          starts_on: string; ends_on: string | null; created_by: string; created_at: string;
        };
        Insert: {
          id?: string; role_profile_id: string; organization_id: string; user_id: string;
          starts_on?: string; ends_on?: string | null; created_by: string;
        };
        Update: { starts_on?: string; ends_on?: string | null };
        Relationships: [];
      };
      task_templates: {
        Row: {
          id: string; organization_id: string; role_profile_id: string; committee_id: string;
          title: string; description: string; category: string | null;
          default_deadline_days: number | null; created_by: string; created_at: string;
          updated_at: string; archived_at: string | null;
        };
        Insert: {
          id?: string; organization_id: string; role_profile_id: string; committee_id: string;
          title: string; description?: string; category?: string | null;
          default_deadline_days?: number | null; created_by: string; archived_at?: string | null;
        };
        Update: {
          committee_id?: string; title?: string; description?: string; category?: string | null;
          default_deadline_days?: number | null; archived_at?: string | null;
        };
        Relationships: [];
      };
      role_documents: {
        Row: {
          id: string; organization_id: string; role_profile_id: string; title: string;
          url: string; created_by: string; created_at: string;
        };
        Insert: {
          id?: string; organization_id: string; role_profile_id: string; title: string;
          url: string; created_by: string;
        };
        Update: { title?: string; url?: string };
        Relationships: [];
      };
      onboarding_guides: {
        Row: {
          id: string; organization_id: string; role_profile_id: string; introduction: string;
          first_30_days: string; practical_information: string; created_by: string;
          updated_by: string; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; organization_id: string; role_profile_id: string; introduction?: string;
          first_30_days?: string; practical_information?: string; created_by: string; updated_by: string;
        };
        Update: {
          introduction?: string; first_30_days?: string; practical_information?: string;
          updated_by?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_organization_with_owner: {
        Args: { organization_name: string; organization_slug: string };
        Returns: Database["public"]["Tables"]["organizations"]["Row"];
      };
      create_committee_with_chair: {
        Args: {
          target_organization_id: string;
          committee_name: string;
          committee_description?: string;
        };
        Returns: Database["public"]["Tables"]["committees"]["Row"];
      };
      create_agenda_item: {
        Args: {
          target_organization_id: string;
          target_committee_id: string;
          agenda_title: string;
          agenda_description: string;
          agenda_objective: string;
          agenda_type: Database["public"]["Enums"]["agenda_item_type"];
          agenda_status: Database["public"]["Enums"]["agenda_item_status"];
          agenda_target_date?: string | null;
          target_meeting_id?: string | null;
        };
        Returns: Database["public"]["Tables"]["agenda_items"]["Row"];
      };
      schedule_agenda_item: {
        Args: {
          target_organization_id: string;
          target_committee_id: string;
          target_agenda_item_id: string;
          target_meeting_id: string;
          target_duration_minutes?: number | null;
        };
        Returns: Database["public"]["Tables"]["agenda_item_occurrences"]["Row"];
      };
      schedule_transferred_agenda_item: {
        Args: {
          target_transfer_id: string;
          requested_target_meeting_id?: string | null;
        };
        Returns: Database["public"]["Tables"]["transferred_agenda_items"]["Row"];
      };
      is_organization_member: {
        Args: { target_organization_id: string };
        Returns: boolean;
      };
      is_organization_admin: {
        Args: { target_organization_id: string };
        Returns: boolean;
      };
      is_committee_member: {
        Args: { target_committee_id: string };
        Returns: boolean;
      };
      can_manage_committee: {
        Args: { target_committee_id: string };
        Returns: boolean;
      };
      can_edit_agenda_item: {
        Args: { target_committee_id: string };
        Returns: boolean;
      };
      soft_delete_organization: {
        Args: { target_organization_id: string };
        Returns: Database["public"]["Tables"]["organizations"]["Row"];
      };
      restore_organization: {
        Args: { target_organization_id: string };
        Returns: Database["public"]["Tables"]["organizations"]["Row"];
      };
      list_organization_members: {
        Args: { target_organization_id: string };
        Returns: Array<{
          user_id: string;
          full_name: string | null;
          email: string;
          role: Database["public"]["Enums"]["organization_role"];
          status: Database["public"]["Enums"]["membership_status"];
          committees: Json;
        }>;
      };
      invite_organization_member: {
        Args: {
          target_organization_id: string;
          invitation_email: string;
          invitation_role: Database["public"]["Enums"]["organization_role"];
        };
        Returns: Database["public"]["Tables"]["organization_invitations"]["Row"];
      };
      update_organization_member_role: {
        Args: {
          target_organization_id: string;
          target_user_id: string;
          new_role: Database["public"]["Enums"]["organization_role"];
        };
        Returns: Database["public"]["Tables"]["organization_members"]["Row"];
      };
      remove_organization_member: {
        Args: {
          target_organization_id: string;
          target_user_id: string;
        };
        Returns: undefined;
      };
      create_meeting_with_standard_items: {
        Args: {
          target_organization_id: string;
          target_committee_id: string;
          meeting_title: string;
          meeting_description: string;
          meeting_starts_at: string;
          meeting_ends_at?: string | null;
          meeting_location?: string | null;
        };
        Returns: Database["public"]["Tables"]["meetings"]["Row"];
      };
      can_approve_meeting_minutes: {
        Args: { target_meeting_minutes_id: string };
        Returns: boolean;
      };
      send_meeting_minutes_for_approval: {
        Args: {
          target_meeting_minutes_id: string;
          target_deadline: string;
        };
        Returns: Database["public"]["Tables"]["meeting_minutes"]["Row"];
      };
      respond_to_meeting_minutes_approval: {
        Args: {
          target_meeting_minutes_id: string;
          response_status: Database["public"]["Enums"]["meeting_minute_approval_status"];
          response_comment?: string | null;
        };
        Returns: Database["public"]["Tables"]["meeting_minute_approvals"]["Row"];
      };
      mark_missing_approval_responses: {
        Args: { target_meeting_minutes_id: string };
        Returns: Database["public"]["Tables"]["meeting_minute_approvals"]["Row"][];
      };
      soft_delete_committee: {
        Args: { target_committee_id: string };
        Returns: Database["public"]["Tables"]["committees"]["Row"];
      };
      restore_committee: {
        Args: { target_committee_id: string };
        Returns: Database["public"]["Tables"]["committees"]["Row"];
      };
      soft_delete_meeting: {
        Args: { target_meeting_id: string };
        Returns: Database["public"]["Tables"]["meetings"]["Row"];
      };
      restore_meeting: {
        Args: { target_meeting_id: string };
        Returns: Database["public"]["Tables"]["meetings"]["Row"];
      };
      soft_delete_agenda_item: {
        Args: { target_agenda_item_id: string };
        Returns: Database["public"]["Tables"]["agenda_items"]["Row"];
      };
      restore_agenda_item: {
        Args: { target_agenda_item_id: string };
        Returns: Database["public"]["Tables"]["agenda_items"]["Row"];
      };
      soft_delete_agenda_item_occurrence: {
        Args: { target_occurrence_id: string };
        Returns: Database["public"]["Tables"]["agenda_item_occurrences"]["Row"];
      };
      restore_agenda_item_occurrence: {
        Args: { target_occurrence_id: string };
        Returns: Database["public"]["Tables"]["agenda_item_occurrences"]["Row"];
      };
    };
    Enums: {
      ai_activity_status: "generated" | "applied" | "dismissed" | "failed";
      organization_role: "owner" | "admin" | "member" | "viewer";
      membership_status: "active" | "suspended";
      committee_role: "chair" | "secretary" | "member" | "viewer";
      meeting_status: "draft" | "scheduled" | "in_progress" | "completed" | "cancelled";
      attendance_status: "invited" | "accepted" | "declined" | "attended" | "absent";
      meeting_role: "chair" | "secretary" | "member" | "guest";
      agenda_item_type: "information" | "discussion" | "decision" | "follow_up";
      agenda_item_status:
        | "backlog"
        | "scheduled"
        | "preparation"
        | "active"
        | "follow_up"
        | "resolved"
        | "archived";
      agenda_item_source: "manual" | "meeting";
      occurrence_status: "planned" | "discussed" | "deferred" | "decided" | "skipped";
      invitation_status: "pending" | "accepted" | "revoked";
      meeting_minutes_status: "draft" | "ready_for_approval" | "approved";
      meeting_minute_approval_status:
        | "pending"
        | "approved"
        | "change_requested"
        | "no_response";
      agenda_item_minutes_status:
        | "not_started"
        | "in_progress"
        | "needs_decision"
        | "needs_responsible"
        | "completed"
        | "information_oriented"
        | "information_requires_follow_up"
        | "information_revisit"
        | "discussion_completed"
        | "discussion_continue"
        | "decision_approved"
        | "decision_rejected"
        | "decision_deferred"
        | "decision_requires_follow_up"
        | "follow_up_completed"
        | "deadline_changed"
        | "follow_up_continued";
      standard_agenda_item_key:
        | "agenda_approval"
        | "previous_minutes_approval"
        | "any_other_business";
      transferred_agenda_item_status: "pending" | "scheduled" | "dismissed";
      agenda_item_transfer_reason:
        | "discussion_continue"
        | "discussion_requires_decision"
        | "decision_requires_follow_up";
      decision_status:
        | "not_started"
        | "in_progress"
        | "waiting"
        | "completed"
        | "cancelled";
      task_status:
        | "not_started"
        | "in_progress"
        | "waiting"
        | "completed"
        | "cancelled";
      annual_wheel_priority: "low" | "medium" | "high" | "critical";
      annual_wheel_event_status:
        | "planned"
        | "in_progress"
        | "completed"
        | "postponed"
        | "cancelled";
      annual_wheel_deadline_anchor: "start" | "end";
      annual_wheel_recurrence:
        | "none"
        | "monthly"
        | "quarterly"
        | "semiannual"
        | "annual"
        | "custom";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type TableRow<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TableInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TableUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
