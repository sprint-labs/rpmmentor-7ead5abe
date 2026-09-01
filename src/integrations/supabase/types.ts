export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      announcement_reads: {
        Row: {
          announcement_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          active: boolean
          attachment_mime: string | null
          attachment_name: string | null
          attachment_path: string | null
          attachment_size: number | null
          body: string
          created_at: string
          created_by: string
          ends_at: string | null
          id: string
          kind: string
          starts_at: string
          title: string
        }
        Insert: {
          active?: boolean
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          body?: string
          created_at?: string
          created_by: string
          ends_at?: string | null
          id?: string
          kind: string
          starts_at?: string
          title: string
        }
        Update: {
          active?: boolean
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          body?: string
          created_at?: string
          created_by?: string
          ends_at?: string | null
          id?: string
          kind?: string
          starts_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_audit: {
        Row: {
          action: string
          after_values: Json | null
          before_values: Json | null
          calendar_event_id: string
          changed_at: string
          changed_by: string | null
          id: string
        }
        Insert: {
          action: string
          after_values?: Json | null
          before_values?: Json | null
          calendar_event_id: string
          changed_at?: string
          changed_by?: string | null
          id?: string
        }
        Update: {
          action?: string
          after_values?: Json | null
          before_values?: Json | null
          calendar_event_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_audit_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          assigned_mentor_id: string | null
          assigned_mentor_name: string
          cancellation_reason: string
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          created_by_name: string
          end_time: string | null
          event_date: string
          event_type: string
          follow_up_waived_at: string | null
          follow_up_waived_by: string | null
          follow_up_waiver_reason: string
          goalkeeper_name: string | null
          id: string
          location: string | null
          notes: string
          player_id: string | null
          start_time: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_mentor_id?: string | null
          assigned_mentor_name?: string
          cancellation_reason?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by: string
          created_by_name?: string
          end_time?: string | null
          event_date: string
          event_type?: string
          follow_up_waived_at?: string | null
          follow_up_waived_by?: string | null
          follow_up_waiver_reason?: string
          goalkeeper_name?: string | null
          id?: string
          location?: string | null
          notes?: string
          player_id?: string | null
          start_time?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_mentor_id?: string | null
          assigned_mentor_name?: string
          cancellation_reason?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string
          end_time?: string | null
          event_date?: string
          event_type?: string
          follow_up_waived_at?: string | null
          follow_up_waived_by?: string | null
          follow_up_waiver_reason?: string
          goalkeeper_name?: string | null
          id?: string
          location?: string | null
          notes?: string
          player_id?: string | null
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_assigned_mentor_id_fkey"
            columns: ["assigned_mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_follow_up_waived_by_fkey"
            columns: ["follow_up_waived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_click_events: {
        Row: {
          created_at: string
          destination: string
          effective_role: string | null
          id: string
          mentor_name: string | null
          mentor_profile_id: string | null
          metadata: Json
          period_days: number | null
          period_from: string | null
          period_to: string | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          destination: string
          effective_role?: string | null
          id?: string
          mentor_name?: string | null
          mentor_profile_id?: string | null
          metadata?: Json
          period_days?: number | null
          period_from?: string | null
          period_to?: string | null
          source: string
          user_id: string
        }
        Update: {
          created_at?: string
          destination?: string
          effective_role?: string | null
          id?: string
          mentor_name?: string | null
          mentor_profile_id?: string | null
          metadata?: Json
          period_days?: number | null
          period_from?: string | null
          period_to?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      install_prompt_events: {
        Row: {
          browser: string | null
          created_at: string
          declines: number
          event: string
          failures: number
          id: string
          metadata: Json
          platform: string | null
          surface: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string
          declines?: number
          event: string
          failures?: number
          id?: string
          metadata?: Json
          platform?: string | null
          surface: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string
          declines?: number
          event?: string
          failures?: number
          id?: string
          metadata?: Json
          platform?: string | null
          surface?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      interaction_audit: {
        Row: {
          action: string
          after_values: Json | null
          before_values: Json | null
          changed_at: string
          changed_by: string | null
          id: string
          interaction_id: string
        }
        Insert: {
          action: string
          after_values?: Json | null
          before_values?: Json | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          interaction_id: string
        }
        Update: {
          action?: string
          after_values?: Json | null
          before_values?: Json | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          interaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interaction_audit_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      interaction_media: {
        Row: {
          attached_by: string | null
          created_at: string
          id: string
          interaction_id: string
          media_id: string
        }
        Insert: {
          attached_by?: string | null
          created_at?: string
          id?: string
          interaction_id: string
          media_id: string
        }
        Update: {
          attached_by?: string | null
          created_at?: string
          id?: string
          interaction_id?: string
          media_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interaction_media_attached_by_fkey"
            columns: ["attached_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_media_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_media_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      interaction_types: {
        Row: {
          active: boolean
          counts_as_live: boolean
          created_at: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          counts_as_live?: boolean
          created_at?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          counts_as_live?: boolean
          created_at?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      interactions: {
        Row: {
          calendar_event_id: string | null
          club: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          follow_up: string
          gk_slug: string
          goalkeeper_name: string
          id: string
          interaction_type: string
          match_report_id: string | null
          mentor_id: string
          mentor_name: string
          notes: string
          occurred_at: string
          outcome: string
          player_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          calendar_event_id?: string | null
          club?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          follow_up?: string
          gk_slug?: string
          goalkeeper_name: string
          id?: string
          interaction_type: string
          match_report_id?: string | null
          mentor_id: string
          mentor_name?: string
          notes?: string
          occurred_at: string
          outcome?: string
          player_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          calendar_event_id?: string | null
          club?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          follow_up?: string
          gk_slug?: string
          goalkeeper_name?: string
          id?: string
          interaction_type?: string
          match_report_id?: string | null
          mentor_id?: string
          mentor_name?: string
          notes?: string
          occurred_at?: string
          outcome?: string
          player_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interactions_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_report_cutover_state: {
        Row: {
          created_at: string
          expected_sheet_count: number | null
          id: string
          reconciled_at: string | null
          reconciled_by: string | null
          reconciled_by_label: string | null
          reconciliation: Json
          run_id: string | null
          sheet_digest: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_sheet_count?: number | null
          id: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciled_by_label?: string | null
          reconciliation?: Json
          run_id?: string | null
          sheet_digest?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_sheet_count?: number | null
          id?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciled_by_label?: string | null
          reconciliation?: Json
          run_id?: string | null
          sheet_digest?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      match_report_submissions: {
        Row: {
          confirmed_duplicate: boolean
          created_at: string
          fingerprint: string
          goalkeeper: string
          id: string
          match_date: string | null
          opponent: string
          report_id: string | null
          report_uid: string | null
          reserved_at: string
          sheet_row_index: number | null
          status: string
          submission_key: string
          submitted_at: string
          team: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confirmed_duplicate?: boolean
          created_at?: string
          fingerprint: string
          goalkeeper: string
          id?: string
          match_date?: string | null
          opponent?: string
          report_id?: string | null
          report_uid?: string | null
          reserved_at?: string
          sheet_row_index?: number | null
          status?: string
          submission_key: string
          submitted_at?: string
          team?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confirmed_duplicate?: boolean
          created_at?: string
          fingerprint?: string
          goalkeeper?: string
          id?: string
          match_date?: string | null
          opponent?: string
          report_id?: string | null
          report_uid?: string | null
          reserved_at?: string
          sheet_row_index?: number | null
          status?: string
          submission_key?: string
          submitted_at?: string
          team?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      match_reports_cache: {
        Row: {
          average: number | null
          calendar_event_id: string | null
          change_play: number | null
          coach: string
          comments: string | null
          competition: string | null
          control_play: number | null
          created_at: string
          deleted_at: string | null
          goalkeeper: string
          id: string
          legacy_report_id: string | null
          match_date: string | null
          opponent: string | null
          physical: number | null
          protect_air: number | null
          protect_goal: number | null
          protect_space: number | null
          psych: number | null
          report_id: string
          row_index: number | null
          source: string | null
          submission_key: string | null
          submitted_at: string | null
          submitted_by: string | null
          synced_at: string
          team: string | null
          updated_at: string
        }
        Insert: {
          average?: number | null
          calendar_event_id?: string | null
          change_play?: number | null
          coach: string
          comments?: string | null
          competition?: string | null
          control_play?: number | null
          created_at?: string
          deleted_at?: string | null
          goalkeeper: string
          id?: string
          legacy_report_id?: string | null
          match_date?: string | null
          opponent?: string | null
          physical?: number | null
          protect_air?: number | null
          protect_goal?: number | null
          protect_space?: number | null
          psych?: number | null
          report_id: string
          row_index?: number | null
          source?: string | null
          submission_key?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          synced_at?: string
          team?: string | null
          updated_at?: string
        }
        Update: {
          average?: number | null
          calendar_event_id?: string | null
          change_play?: number | null
          coach?: string
          comments?: string | null
          competition?: string | null
          control_play?: number | null
          created_at?: string
          deleted_at?: string | null
          goalkeeper?: string
          id?: string
          legacy_report_id?: string | null
          match_date?: string | null
          opponent?: string | null
          physical?: number | null
          protect_air?: number | null
          protect_goal?: number | null
          protect_space?: number | null
          psych?: number | null
          report_id?: string
          row_index?: number | null
          source?: string | null
          submission_key?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          synced_at?: string
          team?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_reports_cache_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          created_at: string
          file_path: string
          file_size: number | null
          gk_id: string | null
          id: string
          media_type: string
          mime_type: string | null
          notes: string | null
          rating_tags: string[]
          thumbnail_path: string | null
          title: string
          updated_at: string
          uploaded_by_id: string | null
          uploaded_by_name: string | null
          uploaded_by_role: string | null
        }
        Insert: {
          created_at?: string
          file_path: string
          file_size?: number | null
          gk_id?: string | null
          id?: string
          media_type: string
          mime_type?: string | null
          notes?: string | null
          rating_tags?: string[]
          thumbnail_path?: string | null
          title: string
          updated_at?: string
          uploaded_by_id?: string | null
          uploaded_by_name?: string | null
          uploaded_by_role?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string
          file_size?: number | null
          gk_id?: string | null
          id?: string
          media_type?: string
          mime_type?: string | null
          notes?: string | null
          rating_tags?: string[]
          thumbnail_path?: string | null
          title?: string
          updated_at?: string
          uploaded_by_id?: string | null
          uploaded_by_name?: string | null
          uploaded_by_role?: string | null
        }
        Relationships: []
      }
      media_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          created_at: string
          gk_id: string | null
          id: string
          media_id: string | null
          media_title: string | null
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          gk_id?: string | null
          id?: string
          media_id?: string | null
          media_title?: string | null
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          gk_id?: string | null
          id?: string
          media_id?: string | null
          media_title?: string | null
          metadata?: Json
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          calendar_event_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          link_path: string
          read_at: string | null
          recipient_id: string
          title: string
        }
        Insert: {
          body?: string
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          link_path?: string
          read_at?: string | null
          recipient_id: string
          title: string
        }
        Update: {
          body?: string
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          link_path?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      password_change_audit: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          user_agent: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          contract_until: string | null
          created_at: string
          current_club: string
          deleted_at: string | null
          deleted_by: string | null
          full_name: string
          id: string
          instagram_url: string | null
          league: string
          nationality: string
          on_loan: boolean
          parent_club: string | null
          tier: string | null
          tier_effective_from: string | null
          updated_at: string
        }
        Insert: {
          contract_until?: string | null
          created_at?: string
          current_club?: string
          deleted_at?: string | null
          deleted_by?: string | null
          full_name: string
          id?: string
          instagram_url?: string | null
          league?: string
          nationality?: string
          on_loan?: boolean
          parent_club?: string | null
          tier?: string | null
          tier_effective_from?: string | null
          updated_at?: string
        }
        Update: {
          contract_until?: string | null
          created_at?: string
          current_club?: string
          deleted_at?: string | null
          deleted_by?: string | null
          full_name?: string
          id?: string
          instagram_url?: string | null
          league?: string
          nationality?: string
          on_loan?: boolean
          parent_club?: string | null
          tier?: string | null
          tier_effective_from?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          initials: string
          mentor_id: string | null
          name: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          initials?: string
          mentor_id?: string | null
          name?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          initials?: string
          mentor_id?: string | null
          name?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      purged_demo_records: {
        Row: {
          created_at: string
          fingerprint: string
          id: string
          reason: string
          table_name: string
        }
        Insert: {
          created_at?: string
          fingerprint: string
          id?: string
          reason?: string
          table_name: string
        }
        Update: {
          created_at?: string
          fingerprint?: string
          id?: string
          reason?: string
          table_name?: string
        }
        Relationships: []
      }
      report_attachments: {
        Row: {
          attached_by_id: string | null
          attached_by_name: string | null
          created_at: string
          id: string
          media_id: string
          report_id: string
        }
        Insert: {
          attached_by_id?: string | null
          attached_by_name?: string | null
          created_at?: string
          id?: string
          media_id: string
          report_id: string
        }
        Update: {
          attached_by_id?: string | null
          attached_by_name?: string | null
          created_at?: string
          id?: string
          media_id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_attachments_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          thread_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          thread_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          author_id: string
          created_at: string
          id: string
          kind: string
          last_message_at: string
          page_path: string
          severity: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          kind: string
          last_message_at?: string
          page_path?: string
          severity?: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          kind?: string
          last_message_at?: string
          page_path?: string
          severity?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_threads_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_deletion_audit: {
        Row: {
          actor_email: string
          actor_id: string | null
          actor_name: string
          affected_sections: Json
          created_at: string
          deleted_email: string
          deleted_name: string
          deleted_role: string | null
          deleted_user_id: string
          id: string
          metadata: Json
        }
        Insert: {
          actor_email?: string
          actor_id?: string | null
          actor_name?: string
          affected_sections?: Json
          created_at?: string
          deleted_email?: string
          deleted_name?: string
          deleted_role?: string | null
          deleted_user_id: string
          id?: string
          metadata?: Json
        }
        Update: {
          actor_email?: string
          actor_id?: string | null
          actor_name?: string
          affected_sections?: Json
          created_at?: string
          deleted_email?: string
          deleted_name?: string
          deleted_role?: string | null
          deleted_user_id?: string
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      player_duty_of_care: {
        Row: {
          checkpoints_due: number | null
          current_club: string | null
          days_until_due: number | null
          full_name: string | null
          interval_days: number | null
          is_off_season: boolean | null
          last_interaction_at: string | null
          next_checkpoint_no: number | null
          next_due_at: string | null
          period_target: number | null
          player_id: string | null
          rag_status: string | null
          season_count: number | null
          season_end: string | null
          season_outcome: string | null
          season_start: string | null
          state: string | null
          status_label: string | null
          tier: string | null
          tier_effective_from: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      announcement_media_storage_ready_v2: { Args: never; Returns: boolean }
      duty_of_care_at: {
        Args: { as_of: string }
        Returns: {
          checkpoints_due: number
          current_club: string
          days_until_due: number
          full_name: string
          interval_days: number
          is_off_season: boolean
          last_interaction_at: string
          next_checkpoint_no: number
          next_due_at: string
          period_target: number
          player_id: string
          rag_status: string
          season_count: number
          season_end: string
          season_outcome: string
          season_start: string
          state: string
          status_label: string
          tier: string
          tier_effective_from: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      interaction_demo_fingerprint: {
        Args: { _goalkeeper_name: string; _notes: string; _occurred_at: string }
        Returns: string
      }
      list_mentor_directory: {
        Args: never
        Returns: {
          id: string
          is_manager: boolean
          name: string
        }[]
      }
      rpm_recency_status: {
        Args: {
          p_amber_lead: number
          p_as_of: string
          p_interval_days: number
          p_last_at: string
        }
        Returns: string
      }
      rpm_season_checkpoints: {
        Args: { as_of: string; target?: number }
        Returns: {
          checkpoint_no: number
          due_on: string
        }[]
      }
      rpm_season_end: { Args: { d: string }; Returns: string }
      rpm_season_start: { Args: { d: string }; Returns: string }
      rpm_tier3_status: {
        Args: {
          p_amber_lead?: number
          p_as_of: string
          p_binding_due: number
          p_binding_total: number
          p_is_off_season: boolean
          p_next_due_at: string
          p_season_count: number
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "mentor_manager" | "mentor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "mentor_manager", "mentor"],
    },
  },
} as const
