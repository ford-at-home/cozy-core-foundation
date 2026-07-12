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
      agent_run_events: {
        Row: {
          event_type: string | null
          external_event_id: string | null
          id: string
          payload: Json | null
          received_at: string
          run_id: string
          source: string
        }
        Insert: {
          event_type?: string | null
          external_event_id?: string | null
          id?: string
          payload?: Json | null
          received_at?: string
          run_id: string
          source: string
        }
        Update: {
          event_type?: string | null
          external_event_id?: string | null
          id?: string
          payload?: Json | null
          received_at?: string
          run_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          branch: string | null
          cancellation_status: string
          completed_at: string | null
          created_at: string
          dispatched_at: string | null
          duration_ms: number | null
          error: string | null
          external_agent_id: string | null
          external_raw_status: string | null
          external_run_id: string | null
          id: string
          idempotency_key: string | null
          inference_count: number
          input: Json | null
          input_summary: string | null
          kind: string
          output_summary: string | null
          parent_run_id: string | null
          piece_id: string | null
          provider: string | null
          result: Json | null
          session_id: string | null
          started_at: string | null
          status: string
          total_cost_usd: number
          user_id: string
        }
        Insert: {
          branch?: string | null
          cancellation_status?: string
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          duration_ms?: number | null
          error?: string | null
          external_agent_id?: string | null
          external_raw_status?: string | null
          external_run_id?: string | null
          id?: string
          idempotency_key?: string | null
          inference_count?: number
          input?: Json | null
          input_summary?: string | null
          kind?: string
          output_summary?: string | null
          parent_run_id?: string | null
          piece_id?: string | null
          provider?: string | null
          result?: Json | null
          session_id?: string | null
          started_at?: string | null
          status?: string
          total_cost_usd?: number
          user_id: string
        }
        Update: {
          branch?: string | null
          cancellation_status?: string
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          duration_ms?: number | null
          error?: string | null
          external_agent_id?: string | null
          external_raw_status?: string | null
          external_run_id?: string | null
          id?: string
          idempotency_key?: string | null
          inference_count?: number
          input?: Json | null
          input_summary?: string | null
          kind?: string
          output_summary?: string | null
          parent_run_id?: string | null
          piece_id?: string | null
          provider?: string | null
          result?: Json | null
          session_id?: string | null
          started_at?: string | null
          status?: string
          total_cost_usd?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_customers: {
        Row: {
          created_at: string
          email: string | null
          stripe_customer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          stripe_customer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          stripe_customer_id?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_accounts: {
        Row: {
          balance: number
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          actor: string
          amount: number
          created_at: string
          entry_type: string
          id: string
          idempotency_key: string
          metadata: Json
          purchase_id: string | null
          reason: string | null
          reservation_id: string | null
          run_id: string | null
          stripe_event_id: string | null
          user_id: string
        }
        Insert: {
          actor?: string
          amount: number
          created_at?: string
          entry_type: string
          id?: string
          idempotency_key: string
          metadata?: Json
          purchase_id?: string | null
          reason?: string | null
          reservation_id?: string | null
          run_id?: string | null
          stripe_event_id?: string | null
          user_id: string
        }
        Update: {
          actor?: string
          amount?: number
          created_at?: string
          entry_type?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          purchase_id?: string | null
          reason?: string | null
          reservation_id?: string | null
          run_id?: string | null
          stripe_event_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_products: {
        Row: {
          active: boolean
          amount_cents: number
          created_at: string
          credits: number
          currency: string
          id: string
          name: string
          sort: number
          stripe_price_id: string
          stripe_product_id: string | null
        }
        Insert: {
          active?: boolean
          amount_cents: number
          created_at?: string
          credits: number
          currency?: string
          id?: string
          name: string
          sort?: number
          stripe_price_id: string
          stripe_product_id?: string | null
        }
        Update: {
          active?: boolean
          amount_cents?: number
          created_at?: string
          credits?: number
          currency?: string
          id?: string
          name?: string
          sort?: number
          stripe_price_id?: string
          stripe_product_id?: string | null
        }
        Relationships: []
      }
      credit_reservations: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string | null
          resolved_at: string | null
          run_id: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason?: string | null
          resolved_at?: string | null
          run_id: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string | null
          resolved_at?: string | null
          run_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_reservations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      inferences: {
        Row: {
          cached_input_cost_usd: number | null
          cached_input_tokens: number | null
          calculated_cost_usd: number | null
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          external_request_id: string | null
          final_cost_usd: number
          id: string
          idempotency_key: string
          input_cost_usd: number | null
          input_tokens: number | null
          metadata: Json
          model: string | null
          operation_type: string
          output_cost_usd: number | null
          output_tokens: number | null
          pricing_id: string | null
          pricing_source: string
          provider: string
          provider_reported_cost_usd: number | null
          run_id: string
          session_id: string
          started_at: string | null
          user_id: string
        }
        Insert: {
          cached_input_cost_usd?: number | null
          cached_input_tokens?: number | null
          calculated_cost_usd?: number | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          external_request_id?: string | null
          final_cost_usd?: number
          id?: string
          idempotency_key: string
          input_cost_usd?: number | null
          input_tokens?: number | null
          metadata?: Json
          model?: string | null
          operation_type?: string
          output_cost_usd?: number | null
          output_tokens?: number | null
          pricing_id?: string | null
          pricing_source: string
          provider: string
          provider_reported_cost_usd?: number | null
          run_id: string
          session_id: string
          started_at?: string | null
          user_id: string
        }
        Update: {
          cached_input_cost_usd?: number | null
          cached_input_tokens?: number | null
          calculated_cost_usd?: number | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          external_request_id?: string | null
          final_cost_usd?: number
          id?: string
          idempotency_key?: string
          input_cost_usd?: number | null
          input_tokens?: number | null
          metadata?: Json
          model?: string | null
          operation_type?: string
          output_cost_usd?: number | null
          output_tokens?: number | null
          pricing_id?: string | null
          pricing_source?: string
          provider?: string
          provider_reported_cost_usd?: number | null
          run_id?: string
          session_id?: string
          started_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inferences_pricing_id_fkey"
            columns: ["pricing_id"]
            isOneToOne: false
            referencedRelation: "model_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inferences_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inferences_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      model_pricing: {
        Row: {
          cached_input_price_per_million: number | null
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          input_price_per_million: number | null
          model: string
          notes: string | null
          output_price_per_million: number | null
          per_task_price_usd: number | null
          pricing_kind: string
          provider: string
          source_url: string | null
        }
        Insert: {
          cached_input_price_per_million?: number | null
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          input_price_per_million?: number | null
          model: string
          notes?: string | null
          output_price_per_million?: number | null
          per_task_price_usd?: number | null
          pricing_kind: string
          provider: string
          source_url?: string | null
        }
        Update: {
          cached_input_price_per_million?: number | null
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          input_price_per_million?: number | null
          model?: string
          notes?: string | null
          output_price_per_million?: number | null
          per_task_price_usd?: number | null
          pricing_kind?: string
          provider?: string
          source_url?: string | null
        }
        Relationships: []
      }
      pieces: {
        Row: {
          created_at: string
          draft_pr_url: string | null
          final_pr_url: string | null
          id: string
          issue_number: number | null
          slug: string
          stage: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          draft_pr_url?: string | null
          final_pr_url?: string | null
          id?: string
          issue_number?: number | null
          slug: string
          stage?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          draft_pr_url?: string | null
          final_pr_url?: string | null
          id?: string
          issue_number?: number | null
          slug?: string
          stage?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          image_style: string
          image_style_preset: string | null
          style_text: string
          text_style_preset: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          image_style?: string
          image_style_preset?: string | null
          style_text?: string
          text_style_preset?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          image_style?: string
          image_style_preset?: string | null
          style_text?: string
          text_style_preset?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      provider_usage_events: {
        Row: {
          event_type: string
          external_id: string | null
          id: string
          inference_id: string | null
          payload: Json
          processed_at: string | null
          processing_error: string | null
          provider: string
          received_at: string
          run_id: string | null
          session_id: string | null
        }
        Insert: {
          event_type: string
          external_id?: string | null
          id?: string
          inference_id?: string | null
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          provider: string
          received_at?: string
          run_id?: string | null
          session_id?: string | null
        }
        Update: {
          event_type?: string
          external_id?: string | null
          id?: string
          inference_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          received_at?: string
          run_id?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_usage_events_inference_id_fkey"
            columns: ["inference_id"]
            isOneToOne: false
            referencedRelation: "inferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_usage_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_usage_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          amount_total_cents: number | null
          created_at: string
          credits: number
          currency: string | null
          id: string
          status: string
          stripe_checkout_session_id: string
          stripe_payment_intent_id: string | null
          stripe_price_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_total_cents?: number | null
          created_at?: string
          credits: number
          currency?: string | null
          id?: string
          status?: string
          stripe_checkout_session_id: string
          stripe_payment_intent_id?: string | null
          stripe_price_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_total_cents?: number | null
          created_at?: string
          credits?: number
          currency?: string | null
          id?: string
          status?: string
          stripe_checkout_session_id?: string
          stripe_payment_intent_id?: string | null
          stripe_price_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          inference_count: number
          metadata: Json
          piece_id: string | null
          run_count: number
          started_at: string
          status: string
          title: string | null
          total_cost_usd: number
          total_duration_ms: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          inference_count?: number
          metadata?: Json
          piece_id?: string | null
          run_count?: number
          started_at?: string
          status?: string
          title?: string | null
          total_cost_usd?: number
          total_duration_ms?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          inference_count?: number
          metadata?: Json
          piece_id?: string | null
          run_count?: number
          started_at?: string
          status?: string
          title?: string | null
          total_cost_usd?: number
          total_duration_ms?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          error: string | null
          id: string
          payload: Json
          processed_at: string | null
          received_at: string
          status: string
          type: string
        }
        Insert: {
          error?: string | null
          id: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          status?: string
          type: string
        }
        Update: {
          error?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          status?: string
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          credits_per_period: number
          current_period_end: string | null
          id: string
          status: string
          stripe_price_id: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_per_period?: number
          current_period_end?: string | null
          id?: string
          status: string
          stripe_price_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_per_period?: number
          current_period_end?: string | null
          id?: string
          status?: string
          stripe_price_id?: string
          stripe_subscription_id?: string
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
      admin_adjust_credits: {
        Args: {
          _actor: string
          _amount: number
          _idempotency_key: string
          _reason: string
          _user_id: string
        }
        Returns: string
      }
      grant_credits: {
        Args: {
          _actor?: string
          _amount: number
          _entry_type: string
          _idempotency_key: string
          _metadata?: Json
          _purchase_id?: string
          _reason?: string
          _run_id?: string
          _stripe_event_id?: string
          _user_id: string
        }
        Returns: string
      }
      recompute_run_totals: { Args: { _run_id: string }; Returns: undefined }
      recompute_session_totals: {
        Args: { _session_id: string }
        Returns: undefined
      }
      release_reservation: {
        Args: { _reason?: string; _run_id: string }
        Returns: boolean
      }
      reserve_credits: {
        Args: {
          _amount: number
          _reason?: string
          _run_id: string
          _user_id: string
        }
        Returns: string
      }
      settle_reservation: { Args: { _run_id: string }; Returns: boolean }
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
    Enums: {},
  },
} as const
