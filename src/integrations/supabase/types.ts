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
      bot_files: {
        Row: {
          bot_id: string
          content: string
          created_at: string
          id: string
          path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_id: string
          content?: string
          created_at?: string
          id?: string
          path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_id?: string
          content?: string
          created_at?: string
          id?: string
          path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_files_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_messages: {
        Row: {
          bot_id: string
          chat_id: string | null
          created_at: string
          direction: string
          handler: string | null
          id: string
          simulated: boolean
          telegram_user: string | null
          text: string | null
          user_id: string
        }
        Insert: {
          bot_id: string
          chat_id?: string | null
          created_at?: string
          direction: string
          handler?: string | null
          id?: string
          simulated?: boolean
          telegram_user?: string | null
          text?: string | null
          user_id: string
        }
        Update: {
          bot_id?: string
          chat_id?: string | null
          created_at?: string
          direction?: string
          handler?: string | null
          id?: string
          simulated?: boolean
          telegram_user?: string | null
          text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_messages_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_secrets: {
        Row: {
          bot_id: string
          created_at: string
          id: string
          key: string
          user_id: string
          value: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          id?: string
          key: string
          user_id: string
          value: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          id?: string
          key?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_secrets_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_store: {
        Row: {
          bot_id: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          bot_id: string
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          bot_id?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "bot_store_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_versions: {
        Row: {
          bot_id: string
          created_at: string
          files: Json
          id: string
          label: string | null
          spec: Json
          user_id: string
          version: number
        }
        Insert: {
          bot_id: string
          created_at?: string
          files?: Json
          id?: string
          label?: string | null
          spec?: Json
          user_id: string
          version: number
        }
        Update: {
          bot_id?: string
          created_at?: string
          files?: Json
          id?: string
          label?: string | null
          spec?: Json
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bot_versions_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          bot_username: string | null
          created_at: string
          description: string | null
          id: string
          kind: string
          name: string
          spec: Json
          telegram_token: string | null
          updated_at: string
          user_id: string
          webhook_secret: string
          webhook_status: string
        }
        Insert: {
          bot_username?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
          spec?: Json
          telegram_token?: string | null
          updated_at?: string
          user_id: string
          webhook_secret?: string
          webhook_status?: string
        }
        Update: {
          bot_username?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
          spec?: Json
          telegram_token?: string | null
          updated_at?: string
          user_id?: string
          webhook_secret?: string
          webhook_status?: string
        }
        Relationships: []
      }
      studio_events: {
        Row: {
          bot_id: string
          created_at: string
          detail: string | null
          duration_ms: number | null
          id: string
          label: string
          seq: number
          turn_id: string
          type: string
          user_id: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          detail?: string | null
          duration_ms?: number | null
          id?: string
          label?: string
          seq?: number
          turn_id: string
          type: string
          user_id: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          detail?: string | null
          duration_ms?: number | null
          id?: string
          label?: string
          seq?: number
          turn_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_events_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_messages: {
        Row: {
          bot_id: string
          content: string
          created_at: string
          id: string
          role: string
          turn_id: string | null
          user_id: string
        }
        Insert: {
          bot_id: string
          content: string
          created_at?: string
          id?: string
          role: string
          turn_id?: string | null
          user_id: string
        }
        Update: {
          bot_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
          turn_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_messages_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
