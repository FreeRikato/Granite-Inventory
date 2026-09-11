export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      batches: {
        Row: {
          batch_code: string
          breadth_ft: number | null
          created_at: string
          created_by: string | null
          freight_cost: number
          id: string
          initial_units: number
          landed_cost: number | null
          length_ft: number | null
          notes: string | null
          purchase_date: string
          slot: string
          supplier_id: string
          thickness_mm: number | null
          unit_purchase_price: number
          units_sold: number
          updated_at: string
          updated_by: string | null
          variant_id: string
        }
        Insert: {
          batch_code: string
          breadth_ft?: number | null
          created_at?: string
          created_by?: string | null
          freight_cost?: number
          id?: string
          initial_units: number
          landed_cost?: number | null
          length_ft?: number | null
          notes?: string | null
          purchase_date: string
          slot: string
          supplier_id: string
          thickness_mm?: number | null
          unit_purchase_price: number
          units_sold?: number
          updated_at?: string
          updated_by?: string | null
          variant_id: string
        }
        Update: {
          batch_code?: string
          breadth_ft?: number | null
          created_at?: string
          created_by?: string | null
          freight_cost?: number
          id?: string
          initial_units?: number
          landed_cost?: number | null
          length_ft?: number | null
          notes?: string | null
          purchase_date?: string
          slot?: string
          supplier_id?: string
          thickness_mm?: number | null
          unit_purchase_price?: number
          units_sold?: number
          updated_at?: string
          updated_by?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_batches"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_batches"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          abbreviation: string
          category: string
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          abbreviation: string
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          abbreviation?: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          ageing_after_days: number
          business_name: string
          catalog_public: boolean
          id: boolean
          stale_after_days: number
          tagline: string
          updated_at: string
          updated_by: string | null
          whatsapp_number: string
        }
        Insert: {
          ageing_after_days?: number
          business_name?: string
          catalog_public?: boolean
          id?: boolean
          stale_after_days?: number
          tagline?: string
          updated_at?: string
          updated_by?: string | null
          whatsapp_number?: string
        }
        Update: {
          ageing_after_days?: number
          business_name?: string
          catalog_public?: boolean
          id?: boolean
          stale_after_days?: number
          tagline?: string
          updated_at?: string
          updated_by?: string | null
          whatsapp_number?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          created_at: string
          id: string
          location: string | null
          name: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          name: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
          role: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          role?: string
        }
        Relationships: []
      }
      variants: {
        Row: {
          created_at: string
          id: string
          name: string
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_batches"
            referencedColumns: ["product_id"]
          },
        ]
      }
    }
    Views: {
      v_batches: {
        Row: {
          available: number | null
          batch_code: string | null
          breadth_ft: number | null
          category: string | null
          created_at: string | null
          created_by: string | null
          freight_cost: number | null
          id: string | null
          initial_units: number | null
          landed_cost: number | null
          length_ft: number | null
          notes: string | null
          product_abbreviation: string | null
          product_id: string | null
          product_name: string | null
          purchase_date: string | null
          slot: string | null
          supplier_id: string | null
          supplier_name: string | null
          thickness_mm: number | null
          unit_purchase_price: number | null
          units_sold: number | null
          updated_at: string | null
          updated_by: string | null
          variant_id: string | null
          variant_name: string | null
        }
        Relationships: []
      }
      v_public_business: {
        Row: {
          business_name: string | null
          catalog_public: boolean | null
          tagline: string | null
          whatsapp_number: string | null
        }
        Insert: {
          business_name?: string | null
          catalog_public?: boolean | null
          tagline?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          business_name?: string | null
          catalog_public?: boolean | null
          tagline?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_batch: {
        Args: {
          p_breadth_ft?: number
          p_freight_cost?: number
          p_initial_units?: number
          p_length_ft?: number
          p_notes?: string
          p_product_id: string
          p_purchase_date: string
          p_slot?: string
          p_supplier_id: string
          p_thickness_mm?: number
          p_unit_purchase_price?: number
          p_variant_name: string
        }
        Returns: {
          batch_code: string
          breadth_ft: number | null
          created_at: string
          created_by: string | null
          freight_cost: number
          id: string
          initial_units: number
          landed_cost: number | null
          length_ft: number | null
          notes: string | null
          purchase_date: string
          slot: string
          supplier_id: string
          thickness_mm: number | null
          unit_purchase_price: number
          units_sold: number
          updated_at: string
          updated_by: string | null
          variant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin: { Args: never; Returns: boolean }
      is_member: { Args: never; Returns: boolean }
      member_role: { Args: never; Returns: string }
      preview_batch_code: {
        Args: { p_date: string; p_product_id: string }
        Returns: string
      }
      suggest_slot: {
        Args: { p_category: string; p_length_ft: number }
        Returns: string
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

