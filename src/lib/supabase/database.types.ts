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
      appeals: {
        Row: {
          author_id: string
          created_at: string
          id: string
          post_id: string
          resolved_at: string | null
          statement: string
          status: Database["public"]["Enums"]["appeal_status"]
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          post_id: string
          resolved_at?: string | null
          statement: string
          status?: Database["public"]["Enums"]["appeal_status"]
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          post_id?: string
          resolved_at?: string | null
          statement?: string
          status?: Database["public"]["Enums"]["appeal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "appeals_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appeals_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmarks: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_posts: {
        Row: {
          added_at: string
          collection_id: string
          post_id: string
        }
        Insert: {
          added_at?: string
          collection_id: string
          post_id: string
        }
        Update: {
          added_at?: string
          collection_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_posts_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string
          id: string
          is_public: boolean
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_public?: boolean
          owner_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_public?: boolean
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      credit_claims: {
        Row: {
          claimant_id: string
          created_at: string
          credit_id: string
          id: string
          note: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["claim_status"]
        }
        Insert: {
          claimant_id: string
          created_at?: string
          credit_id: string
          id?: string
          note?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
        }
        Update: {
          claimant_id?: string
          created_at?: string
          credit_id?: string
          id?: string
          note?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
        }
        Relationships: [
          {
            foreignKeyName: "credit_claims_claimant_id_fkey"
            columns: ["claimant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_claims_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credits"
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
      post_tags: {
        Row: { created_at: string; post_id: string; tag_id: string }
        Insert: { created_at?: string; post_id: string; tag_id: string }
        Update: { created_at?: string; post_id?: string; tag_id?: string }
        Relationships: [
          {
            foreignKeyName: "post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_aliases: {
        Row: { alias: string; tag_id: string }
        Insert: { alias: string; tag_id: string }
        Update: { alias?: string; tag_id?: string }
        Relationships: [
          {
            foreignKeyName: "tag_aliases_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_follows: {
        Row: {
          created_at: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_follows_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["tag_kind"]
          name: string
          parent_id: string | null
          slug: string
          status: Database["public"]["Enums"]["tag_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["tag_kind"]
          name: string
          parent_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["tag_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["tag_kind"]
          name?: string
          parent_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["tag_status"]
        }
        Relationships: [
          {
            foreignKeyName: "tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tags"
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
          ready_at: string | null
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
          ready_at?: string | null
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
          ready_at?: string | null
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
      member_follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_follows_followee_id_fkey"
            columns: ["followee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          id: number
          kind: Database["public"]["Enums"]["notification_kind"]
          post_id: string | null
          read_at: string | null
          recipient_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: never
          kind: Database["public"]["Enums"]["notification_kind"]
          post_id?: string | null
          read_at?: string | null
          recipient_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: never
          kind?: Database["public"]["Enums"]["notification_kind"]
          post_id?: string | null
          read_at?: string | null
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
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
      posts: {
        Row: {
          author_id: string
          body: string
          category: Database["public"]["Enums"]["post_category"]
          created_at: string
          has_people: boolean
          held_at: string | null
          held_reason: string | null
          id: string
          published_at: string | null
          removed_at: string | null
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
          held_at?: string | null
          held_reason?: string | null
          id?: string
          published_at?: string | null
          removed_at?: string | null
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
          held_at?: string | null
          held_reason?: string | null
          id?: string
          published_at?: string | null
          removed_at?: string | null
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
          deletion_requested_at: string | null
          display_name: string
          handle: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          bio?: string
          can_upload?: boolean
          created_at?: string
          deletion_requested_at?: string | null
          display_name: string
          handle: string
          id: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          bio?: string
          can_upload?: boolean
          created_at?: string
          deletion_requested_at?: string | null
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
          photo_position: number | null
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
          photo_position?: number | null
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
          photo_position?: number | null
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
      request_account_deletion: { Args: never; Returns: string }
      cancel_account_deletion: { Args: never; Returns: undefined }
      add_my_photos: { Args: { entries: Json; target: string }; Returns: string[] }
      finish_my_photos: { Args: { ids: string[]; target: string }; Returns: number }
      resolve_credit_claim: { Args: { accept: boolean; target: string }; Returns: undefined }
      arrange_my_photos: { Args: { keep: string[]; target: string }; Returns: undefined }
      moderate_post: { Args: { decision: string; note: string; target: string }; Returns: undefined }
      approve_tag: { Args: { target: string }; Returns: undefined }
      create_official_tag: {
        Args: {
          aliases?: string[]
          parent?: string
          tag_kind: Database["public"]["Enums"]["tag_kind"]
          tag_name: string
          tag_slug: string
        }
        Returns: string
      }
      trending_works: {
        Args: { days?: number; max_rows?: number }
        Returns: { id: string; name: string; recent_count: number; slug: string; total_count: number }[]
      }
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
      photo_watermark_seeds: {
        Args: { target_post: string }
        Returns: { photo_id: string; position: number; seed: string }[]
      }
      set_photo_watermarks: { Args: { entries: Json; target_post: string }; Returns: undefined }
      my_year_review: { Args: { target_year: number }; Returns: Json }
      on_this_day: {
        Args: { max_rows?: number; span?: number; target: string }
        Returns: {
          post_id: string
          years_ago: number
        }[]
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
      appeal_status: "open" | "accepted" | "rejected"
      claim_status: "open" | "approved" | "rejected"
      credit_role:
        | "cosplayer"
        | "model"
        | "photographer"
        | "retoucher"
        | "other"
      credit_status: "pending" | "approved" | "rejected" | "external"
      member_role: "member" | "admin"
      notification_kind:
        | "credit_requested"
        | "credit_approved"
        | "credit_rejected"
        | "post_held"
        | "post_released"
        | "post_hidden"
        | "report_reviewed"
        | "post_restored"
        | "appeal_rejected"
        | "credit_claimed"
        | "credit_claim_approved"
        | "credit_claim_rejected"
      post_category: "cosplay" | "model" | "landscape" | "other"
      post_status: "draft" | "published" | "hidden"
      report_reason:
        | "portrait_rights"
        | "copyright"
        | "minor_safety"
        | "sexual"
        | "spam"
        | "other"
        | "voyeurism"
        | "deepfake"
      report_status: "open" | "actioned" | "dismissed"
      tag_kind: "work" | "character" | "event" | "place" | "general"
      tag_status: "official" | "pending"
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
      appeal_status: ["open", "accepted", "rejected"],
      claim_status: ["open", "approved", "rejected"],
      credit_role: ["cosplayer", "model", "photographer", "retoucher", "other"],
      credit_status: ["pending", "approved", "rejected", "external"],
      member_role: ["member", "admin"],
      notification_kind: [
        "credit_requested",
        "credit_approved",
        "credit_rejected",
        "post_held",
        "post_released",
        "post_hidden",
        "report_reviewed",
        "post_restored",
        "appeal_rejected",
        "credit_claimed",
        "credit_claim_approved",
        "credit_claim_rejected",
      ],
      post_category: ["cosplay", "model", "landscape", "other"],
      post_status: ["draft", "published", "hidden"],
      report_reason: [
        "portrait_rights",
        "copyright",
        "minor_safety",
        "sexual",
        "spam",
        "other",
        "voyeurism",
        "deepfake",
      ],
      report_status: ["open", "actioned", "dismissed"],
      tag_kind: ["work", "character", "event", "place", "general"],
      tag_status: ["official", "pending"],
    },
  },
} as const
