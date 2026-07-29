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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
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
          change_play: number | null
          coach: string
          comments: string | null
          competition: string | null
          control_play: number | null
          created_at: string
          goalkeeper: string
          id: string
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
          synced_at: string
          team: string | null
          updated_at: string
        }
        Insert: {
          average?: number | null
          change_play?: number | null
          coach: string
          comments?: string | null
          competition?: string | null
          control_play?: number | null
          created_at?: string
          goalkeeper: string
          id?: string
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
          synced_at?: string
          team?: string | null
          updated_at?: string
        }
        Update: {
          average?: number | null
          change_play?: number | null
          coach?: string
          comments?: string | null
          competition?: string | null
          control_play?: number | null
          created_at?: string
          goalkeeper?: string
          id?: string
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
          synced_at?: string
          team?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          created_at: string
          file_path: string
          file_size: number | null
          gk_id: string
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
          gk_id: string
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
          gk_id?: string
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
          full_name: string
          id: string
          instagram_url: string | null
          league: string
          nationality: string
          on_loan: boolean
          parent_club: string | null
          updated_at: string
        }
        Insert: {
          contract_until?: string | null
          created_at?: string
          current_club?: string
          full_name: string
          id?: string
          instagram_url?: string | null
          league?: string
          nationality?: string
          on_loan?: boolean
          parent_club?: string | null
          updated_at?: string
        }
        Update: {
          contract_until?: string | null
          created_at?: string
          current_club?: string
          full_name?: string
          id?: string
          instagram_url?: string | null
          league?: string
          nationality?: string
          on_loan?: boolean
          parent_club?: string | null
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
