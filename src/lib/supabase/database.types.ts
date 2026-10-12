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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      consent_records: {
        Row: {
          consented_on: string
          created_at: string
          created_by: string
          evidence_key: string | null
          guardian_consent: boolean
          has_minor: boolean
          id: string
          note: string
          post_id: string
          subject_label: string
        }
        Insert: {
          consented_on: string
          created_at?: string
          created_by: string
          evidence_key?: string | null
          guardian_consent?: boolean
          has_minor?: boolean
          id?: string
          note?: string
          post_id: string
          subject_label: string
        }
        Update: {
          consented_on?: string
          created_at?: string
          created_by?: string
          evidence_key?: string | null
          guardian_consent?: boolean
          has_minor?: boolean
          id?: string
          note?: string
          post_id?: string
          subject_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      credits: {
        Row: {
          created_at: string
          external_label: string | null
          external_url: string | null
          id: string
          member_id: string | null
          post_id: string
          role: Database["public"]["Enums"]["credit_role"]
          status: Database["public"]["Enums"]["credit_status"]
        }
        Insert: {
          created_at?: string
          external_label?: string | null
          external_url?: string | null
          id?: string
          member_id?: string | null
          post_id: string
          role: Database["public"]["Enums"]["credit_role"]
          status: Database["public"]["Enums"]["credit_status"]
        }
        Update: {
          created_at?: string
          external_label?: string | null
          external_url?: string | null
          id?: string
          member_id?: string | null
          post_id?: string
          role?: Database["public"]["Enums"]["credit_role"]
          status?: Database["public"]["Enums"]["credit_status"]
        }
        Relationships: [
          {
            foreignKeyName: "credits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          alt_text: string
          bytes: number
          created_at: string
          height: number
          id: string
          is_panorama: boolean | null
          position: number
          post_id: string
          storage_key: string
          taken_at: string | null
          width: number
        }
        Insert: {
          alt_text?: string
          bytes: number
          created_at?: string
          height: number
          id?: string
          is_panorama?: boolean | null
          position: number
          post_id: string
          storage_key?: string
          taken_at?: string | null
          width: number
        }
        Update: {
          alt_text?: string
          bytes?: number
          created_at?: string
          height?: number
          id?: string
          is_panorama?: boolean | null
          position?: number
          post_id?: string
          storage_key?: string
          taken_at?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "photos_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body: string
          category: Database["public"]["Enums"]["post_category"]
          created_at: string
          has_people: boolean
          id: string
          published_at: string | null
          sensitive: boolean
          shot_on: string | null
          shot_year: number
          status: Database["public"]["Enums"]["post_status"]
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body?: string
          category: Database["public"]["Enums"]["post_category"]
          created_at?: string
          has_people?: boolean
          id?: string
          published_at?: string | null
          sensitive?: boolean
          shot_on?: string | null
          shot_year: number
          status?: Database["public"]["Enums"]["post_status"]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          category?: Database["public"]["Enums"]["post_category"]
          created_at?: string
          has_people?: boolean
          id?: string
          published_at?: string | null
          sensitive?: boolean
          shot_on?: string | null
          shot_year?: number
          status?: Database["public"]["Enums"]["post_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bio: string
          can_upload: boolean
          created_at: string
          display_name: string
          handle: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          bio?: string
          can_upload?: boolean
          created_at?: string
          display_name: string
          handle: string
          id: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          bio?: string
          can_upload?: boolean
          created_at?: string
          display_name?: string
          handle?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          detail: string
          id: string
          post_id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          created_at?: string
          detail?: string
          id?: string
          post_id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          created_at?: string
          detail?: string
          id?: string
          post_id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_my_profile: {
        Args: {
          birth_date: string
          new_display_name: string
          new_handle: string
          policy_version: string
        }
        Returns: undefined
      }
      handle_status: { Args: { target: string }; Returns: string }
      publish_my_post: {
        Args: {
          consent_note?: string
          consented_on?: string
          guardian_consent?: boolean
          has_minor?: boolean
          subject_label?: string
          target: string
        }
        Returns: undefined
      }
      published_shot_years: {
        Args: never
        Returns: {
          post_count: number
          year: number
        }[]
      }
    }
    Enums: {
      credit_role:
        | "cosplayer"
        | "model"
        | "photographer"
        | "retoucher"
        | "other"
      credit_status: "pending" | "approved" | "rejected" | "external"
      member_role: "member" | "admin"
      post_category: "cosplay" | "model" | "landscape" | "other"
      post_status: "draft" | "published" | "hidden"
      report_reason:
        | "portrait_rights"
        | "copyright"
        | "minor_safety"
        | "sexual"
        | "spam"
        | "other"
      report_status: "open" | "actioned" | "dismissed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      credit_role: ["cosplayer", "model", "photographer", "retoucher", "other"],
      credit_status: ["pending", "approved", "rejected", "external"],
      member_role: ["member", "admin"],
      post_category: ["cosplay", "model", "landscape", "other"],
      post_status: ["draft", "published", "hidden"],
      report_reason: [
        "portrait_rights",
        "copyright",
        "minor_safety",
        "sexual",
        "spam",
        "other",
      ],
      report_status: ["open", "actioned", "dismissed"],
    },
  },
} as const
