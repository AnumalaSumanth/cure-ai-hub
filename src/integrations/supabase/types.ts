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
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string | null
          created_at: string
          doctor_name: string
          hospital_name: string | null
          id: string
          notes: string | null
          reminder_error: string | null
          reminder_method: string
          reminder_offset: string
          reminder_sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          appointment_date: string
          appointment_time?: string | null
          created_at?: string
          doctor_name: string
          hospital_name?: string | null
          id?: string
          notes?: string | null
          reminder_error?: string | null
          reminder_method?: string
          reminder_offset?: string
          reminder_sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string | null
          created_at?: string
          doctor_name?: string
          hospital_name?: string | null
          id?: string
          notes?: string | null
          reminder_error?: string | null
          reminder_method?: string
          reminder_offset?: string
          reminder_sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          content_tsv: unknown
          created_at: string
          document_id: string
          embedding: string
          id: string
          metadata: Json
          model_version: string
          user_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          content_tsv?: unknown
          created_at?: string
          document_id: string
          embedding: string
          id?: string
          metadata?: Json
          model_version?: string
          user_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          content_tsv?: unknown
          created_at?: string
          document_id?: string
          embedding?: string
          id?: string
          metadata?: Json
          model_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "medical_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      health_record_analyses: {
        Row: {
          abnormal: Json
          created_at: string
          doctor_questions: Json
          id: string
          key_findings: Json
          record_id: string
          simple_explanation: string | null
          summary: string | null
          urgent_note: string | null
          user_id: string
          values: Json
        }
        Insert: {
          abnormal?: Json
          created_at?: string
          doctor_questions?: Json
          id?: string
          key_findings?: Json
          record_id: string
          simple_explanation?: string | null
          summary?: string | null
          urgent_note?: string | null
          user_id: string
          values?: Json
        }
        Update: {
          abnormal?: Json
          created_at?: string
          doctor_questions?: Json
          id?: string
          key_findings?: Json
          record_id?: string
          simple_explanation?: string | null
          summary?: string | null
          urgent_note?: string | null
          user_id?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "health_record_analyses_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "health_records"
            referencedColumns: ["id"]
          },
        ]
      }
      health_records: {
        Row: {
          file_name: string | null
          file_type: string | null
          file_url: string | null
          id: string
          notes: string | null
          record_date: string | null
          record_type: string | null
          title: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          record_date?: string | null
          record_type?: string | null
          title: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          record_date?: string | null
          record_type?: string | null
          title?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      medical_documents: {
        Row: {
          category: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      medicine_doses: {
        Row: {
          created_at: string
          id: string
          medicine_id: string
          scheduled_date: string
          scheduled_time: string
          status: string
          taken_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          medicine_id: string
          scheduled_date: string
          scheduled_time: string
          status?: string
          taken_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          medicine_id?: string
          scheduled_date?: string
          scheduled_time?: string
          status?: string
          taken_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicine_doses_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
        ]
      }
      medicines: {
        Row: {
          created_at: string
          dosage: string | null
          end_date: string | null
          frequency: string | null
          id: string
          medicine_name: string
          notes: string | null
          reminder_app: boolean
          reminder_email: boolean
          reminder_lead_minutes: number
          reminder_sms: boolean
          reminder_time: string | null
          start_date: string
          strength: string | null
          times: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          medicine_name: string
          notes?: string | null
          reminder_app?: boolean
          reminder_email?: boolean
          reminder_lead_minutes?: number
          reminder_sms?: boolean
          reminder_time?: string | null
          start_date?: string
          strength?: string | null
          times?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          medicine_name?: string
          notes?: string | null
          reminder_app?: boolean
          reminder_email?: boolean
          reminder_lead_minutes?: number
          reminder_sms?: boolean
          reminder_time?: string | null
          start_date?: string
          strength?: string | null
          times?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age: number | null
          allergies: string | null
          blood_group: string | null
          conditions: string | null
          created_at: string
          emergency_contact: string | null
          full_name: string | null
          gender: string | null
          height: number | null
          id: string
          updated_at: string
          user_id: string
          weight: number | null
        }
        Insert: {
          age?: number | null
          allergies?: string | null
          blood_group?: string | null
          conditions?: string | null
          created_at?: string
          emergency_contact?: string | null
          full_name?: string | null
          gender?: string | null
          height?: number | null
          id?: string
          updated_at?: string
          user_id: string
          weight?: number | null
        }
        Update: {
          age?: number | null
          allergies?: string | null
          blood_group?: string | null
          conditions?: string | null
          created_at?: string
          emergency_contact?: string | null
          full_name?: string | null
          gender?: string | null
          height?: number | null
          id?: string
          updated_at?: string
          user_id?: string
          weight?: number | null
        }
        Relationships: []
      }
      study_plans: {
        Row: {
          created_at: string
          daily_hours: number
          days: number
          difficulty: string
          exam_date: string | null
          id: string
          plan: Json
          source_document_id: string | null
          subject: string
          tip: string | null
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_hours?: number
          days?: number
          difficulty?: string
          exam_date?: string | null
          id?: string
          plan?: Json
          source_document_id?: string | null
          subject: string
          tip?: string | null
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_hours?: number
          days?: number
          difficulty?: string
          exam_date?: string | null
          id?: string
          plan?: Json
          source_document_id?: string | null
          subject?: string
          tip?: string | null
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tips: {
        Row: {
          ai_summary: string | null
          category: string | null
          content: string
          created_at: string
          id: string
          is_featured: boolean
          notes: string | null
          status: string
          tags: string[]
          target_audience: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_summary?: string | null
          category?: string | null
          content: string
          created_at?: string
          id?: string
          is_featured?: boolean
          notes?: string | null
          status?: string
          tags?: string[]
          target_audience?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_summary?: string | null
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          is_featured?: boolean
          notes?: string | null
          status?: string
          tags?: string[]
          target_audience?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      hybrid_match_document_chunks: {
        Args: {
          match_count?: number
          match_user_id: string
          query_embedding: string
          query_text?: string
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          id: string
          keyword_rank: number
          metadata: Json
          similarity: number
        }[]
      }
      match_document_chunks: {
        Args: {
          match_count?: number
          match_user_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          document_id: string
          id: string
          similarity: number
        }[]
      }
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
