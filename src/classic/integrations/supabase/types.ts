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
      access_role_repair_backups: {
        Row: {
          created_at: string
          id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          id: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          id?: string
          snapshot?: Json
        }
        Relationships: []
      }
      account_recovery_keys: {
        Row: {
          token_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          token_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          token_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      achievements: {
        Row: {
          code: string
          id: string
          meta: Json
          unlocked_at: string
          user_id: string
        }
        Insert: {
          code: string
          id?: string
          meta?: Json
          unlocked_at?: string
          user_id: string
        }
        Update: {
          code?: string
          id?: string
          meta?: Json
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_roles: {
        Row: {
          access_kind: string | null
          created_at: string
          description: string | null
          id: string
          is_default_for_signup: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          access_kind?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_default_for_signup?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          access_kind?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_default_for_signup?: boolean
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      approved_emails: {
        Row: {
          added_by: string | null
          created_at: string
          email: string
          id: string
          note: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          email: string
          id?: string
          note?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string
          email?: string
          id?: string
          note?: string | null
        }
        Relationships: []
      }
      card_categories: {
        Row: {
          card_id: string
          category_id: string
          created_at: string
          id: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          category_id: string
          created_at?: string
          id?: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          category_id?: string
          created_at?: string
          id?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_categories_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      card_decks: {
        Row: {
          card_id: string
          created_at: string
          deck_id: string
          id: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          deck_id: string
          id?: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          deck_id?: string
          id?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      card_visibility: {
        Row: {
          card_id: string
          id: string
          scope: string
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          card_id: string
          id?: string
          scope: string
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          card_id?: string
          id?: string
          scope?: string
          target_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cards: {
        Row: {
          amud: number | null
          answer: string | null
          correct_boolean: boolean | null
          correct_indices: Json | null
          created_at: string
          created_by: string | null
          daf: number | null
          deck_id: string | null
          deleted_at: string | null
          explanation: string | null
          id: string
          masechta: string | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_note: string | null
          moderation_status: string
          options: Json | null
          origin_card_id: string | null
          published_card_id: string | null
          question: string
          sort_order: number
          srs: Json
          stats: Json
          tags: Json
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amud?: number | null
          answer?: string | null
          correct_boolean?: boolean | null
          correct_indices?: Json | null
          created_at?: string
          created_by?: string | null
          daf?: number | null
          deck_id?: string | null
          deleted_at?: string | null
          explanation?: string | null
          id?: string
          masechta?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          moderation_status?: string
          options?: Json | null
          origin_card_id?: string | null
          published_card_id?: string | null
          question: string
          sort_order?: number
          srs?: Json
          stats?: Json
          tags?: Json
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amud?: number | null
          answer?: string | null
          correct_boolean?: boolean | null
          correct_indices?: Json | null
          created_at?: string
          created_by?: string | null
          daf?: number | null
          deck_id?: string | null
          deleted_at?: string | null
          explanation?: string | null
          id?: string
          masechta?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          moderation_status?: string
          options?: Json | null
          origin_card_id?: string | null
          published_card_id?: string | null
          question?: string
          sort_order?: number
          srs?: Json
          stats?: Json
          tags?: Json
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_origin_card_id_fkey"
            columns: ["origin_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_published_card_id_fkey"
            columns: ["published_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      day_notes: {
        Row: {
          date: string
          id: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          date: string
          id?: string
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          date?: string
          id?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      decks: {
        Row: {
          category_ids: Json
          color: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          include_sub_categories: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_ids?: Json
          color?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          include_sub_categories?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_ids?: Json
          color?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          include_sub_categories?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      desktop_install_events: {
        Row: {
          event_type: string
          from_version: string | null
          id: string
          install_id: string
          occurred_at: string
          reported_at: string
          to_version: string
          user_id: string
        }
        Insert: {
          event_type: string
          from_version?: string | null
          id?: string
          install_id: string
          occurred_at: string
          reported_at?: string
          to_version: string
          user_id: string
        }
        Update: {
          event_type?: string
          from_version?: string | null
          id?: string
          install_id?: string
          occurred_at?: string
          reported_at?: string
          to_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "desktop_install_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          active: boolean
          created_at: string
          deck_id: string | null
          id: string
          manual_done_dates: Json
          target: number
          title: string
          type: string
          updated_at: string
          user_id: string
          window_days: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          deck_id?: string | null
          id?: string
          manual_done_dates?: Json
          target?: number
          title: string
          type: string
          updated_at?: string
          user_id: string
          window_days?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          deck_id?: string | null
          id?: string
          manual_done_dates?: Json
          target?: number
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          window_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_sessions: {
        Row: {
          created_at: string
          date: string
          duration_minutes: number | null
          id: string
          next_review_date: string | null
          note: string | null
          quality: number | null
          review_number: number
          session_type: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          duration_minutes?: number | null
          id?: string
          next_review_date?: string | null
          note?: string | null
          quality?: number | null
          review_number?: number
          session_type?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          duration_minutes?: number | null
          id?: string
          next_review_date?: string | null
          note?: string | null
          quality?: number | null
          review_number?: number
          session_type?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      offline_question_devices: {
        Row: {
          created_at: string
          device_key: string
          display_name: string
          last_seen_at: string
          local_username: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_key: string
          display_name: string
          last_seen_at?: string
          local_username?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_key?: string
          display_name?: string
          last_seen_at?: string
          local_username?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          role_baseline_enabled: boolean
          status: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          role_baseline_enabled?: boolean
          status?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role_baseline_enabled?: boolean
          status?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      question_source_approval_rules: {
        Row: {
          enabled: boolean
          source_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          source_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          source_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      question_source_counts: {
        Row: {
          approved_count: number
          hidden_count: number
          pending_count: number
          question_count: number
          source_id: string
        }
        Insert: {
          approved_count?: number
          hidden_count?: number
          pending_count?: number
          question_count?: number
          source_id: string
        }
        Update: {
          approved_count?: number
          hidden_count?: number
          pending_count?: number
          question_count?: number
          source_id?: string
        }
        Relationships: []
      }
      review_logs: {
        Row: {
          at: string
          card_id: string
          correct: boolean
          deck_id: string | null
          duration_ms: number
          id: string
          quality: number
          updated_at: string
          user_id: string
        }
        Insert: {
          at?: string
          card_id: string
          correct: boolean
          deck_id?: string | null
          duration_ms?: number
          id?: string
          quality: number
          updated_at?: string
          user_id: string
        }
        Update: {
          at?: string
          card_id?: string
          correct?: boolean
          deck_id?: string | null
          duration_ms?: number
          id?: string
          quality?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_logs_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_logs_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      role_content_access: {
        Row: {
          approved_only: boolean
          include_own: boolean
          include_site_library: boolean
          role_id: string
          source_tags: string[] | null
          source_user_ids: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_only?: boolean
          include_own?: boolean
          include_site_library?: boolean
          role_id: string
          source_tags?: string[] | null
          source_user_ids?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_only?: boolean
          include_own?: boolean
          include_site_library?: boolean
          role_id?: string
          source_tags?: string[] | null
          source_user_ids?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_content_access_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: true
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_layout_defaults: {
        Row: {
          category_template: Json | null
          created_at: string
          role_id: string
          sidebar_config: Json | null
          updated_at: string
          updated_by: string | null
          widget_layout: Json | null
        }
        Insert: {
          category_template?: Json | null
          created_at?: string
          role_id: string
          sidebar_config?: Json | null
          updated_at?: string
          updated_by?: string | null
          widget_layout?: Json | null
        }
        Update: {
          category_template?: Json | null
          created_at?: string
          role_id?: string
          sidebar_config?: Json | null
          updated_at?: string
          updated_by?: string | null
          widget_layout?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "role_layout_defaults_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: true
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          action: Database["public"]["Enums"]["permission_action"]
          allowed: boolean
          id: string
          module: Database["public"]["Enums"]["permission_module"]
          role_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["permission_action"]
          allowed?: boolean
          id?: string
          module: Database["public"]["Enums"]["permission_module"]
          role_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["permission_action"]
          allowed?: boolean
          id?: string
          module?: Database["public"]["Enums"]["permission_module"]
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      shas_plans: {
        Row: {
          anchor_amud: number | null
          anchor_daf: number | null
          anchor_date: string | null
          anchor_masechta: string | null
          completed: Json
          created_at: string
          current_amud: number
          current_daf: number
          current_half: number
          current_masechta: string
          id: string
          pages_per_day: number
          selected_masechtos: Json
          start_date: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor_amud?: number | null
          anchor_daf?: number | null
          anchor_date?: string | null
          anchor_masechta?: string | null
          completed?: Json
          created_at?: string
          current_amud?: number
          current_daf?: number
          current_half?: number
          current_masechta: string
          id?: string
          pages_per_day?: number
          selected_masechtos?: Json
          start_date?: string
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor_amud?: number | null
          anchor_daf?: number | null
          anchor_date?: string | null
          anchor_masechta?: string | null
          completed?: Json
          created_at?: string
          current_amud?: number
          current_daf?: number
          current_half?: number
          current_masechta?: string
          id?: string
          pages_per_day?: number
          selected_masechtos?: Json
          start_date?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shas_reviews: {
        Row: {
          amud: number
          created_at: string
          daf: number
          done_at: string | null
          due_date: string
          half: number | null
          id: string
          is_initial: boolean
          masechta: string
          note: string | null
          review_index: number
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amud?: number
          created_at?: string
          daf: number
          done_at?: string | null
          due_date: string
          half?: number | null
          id?: string
          is_initial?: boolean
          masechta: string
          note?: string | null
          review_index?: number
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amud?: number
          created_at?: string
          daf?: number
          done_at?: string | null
          due_date?: string
          half?: number | null
          id?: string
          is_initial?: boolean
          masechta?: string
          note?: string | null
          review_index?: number
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      source_change_notes: {
        Row: {
          admin_response: string | null
          created_at: string
          forked_card_id: string | null
          id: string
          note: string
          original_card_id: string | null
          original_question: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_user_id: string
          status: string
          target_index: number | null
          target_kind: string | null
          target_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          created_at?: string
          forked_card_id?: string | null
          id?: string
          note: string
          original_card_id?: string | null
          original_question?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_user_id: string
          status?: string
          target_index?: number | null
          target_kind?: string | null
          target_text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          created_at?: string
          forked_card_id?: string | null
          id?: string
          note?: string
          original_card_id?: string | null
          original_question?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_user_id?: string
          status?: string
          target_index?: number | null
          target_kind?: string | null
          target_text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_general_plans: {
        Row: {
          created_at: string
          data: Json
          id: string
          plan_updated_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id: string
          plan_updated_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          plan_updated_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_plan_reviews: {
        Row: {
          created_at: string
          data: Json
          id: string
          review_updated_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id: string
          review_updated_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          review_updated_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_activity_daily: {
        Row: {
          active_seconds: number
          activity_date: string
          desktop_active_seconds: number
          desktop_login_count: number
          first_seen_at: string
          last_login_at: string | null
          last_seen_at: string
          login_count: number
          user_id: string
          web_active_seconds: number
          web_login_count: number
        }
        Insert: {
          active_seconds?: number
          activity_date: string
          desktop_active_seconds?: number
          desktop_login_count?: number
          first_seen_at?: string
          last_login_at?: string | null
          last_seen_at?: string
          login_count?: number
          user_id: string
          web_active_seconds?: number
          web_login_count?: number
        }
        Update: {
          active_seconds?: number
          activity_date?: string
          desktop_active_seconds?: number
          desktop_login_count?: number
          first_seen_at?: string
          last_login_at?: string | null
          last_seen_at?: string
          login_count?: number
          user_id?: string
          web_active_seconds?: number
          web_login_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_backup_chunks: {
        Row: {
          backup_id: string
          chunk_data: string
          chunk_index: number
          created_at: string
          user_id: string
        }
        Insert: {
          backup_id: string
          chunk_data: string
          chunk_index: number
          created_at?: string
          user_id: string
        }
        Update: {
          backup_id?: string
          chunk_data?: string
          chunk_index?: number
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_backup_chunks_backup_id_fkey"
            columns: ["backup_id"]
            isOneToOne: false
            referencedRelation: "user_backups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_backups: {
        Row: {
          created_at: string
          id: string
          name: string
          size_bytes: number
          snapshot: Json
          storage_mode: string
          topic_ids: string[] | null
          total_chunks: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          size_bytes?: number
          snapshot: Json
          storage_mode?: string
          topic_ids?: string[] | null
          total_chunks?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          size_bytes?: number
          snapshot?: Json
          storage_mode?: string
          topic_ids?: string[] | null
          total_chunks?: number
          user_id?: string
        }
        Relationships: []
      }
      user_permission_overrides: {
        Row: {
          action: Database["public"]["Enums"]["permission_action"]
          allowed: boolean
          created_at: string
          id: string
          module: Database["public"]["Enums"]["permission_module"]
          set_by: string | null
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["permission_action"]
          allowed?: boolean
          created_at?: string
          id?: string
          module: Database["public"]["Enums"]["permission_module"]
          set_by?: string | null
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["permission_action"]
          allowed?: boolean
          created_at?: string
          id?: string
          module?: Database["public"]["Enums"]["permission_module"]
          set_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          active_shas_plan_id: string | null
          custom_category_templates: Json
          general_plan_reviews: Json
          general_plans: Json
          notifications_enabled: boolean
          plan_review_intervals: Json
          practice_results: Json
          quiz_attempts: Json
          quiz_plans: Json
          reminder_time: string
          review_intervals: Json
          shas_plans: Json
          tab_config: Json | null
          ui_prefs: Json
          updated_at: string
          user_id: string
          widget_layout: Json | null
          widget_layout_updated_at: string | null
        }
        Insert: {
          active_shas_plan_id?: string | null
          custom_category_templates?: Json
          general_plan_reviews?: Json
          general_plans?: Json
          notifications_enabled?: boolean
          plan_review_intervals?: Json
          practice_results?: Json
          quiz_attempts?: Json
          quiz_plans?: Json
          reminder_time?: string
          review_intervals?: Json
          shas_plans?: Json
          tab_config?: Json | null
          ui_prefs?: Json
          updated_at?: string
          user_id: string
          widget_layout?: Json | null
          widget_layout_updated_at?: string | null
        }
        Update: {
          active_shas_plan_id?: string | null
          custom_category_templates?: Json
          general_plan_reviews?: Json
          general_plans?: Json
          notifications_enabled?: boolean
          plan_review_intervals?: Json
          practice_results?: Json
          quiz_attempts?: Json
          quiz_plans?: Json
          reminder_time?: string
          review_intervals?: Json
          shas_plans?: Json
          tab_config?: Json | null
          ui_prefs?: Json
          updated_at?: string
          user_id?: string
          widget_layout?: Json | null
          widget_layout_updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_question_source_counts: {
        Args: { p_delta: number; p_status: string; p_tags: Json }
        Returns: undefined
      }
      admin_approve_question_source: {
        Args: { p_source_id: string }
        Returns: number
      }
      admin_create_user:
        | {
            Args: {
              p_display_name?: string
              p_email: string
              p_password: string
              p_role_name?: string
              p_status?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_display_name?: string
              p_email: string
              p_password: string
              p_role_name?: string
              p_status?: string
              p_username?: string
            }
            Returns: string
          }
      admin_delete_access_profile: {
        Args: { p_profile_id: string; p_scope: string }
        Returns: undefined
      }
      admin_delete_user: { Args: { p_user_id: string }; Returns: undefined }
      admin_replace_user_role: {
        Args: { p_role_id: string; p_user_id: string }
        Returns: undefined
      }
      admin_save_access_profile: {
        Args: {
          p_block: Json
          p_expected_permissions?: Json
          p_expected_updated_at?: number
          p_layout: Json
          p_permissions?: Json
          p_role_ids: string[]
          p_scope: string
        }
        Returns: undefined
      }
      admin_set_default_signup_role: {
        Args: { p_role_id?: string }
        Returns: undefined
      }
      admin_set_password: {
        Args: { p_password: string; p_user_id: string }
        Returns: undefined
      }
      admin_set_profile_status: {
        Args: { p_status: string; p_user_id: string }
        Returns: undefined
      }
      admin_set_source_auto_approval: {
        Args: { p_enabled: boolean; p_source_id: string }
        Returns: undefined
      }
      admin_update_user: {
        Args: {
          p_display_name?: string
          p_email?: string
          p_status?: string
          p_user_id: string
        }
        Returns: undefined
      }
      backfill_card_provenance: { Args: { p_limit?: number }; Returns: number }
      can_read_card: { Args: { p_card: string }; Returns: boolean }
      effective_access_role_ids: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      email_for_username: { Args: { p_username: string }; Returns: string }
      exec_sql: { Args: { query: string }; Returns: Json }
      get_access_role_policy: { Args: never; Returns: Json }
      get_admin_content_sources: {
        Args: never
        Returns: {
          email: string
          label: string
          question_count: number
          source_user_id: string
        }[]
      }
      get_admin_question_source_tags: {
        Args: never
        Returns: {
          approved_count: number
          auto_approve: boolean
          hidden_count: number
          pending_count: number
          question_count: number
          source_id: string
        }[]
      }
      get_admin_user_questions: {
        Args: never
        Returns: {
          amud: number | null
          answer: string | null
          correct_boolean: boolean | null
          correct_indices: Json | null
          created_at: string
          created_by: string | null
          daf: number | null
          deck_id: string | null
          deleted_at: string | null
          explanation: string | null
          id: string
          masechta: string | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_note: string | null
          moderation_status: string
          options: Json | null
          origin_card_id: string | null
          published_card_id: string | null
          question: string
          sort_order: number
          srs: Json
          stats: Json
          tags: Json
          type: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "cards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_bootstrap_snapshot: { Args: never; Returns: Json }
      get_card_forecast: {
        Args: { p_days?: number }
        Returns: {
          card_count: number
          day_index: number
          day_start_ms: number
        }[]
      }
      get_card_health: {
        Args: never
        Returns: {
          leech: number
          mature: number
          weak: number
        }[]
      }
      get_category_card_counts: {
        Args: never
        Returns: {
          category_id: string
          correct_sum: number
          due: number
          total: number
          total_reviews: number
        }[]
      }
      get_category_children: {
        Args: { p_parent_id?: string }
        Returns: {
          color: string
          created_at: string
          has_children: boolean
          id: string
          name: string
          parent_id: string
          sort_order: number
        }[]
      }
      get_content_card_categories: { Args: never; Returns: Json }
      get_content_category_children: {
        Args: { p_parent_id?: string }
        Returns: {
          color: string
          created_at: string
          has_children: boolean
          id: string
          name: string
          parent_id: string
          sort_order: number
        }[]
      }
      get_content_overlay_snapshot: { Args: never; Returns: Json }
      get_content_unreviewed_cards_page: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      get_deck_card_stats: {
        Args: never
        Returns: {
          deck_id: string
          due: number
          total: number
        }[]
      }
      get_due_count_today: { Args: never; Returns: number }
      get_effective_content_access: { Args: never; Returns: Json }
      get_effective_question_source_tags: { Args: never; Returns: string[] }
      get_guest_bootstrap_snapshot: { Args: never; Returns: Json }
      get_guest_bootstrap_snapshot_for: {
        Args: { p_source_user_id?: string }
        Returns: Json
      }
      get_guest_card_categories: { Args: never; Returns: Json }
      get_guest_card_categories_for: {
        Args: { p_source_user_id?: string }
        Returns: Json
      }
      get_guest_category_children: {
        Args: { p_parent_id?: string }
        Returns: {
          color: string
          created_at: string
          has_children: boolean
          id: string
          name: string
          parent_id: string
          sort_order: number
        }[]
      }
      get_guest_category_children_for: {
        Args: { p_parent_id?: string; p_source_user_id?: string }
        Returns: {
          color: string
          created_at: string
          has_children: boolean
          id: string
          name: string
          parent_id: string
          sort_order: number
        }[]
      }
      get_guest_source_user_id: { Args: never; Returns: string }
      get_guest_unreviewed_cards_page: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      get_guest_unreviewed_cards_page_for: {
        Args: { p_limit?: number; p_offset?: number; p_source_user_id?: string }
        Returns: Json
      }
      get_my_role_layout_defaults: { Args: never; Returns: Json }
      get_source_card_categories: { Args: never; Returns: Json }
      get_source_category_children: {
        Args: { p_parent_id?: string }
        Returns: {
          color: string
          created_at: string
          has_children: boolean
          id: string
          name: string
          parent_id: string
          sort_order: number
        }[]
      }
      get_source_overlay_snapshot: { Args: never; Returns: Json }
      get_source_unreviewed_cards_page: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      get_unreviewed_cards_page: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      get_user_card_stats: {
        Args: never
        Returns: {
          due: number
          learning: number
          mastered: number
          total: number
          total_reviews: number
        }[]
      }
      get_weak_cards: {
        Args: { p_limit?: number }
        Returns: {
          fails: number
          id: string
          question: string
          rate: number
          total: number
        }[]
      }
      has_permission: {
        Args: {
          _action: Database["public"]["Enums"]["permission_action"]
          _module: Database["public"]["Enums"]["permission_module"]
          _user_id: string
        }
        Returns: boolean
      }
      hidden_by_admin_card_ids: { Args: never; Returns: string[] }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      matches_shared_question_access: {
        Args: {
          creator: string
          owner_id: string
          policy: Json
          status: string
          tags: Json
        }
        Returns: boolean
      }
      prune_preupdate_backups: { Args: { p_keep?: number }; Returns: number }
      publish_user_question: { Args: { p_card_id: string }; Returns: string }
      publish_user_questions: {
        Args: { p_card_ids: string[] }
        Returns: {
          original_card_id: string
          published_card_id: string
        }[]
      }
      question_source_ids: { Args: { tags: Json }; Returns: string[] }
      record_desktop_install_event: {
        Args: {
          p_event_type: string
          p_from_version: string
          p_install_id: string
          p_occurred_at: string
          p_to_version: string
        }
        Returns: undefined
      }
      record_user_activity: {
        Args: {
          p_active_seconds?: number
          p_client_type?: string
          p_event?: string
        }
        Returns: undefined
      }
      recover_username_account: {
        Args: {
          p_code: string
          p_next_hash: string
          p_password: string
          p_username: string
        }
        Returns: boolean
      }
      register_username_account: {
        Args: {
          p_display_name: string
          p_password: string
          p_recovery_hash: string
          p_username: string
        }
        Returns: string
      }
      reorder_user_categories: { Args: { p_ids: string[] }; Returns: undefined }
      set_card_visibility: {
        Args: {
          p_card: string
          p_hidden: boolean
          p_scope?: string
          p_target?: string
        }
        Returns: undefined
      }
      submit_offline_question: {
        Args: {
          p_card: Json
          p_device_key: string
          p_display_name: string
          p_local_username: string
        }
        Returns: string
      }
      suggest_usernames: {
        Args: { p_base: string; p_count?: number }
        Returns: string[]
      }
    }
    Enums: {
      permission_action: "view" | "create" | "edit" | "delete" | "manage"
      permission_module:
        | "decks"
        | "cards"
        | "goals"
        | "shas"
        | "analytics"
        | "users"
        | "roles"
        | "settings"
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
  public: {
    Enums: {
      permission_action: ["view", "create", "edit", "delete", "manage"],
      permission_module: [
        "decks",
        "cards",
        "goals",
        "shas",
        "analytics",
        "users",
        "roles",
        "settings",
      ],
    },
  },
} as const
