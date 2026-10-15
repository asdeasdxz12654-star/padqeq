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
      appeal_evidence: {
        Row: {
          appeal_id: string
          bytes: number
          content_type: string
          created_at: string
          id: string
          storage_key: string
          uploaded_at: string | null
        }
        Insert: {
          appeal_id: string
          bytes: number
          content_type: string
          created_at?: string
          id?: string
          storage_key: string
          uploaded_at?: string | null
        }
        Update: {
          appeal_id?: string
          bytes?: number
          content_type?: string
          created_at?: string
          id?: string
          storage_key?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appeal_evidence_appeal_id_fkey"
            columns: ["appeal_id"]
            isOneToOne: false
            referencedRelation: "appeals"
            referencedColumns: ["id"]
          },
        ]
      }
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
      banned_words: {
        Row: {
          created_at: string
          created_by: string | null
          word: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          word: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "banned_words_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      board_posts: {
        Row: {
          author_id: string
          board: Database["public"]["Enums"]["board_kind"]
          body: string
          casting_kind: Database["public"]["Enums"]["casting_kind"] | null
          casting_terms: Database["public"]["Enums"]["casting_terms"] | null
          closed_at: string | null
          created_at: string
          edited_at: string | null
          hidden_at: string | null
          id: string
          region: string | null
          shoot_on: string | null
          title: string
        }
        Insert: {
          author_id: string
          board: Database["public"]["Enums"]["board_kind"]
          body: string
          casting_kind?: Database["public"]["Enums"]["casting_kind"] | null
          casting_terms?: Database["public"]["Enums"]["casting_terms"] | null
          closed_at?: string | null
          created_at?: string
          edited_at?: string | null
          hidden_at?: string | null
          id?: string
          region?: string | null
          shoot_on?: string | null
          title: string
        }
        Update: {
          author_id?: string
          board?: Database["public"]["Enums"]["board_kind"]
          body?: string
          casting_kind?: Database["public"]["Enums"]["casting_kind"] | null
          casting_terms?: Database["public"]["Enums"]["casting_terms"] | null
          closed_at?: string | null
          created_at?: string
          edited_at?: string | null
          hidden_at?: string | null
          id?: string
          region?: string | null
          shoot_on?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      board_replies: {
        Row: {
          author_id: string
          board_post_id: string
          body: string
          created_at: string
          edited_at: string | null
          hidden_at: string | null
          id: string
        }
        Insert: {
          author_id: string
          board_post_id: string
          body: string
          created_at?: string
          edited_at?: string | null
          hidden_at?: string | null
          id?: string
        }
        Update: {
          author_id?: string
          board_post_id?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          hidden_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_replies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_replies_board_post_id_fkey"
            columns: ["board_post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      board_reports: {
        Row: {
          board_post_id: string
          created_at: string
          detail: string
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reply_id: string | null
          reporter_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          board_post_id: string
          created_at?: string
          detail?: string
          id?: string
          reason: Database["public"]["Enums"]["report_reason"]
          reply_id?: string | null
          reporter_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          board_post_id?: string
          created_at?: string
          detail?: string
          id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reply_id?: string | null
          reporter_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "board_reports_board_post_id_fkey"
            columns: ["board_post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_reports_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "board_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reports: {
        Row: {
          comment_id: string
          created_at: string
          detail: string
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          comment_id: string
          created_at?: string
          detail?: string
          id?: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          comment_id?: string
          created_at?: string
          detail?: string
          id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          edited_at: string | null
          hidden_at: string | null
          id: string
          parent_id: string | null
          pinned: boolean
          post_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          edited_at?: string | null
          hidden_at?: string | null
          id?: string
          parent_id?: string | null
          pinned?: boolean
          post_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          hidden_at?: string | null
          id?: string
          parent_id?: string | null
          pinned?: boolean
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_profiles: {
        Row: {
          active_since: number | null
          casting_open: boolean
          listed: boolean
          region: string | null
          roles: Database["public"]["Enums"]["credit_role"][]
          updated_at: string
          user_id: string
          works: string
        }
        Insert: {
          active_since?: number | null
          casting_open?: boolean
          listed?: boolean
          region?: string | null
          roles: Database["public"]["Enums"]["credit_role"][]
          updated_at?: string
          user_id: string
          works?: string
        }
        Update: {
          active_since?: number | null
          casting_open?: boolean
          listed?: boolean
          region?: string | null
          roles?: Database["public"]["Enums"]["credit_role"][]
          updated_at?: string
          user_id?: string
          works?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
      site_switches: {
        Row: {
          id: boolean
          message: string
          read_only: boolean
          signup_closed: boolean
          updated_at: string
          updated_by: string | null
          upload_stage: Database["public"]["Enums"]["upload_stage"]
          uploads_closed: boolean
        }
        Insert: {
          id?: boolean
          message?: string
          read_only?: boolean
          signup_closed?: boolean
          updated_at?: string
          updated_by?: string | null
          upload_stage?: Database["public"]["Enums"]["upload_stage"]
          uploads_closed?: boolean
        }
        Update: {
          id?: boolean
          message?: string
          read_only?: boolean
          signup_closed?: boolean
          updated_at?: string
          updated_by?: string | null
          upload_stage?: Database["public"]["Enums"]["upload_stage"]
          uploads_closed?: boolean
        }
        Relationships: []
      }
      thread_members: {
        Row: {
          created_at: string
          guide_dismissed_at: string | null
          last_read_at: string | null
          status: Database["public"]["Enums"]["thread_member_status"]
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          guide_dismissed_at?: string | null
          last_read_at?: string | null
          status: Database["public"]["Enums"]["thread_member_status"]
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          guide_dismissed_at?: string | null
          last_read_at?: string | null
          status?: Database["public"]["Enums"]["thread_member_status"]
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_members_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          exif: Json | null
          alt_text: string
          bytes: number
          created_at: string
          height: number
          id: string
          is_panorama: boolean | null
          phash: number | null
          position: number
          ready_at: string | null
          post_id: string
          storage_key: string
          taken_at: string | null
          width: number
        }
        Insert: {
          exif?: Json | null
          alt_text?: string
          bytes: number
          created_at?: string
          height: number
          id?: string
          is_panorama?: boolean | null
          phash?: number | null
          position: number
          ready_at?: string | null
          post_id: string
          storage_key?: string
          taken_at?: string | null
          width: number
        }
        Update: {
          exif?: Json | null
          alt_text?: string
          bytes?: number
          created_at?: string
          height?: number
          id?: string
          is_panorama?: boolean | null
          phash?: number | null
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
      event_attendees: {
        Row: {
          cos_note: string
          created_at: string
          event_id: string
          is_public: boolean
          reminded_at: string | null
          user_id: string
        }
        Insert: {
          cos_note?: string
          created_at?: string
          event_id: string
          is_public?: boolean
          reminded_at?: string | null
          user_id: string
        }
        Update: {
          cos_note?: string
          created_at?: string
          event_id?: string
          is_public?: boolean
          reminded_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_picks: {
        Row: {
          created_at: string
          created_by: string | null
          pick_date: string
          position: number
          post_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          pick_date: string
          position?: number
          post_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          pick_date?: string
          position?: number
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_picks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          description: string
          ends_on: string
          id: string
          name: string
          proposed_by: string | null
          region: string
          review_note: string | null
          starts_on: string
          status: Database["public"]["Enums"]["event_status"]
          tag_id: string | null
          updated_at: string
          url: string | null
          venue: string
        }
        Insert: {
          created_at?: string
          description?: string
          ends_on: string
          id?: string
          name: string
          proposed_by?: string | null
          region: string
          review_note?: string | null
          starts_on: string
          status?: Database["public"]["Enums"]["event_status"]
          tag_id?: string | null
          updated_at?: string
          url?: string | null
          venue: string
        }
        Update: {
          created_at?: string
          description?: string
          ends_on?: string
          id?: string
          name?: string
          proposed_by?: string | null
          region?: string
          review_note?: string | null
          starts_on?: string
          status?: Database["public"]["Enums"]["event_status"]
          tag_id?: string | null
          updated_at?: string
          url?: string | null
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: true
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          author_id: string
          body: string
          category: Database["public"]["Enums"]["inquiry_category"]
          created_at: string
          error_ref: string | null
          id: string
          status: Database["public"]["Enums"]["inquiry_status"]
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          author_id: string
          body: string
          category: Database["public"]["Enums"]["inquiry_category"]
          created_at?: string
          error_ref?: string | null
          id?: string
          status?: Database["public"]["Enums"]["inquiry_status"]
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          author_id?: string
          body?: string
          category?: Database["public"]["Enums"]["inquiry_category"]
          created_at?: string
          error_ref?: string | null
          id?: string
          status?: Database["public"]["Enums"]["inquiry_status"]
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          max_uses: number
          note: string
          revoked_at: string | null
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          max_uses: number
          note?: string
          revoked_at?: string | null
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          max_uses?: number
          note?: string
          revoked_at?: string | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_redemptions: {
        Row: {
          code: string
          created_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_redemptions_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "invite_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "invite_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      site_limits: {
        Row: { key: string; max_value: number; min_value: number; updated_at: string; updated_by: string | null; value: number }
        Insert: { key: string; max_value: number; min_value: number; updated_at?: string; updated_by?: string | null; value: number }
        Update: { key?: string; max_value?: number; min_value?: number; updated_at?: string; updated_by?: string | null; value?: number }
        Relationships: []
      }
      member_warnings: {
        Row: { created_at: string; created_by: string | null; id: number; member_id: string; reason: string }
        Insert: { created_at?: string; created_by?: string | null; id?: never; member_id: string; reason: string }
        Update: { created_at?: string; created_by?: string | null; id?: never; member_id?: string; reason?: string }
        Relationships: [
          {
            foreignKeyName: "member_warnings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_restrictions: {
        Row: {
          created_at: string
          created_by: string | null
          member_id: string
          reason: string
          suspended_until: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          member_id: string
          reason: string
          suspended_until: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          member_id?: string
          reason?: string
          suspended_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_restrictions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_restrictions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notices: {
        Row: {
          body: string
          category: Database["public"]["Enums"]["notice_category"]
          created_by: string | null
          id: string
          maintenance_at: string | null
          pinned: boolean
          published_at: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category: Database["public"]["Enums"]["notice_category"]
          created_by?: string | null
          id?: string
          maintenance_at?: string | null
          pinned?: boolean
          published_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: Database["public"]["Enums"]["notice_category"]
          created_by?: string | null
          id?: string
          maintenance_at?: string | null
          pinned?: boolean
          published_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_reports: {
        Row: {
          created_at: string
          detail: string
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reported_id: string | null
          reporter_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
          thread_id: string
        }
        Insert: {
          created_at?: string
          detail?: string
          id?: string
          reason: Database["public"]["Enums"]["report_reason"]
          reported_id?: string | null
          reporter_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          thread_id: string
        }
        Update: {
          created_at?: string
          detail?: string
          id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reported_id?: string | null
          reporter_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      message_settings: {
        Row: {
          receive: Database["public"]["Enums"]["message_receive"]
          updated_at: string
          user_id: string
        }
        Insert: {
          receive?: Database["public"]["Enums"]["message_receive"]
          updated_at?: string
          user_id: string
        }
        Update: {
          receive?: Database["public"]["Enums"]["message_receive"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          board_post_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["thread_kind"]
          last_message_at: string
        }
        Insert: {
          board_post_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["thread_kind"]
          last_message_at?: string
        }
        Update: {
          board_post_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["thread_kind"]
          last_message_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_board_post_id_fkey"
            columns: ["board_post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          form: Json | null
          id: number
          sender_id: string | null
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          form?: Json | null
          id?: number
          sender_id?: string | null
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          form?: Json | null
          id?: number
          sender_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          board_post_id: string | null
          created_at: string
          event_id: string | null
          id: number
          kind: Database["public"]["Enums"]["notification_kind"]
          post_id: string | null
          read_at: string | null
          recipient_id: string
          thread_id: string | null
        }
        Insert: {
          actor_id?: string | null
          board_post_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: never
          kind: Database["public"]["Enums"]["notification_kind"]
          post_id?: string | null
          read_at?: string | null
          recipient_id: string
          thread_id?: string | null
        }
        Update: {
          actor_id?: string | null
          board_post_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: never
          kind?: Database["public"]["Enums"]["notification_kind"]
          post_id?: string | null
          read_at?: string | null
          recipient_id?: string
          thread_id?: string | null
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
            foreignKeyName: "notifications_board_post_id_fkey"
            columns: ["board_post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
            foreignKeyName: "notifications_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
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
      post_likes: {
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
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          quarantined_at: string | null
          trashed_at: string | null
          trash_prev_status: Database["public"]["Enums"]["post_status"] | null
          trash_prev_removed_at: string | null
          show_exif: boolean
          visibility: Database["public"]["Enums"]["post_visibility"]
          scheduled_at: string | null
          comment_policy: Database["public"]["Enums"]["comment_policy"]
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
          quarantined_at?: string | null
          trashed_at?: string | null
          trash_prev_status?: Database["public"]["Enums"]["post_status"] | null
          trash_prev_removed_at?: string | null
          show_exif?: boolean
          visibility?: Database["public"]["Enums"]["post_visibility"]
          scheduled_at?: string | null
          comment_policy?: Database["public"]["Enums"]["comment_policy"]
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
          quarantined_at?: string | null
          trashed_at?: string | null
          trash_prev_status?: Database["public"]["Enums"]["post_status"] | null
          trash_prev_removed_at?: string | null
          show_exif?: boolean
          visibility?: Database["public"]["Enums"]["post_visibility"]
          scheduled_at?: string | null
          comment_policy?: Database["public"]["Enums"]["comment_policy"]
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
          memory_alerts: boolean
          cover_post_id: string | null
          links: string[]
          pinned_post_ids: string[]
          bio: string
          can_upload: boolean
          created_at: string
          deletion_requested_at: string | null
          display_name: string
          handle: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
          upload_revoked_at: string | null
        }
        Insert: {
          memory_alerts?: boolean
          cover_post_id?: string | null
          links?: string[]
          pinned_post_ids?: string[]
          bio?: string
          can_upload?: boolean
          created_at?: string
          deletion_requested_at?: string | null
          display_name: string
          handle: string
          id: string
          role?: Database["public"]["Enums"]["member_role"]
          upload_revoked_at?: string | null
        }
        Update: {
          memory_alerts?: boolean
          cover_post_id?: string | null
          links?: string[]
          pinned_post_ids?: string[]
          bio?: string
          can_upload?: boolean
          created_at?: string
          deletion_requested_at?: string | null
          display_name?: string
          handle?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          upload_revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_cover_post_id_fkey"
            columns: ["cover_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      report_evidence: {
        Row: {
          bytes: number
          content_type: string
          created_at: string
          id: string
          report_id: string
          storage_key: string
          uploaded_at: string | null
        }
        Insert: {
          bytes: number
          content_type: string
          created_at?: string
          id?: string
          report_id: string
          storage_key: string
          uploaded_at?: string | null
        }
        Update: {
          bytes?: number
          content_type?: string
          created_at?: string
          id?: string
          report_id?: string
          storage_key?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_evidence_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
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
      add_report_evidence: {
        Args: { bytes: number; content_type: string; target: string }
        Returns: { id: string; storage_key: string }[]
      }
      finish_report_evidence: { Args: { target: string }; Returns: boolean }
      resolve_credit_claim: { Args: { accept: boolean; target: string }; Returns: undefined }
      arrange_my_photos: { Args: { keep: string[]; target: string }; Returns: undefined }
      moderate_post: { Args: { decision: string; note: string; target: string }; Returns: undefined }
      set_photo_exif: { Args: { entries: Json; target_post: string }; Returns: undefined }
      tag_popular_posts: { Args: { days?: number; max_rows?: number; tag: string }; Returns: { likes: number; post_id: string }[] }
      tag_cosers: { Args: { max_rows?: number; tag: string }; Returns: { display_name: string; handle: string; posts: number }[] }
      post_like_stats: { Args: { ids: string[] }; Returns: { liked: boolean; likes: number; post_id: string }[] }
      can_i_upload: { Args: never; Returns: boolean }
      set_upload_stage: { Args: { note: string; stage: Database["public"]["Enums"]["upload_stage"] }; Returns: undefined }
      create_invite_code: { Args: { days: number; max_uses: number; note: string }; Returns: string }
      revoke_invite_code: { Args: { target: string }; Returns: undefined }
      redeem_invite_code: { Args: { input: string }; Returns: string }
      add_appeal_evidence: {
        Args: { bytes: number; content_type: string; target: string }
        Returns: { id: string; storage_key: string }[]
      }
      finish_appeal_evidence: { Args: { target: string }; Returns: boolean }
      set_photo_hashes: { Args: { entries: Json; target_post: string }; Returns: undefined }
      my_similar_photos: { Args: { hashes: string[] }; Returns: { idx: number; post_id: string | null }[] }
      am_i_adult: { Args: never; Returns: boolean }
      confirm_adult: { Args: { birth_date: string }; Returns: boolean }
      moderate_board: {
        Args: { decision: string; note: string; target_post: string; target_reply: string | null }
        Returns: undefined
      }
      start_thread: {
        Args: { body: string; casting_post?: string | null; form?: Json | null; recipient: string }
        Returns: string
      }
      send_message: { Args: { body: string; thread: string }; Returns: number }
      respond_thread: { Args: { accept: boolean; thread: string }; Returns: undefined }
      mark_thread_read: { Args: { thread: string }; Returns: undefined }
      dismiss_thread_guide: { Args: { thread: string }; Returns: undefined }
      my_threads: {
        Args: never
        Returns: {
          board_post_id: string | null
          closed: boolean
          kind: Database["public"]["Enums"]["thread_kind"]
          last_body: string | null
          last_message_at: string
          last_sender: string | null
          my_status: Database["public"]["Enums"]["thread_member_status"]
          other_handle: string
          other_id: string
          other_name: string
          other_read_at: string | null
          thread_id: string
          unread: number
        }[]
      }
      unread_thread_count: { Args: never; Returns: number }
      report_thread: {
        Args: { also_block: boolean; detail: string; reason: Database["public"]["Enums"]["report_reason"]; thread: string }
        Returns: undefined
      }
      admin_reported_thread: {
        Args: { report: string }
        Returns: { body: string; created_at: string; form: Json | null; message_id: number; sender_handle: string | null }[]
      }
      resolve_message_report: { Args: { decision: string; note: string; report: string }; Returns: undefined }
      creator_directory: {
        Args: {
          casting_only?: boolean
          max_rows?: number
          region_filter?: string | null
          role_filter?: Database["public"]["Enums"]["credit_role"] | null
          skip?: number
        }
        Returns: {
          active_since: number | null
          casting_open: boolean
          display_name: string
          handle: string
          last_active: string | null
          region: string | null
          roles: Database["public"]["Enums"]["credit_role"][]
          user_id: string
          works: string
        }[]
      }
      save_event: {
        Args: {
          event_description: string
          event_ends: string
          event_name: string
          event_region: string
          event_starts: string
          event_url: string | null
          event_venue: string
          tag_slug: string
          target: string | null
        }
        Returns: string
      }
      reject_event: { Args: { note: string; target: string }; Returns: undefined }
      event_attendee_counts: { Args: { ids: string[] }; Returns: { attendees: number; event_id: string }[] }
      moderate_comment: { Args: { decision: string; note: string; target: string }; Returns: undefined }
      pin_comment: { Args: { pin: boolean; target: string }; Returns: undefined }
      answer_inquiry: { Args: { reply: string; target: string }; Returns: undefined }
      admin_posts_action: { Args: { action: string; note: string; targets: string[] }; Returns: number }
      admin_dashboard: { Args: never; Returns: Json }
      set_site_limit: { Args: { name: string; new_value: number; note: string }; Returns: undefined }
      admin_reporter_stats: {
        Args: { ids: string[] }
        Returns: { actioned: number; dismissed: number; reporter_id: string; total: number; unreliable: boolean }[]
      }
      my_upload_quota: { Args: never; Returns: { quota: number; used: number }[] }
      admin_audit_log: {
        Args: { before_id?: number | null; max_rows?: number; q?: string | null }
        Returns: {
          action: string
          actor_handle: string | null
          created_at: string
          detail: Json
          id: number
          target_id: string | null
          target_table: string
        }[]
      }
      admin_member_account: {
        Args: { target: string }
        Returns: { last_sign_in_at: string | null; masked_email: string | null; provider: string | null }[]
      }
      admin_reveal_email: { Args: { reason: string; target: string }; Returns: string }
      set_site_switches: {
        Args: { message: string; note: string; read_only: boolean; signup_closed: boolean; uploads_closed: boolean }
        Returns: undefined
      }
      sanction_member: {
        Args: { action: string; days?: number | null; note: string; reason?: string | null; target: string }
        Returns: undefined
      }
      member_sanction_history: {
        Args: { target: string }
        Returns: { action: string; actor_handle: string | null; created_at: string; detail: Json }[]
      }
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
      board_kind: "casting" | "places" | "free" | "qna"
      casting_kind: "model_wanted" | "photographer_wanted" | "group"
      casting_terms: "paid" | "tfp" | "any"
      message_receive: "everyone" | "following" | "none"
      thread_kind: "direct" | "casting"
      post_visibility: "public" | "followers" | "private"
      comment_policy: "everyone" | "followers" | "off"
      upload_stage: "solo" | "invite" | "open"
      thread_member_status: "active" | "request" | "declined"
      event_status: "official" | "proposed" | "rejected"
      inquiry_category: "account" | "upload" | "credit" | "report" | "other"
      inquiry_status: "open" | "answered"
      notice_category: "maintenance" | "policy" | "news"
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
        | "member_suspended"
        | "member_warned"
        | "suspension_lifted"
        | "upload_granted"
        | "upload_revoked"
        | "inquiry_answered"
        | "comment_added"
        | "comment_replied"
        | "comment_mentioned"
        | "comment_hidden"
        | "event_reminder"
        | "event_approved"
        | "event_rejected"
        | "board_replied"
        | "board_hidden"
        | "message_received"
        | "message_request"
        | "post_liked"
        | "memory_today"
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
      board_kind: ["casting", "places", "free", "qna"],
      casting_kind: ["model_wanted", "photographer_wanted", "group"],
      casting_terms: ["paid", "tfp", "any"],
      message_receive: ["everyone", "following", "none"],
      thread_kind: ["direct", "casting"],
      post_visibility: ["public", "followers", "private"],
      comment_policy: ["everyone", "followers", "off"],
      upload_stage: ["solo", "invite", "open"],
      thread_member_status: ["active", "request", "declined"],
      event_status: ["official", "proposed", "rejected"],
      inquiry_category: ["account", "upload", "credit", "report", "other"],
      inquiry_status: ["open", "answered"],
      notice_category: ["maintenance", "policy", "news"],
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
        "member_suspended",
        "member_warned",
        "suspension_lifted",
        "upload_granted",
        "upload_revoked",
        "inquiry_answered",
        "comment_added",
        "comment_replied",
        "comment_mentioned",
        "comment_hidden",
        "event_reminder",
        "event_approved",
        "event_rejected",
        "board_replied",
        "board_hidden",
        "message_received",
        "message_request",
        "post_liked",
        "memory_today",
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
