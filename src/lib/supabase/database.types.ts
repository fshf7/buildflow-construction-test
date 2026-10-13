export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      approval_actions: {
        Row: {
          action: Database["public"]["Enums"]["approval_action"];
          approval_request_id: string;
          comment: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          organization_id: string;
        };
        Insert: {
          action: Database["public"]["Enums"]["approval_action"];
          approval_request_id: string;
          comment?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id: string;
        };
        Update: {
          action?: Database["public"]["Enums"]["approval_action"];
          approval_request_id?: string;
          comment?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approval_actions_approval_request_id_fkey";
            columns: ["approval_request_id"];
            isOneToOne: false;
            referencedRelation: "approval_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approval_actions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      approval_requests: {
        Row: {
          created_at: string;
          created_by: string | null;
          decided_at: string | null;
          decided_by: string | null;
          doc_id: string;
          doc_type: Database["public"]["Enums"]["document_type"];
          id: string;
          organization_id: string;
          project_id: string | null;
          required_permission: string;
          status: Database["public"]["Enums"]["approval_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          doc_id: string;
          doc_type: Database["public"]["Enums"]["document_type"];
          id?: string;
          organization_id: string;
          project_id?: string | null;
          required_permission: string;
          status?: Database["public"]["Enums"]["approval_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          doc_id?: string;
          doc_type?: Database["public"]["Enums"]["document_type"];
          id?: string;
          organization_id?: string;
          project_id?: string | null;
          required_permission?: string;
          status?: Database["public"]["Enums"]["approval_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approval_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          doc_type: Database["public"]["Enums"]["document_type"] | null;
          id: number;
          idempotency_key: string | null;
          new_data: Json | null;
          occurred_at: string;
          old_data: Json | null;
          organization_id: string;
          project_id: string | null;
          record_id: string | null;
          table_name: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          doc_type?: Database["public"]["Enums"]["document_type"] | null;
          id?: never;
          idempotency_key?: string | null;
          new_data?: Json | null;
          occurred_at?: string;
          old_data?: Json | null;
          organization_id: string;
          project_id?: string | null;
          record_id?: string | null;
          table_name: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          doc_type?: Database["public"]["Enums"]["document_type"] | null;
          id?: never;
          idempotency_key?: string | null;
          new_data?: Json | null;
          occurred_at?: string;
          old_data?: Json | null;
          organization_id?: string;
          project_id?: string | null;
          record_id?: string | null;
          table_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      blocks: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          organization_id: string;
          project_id: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          project_id: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          project_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blocks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocks_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      cash_accounts: {
        Row: {
          account_number: string | null;
          balance: number;
          bank_name: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          id: string;
          is_active: boolean;
          kind: Database["public"]["Enums"]["cash_account_kind"];
          name: string;
          organization_id: string;
          project_id: string | null;
          updated_at: string;
        };
        Insert: {
          account_number?: string | null;
          balance?: number;
          bank_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          id?: string;
          is_active?: boolean;
          kind?: Database["public"]["Enums"]["cash_account_kind"];
          name: string;
          organization_id: string;
          project_id?: string | null;
          updated_at?: string;
        };
        Update: {
          account_number?: string | null;
          balance?: number;
          bank_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          id?: string;
          is_active?: boolean;
          kind?: Database["public"]["Enums"]["cash_account_kind"];
          name?: string;
          organization_id?: string;
          project_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cash_accounts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cash_accounts_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      cash_transaction_allocations: {
        Row: {
          amount: number;
          cash_transaction_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          organization_id: string;
          payable_id: string | null;
          payment_request_id: string | null;
          updated_at: string;
        };
        Insert: {
          amount: number;
          cash_transaction_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id: string;
          payable_id?: string | null;
          payment_request_id?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          cash_transaction_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id?: string;
          payable_id?: string | null;
          payment_request_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cash_transaction_allocations_cash_transaction_id_organizat_fkey";
            columns: ["cash_transaction_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "cash_transactions";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "cash_transaction_allocations_payable_id_fkey";
            columns: ["payable_id"];
            isOneToOne: false;
            referencedRelation: "payables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cash_transaction_allocations_payment_request_id_fkey";
            columns: ["payment_request_id"];
            isOneToOne: false;
            referencedRelation: "payment_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      cash_transactions: {
        Row: {
          amount: number;
          basis: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cash_account_id: string;
          category: Database["public"]["Enums"]["cash_category"];
          counterparty_crew_id: string | null;
          counterparty_name: string | null;
          counterparty_supplier_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          direction: Database["public"]["Enums"]["cash_direction"];
          doc_date: string;
          id: string;
          kind: Database["public"]["Enums"]["cash_tx_kind"];
          note: string | null;
          number: string | null;
          opening_balance_id: string | null;
          organization_id: string;
          posted_at: string | null;
          posted_by: string | null;
          project_id: string | null;
          reversal_approved_at: string | null;
          reversal_approved_by: string | null;
          reversal_of_id: string | null;
          reversal_reason: string | null;
          reversal_requested_at: string | null;
          reversal_requested_by: string | null;
          status: Database["public"]["Enums"]["cash_tx_status"];
          updated_at: string;
        };
        Insert: {
          amount: number;
          basis?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cash_account_id: string;
          category: Database["public"]["Enums"]["cash_category"];
          counterparty_crew_id?: string | null;
          counterparty_name?: string | null;
          counterparty_supplier_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency: string;
          direction: Database["public"]["Enums"]["cash_direction"];
          doc_date?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["cash_tx_kind"];
          note?: string | null;
          number?: string | null;
          opening_balance_id?: string | null;
          organization_id: string;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id?: string | null;
          reversal_approved_at?: string | null;
          reversal_approved_by?: string | null;
          reversal_of_id?: string | null;
          reversal_reason?: string | null;
          reversal_requested_at?: string | null;
          reversal_requested_by?: string | null;
          status?: Database["public"]["Enums"]["cash_tx_status"];
          updated_at?: string;
        };
        Update: {
          amount?: number;
          basis?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cash_account_id?: string;
          category?: Database["public"]["Enums"]["cash_category"];
          counterparty_crew_id?: string | null;
          counterparty_name?: string | null;
          counterparty_supplier_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          direction?: Database["public"]["Enums"]["cash_direction"];
          doc_date?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["cash_tx_kind"];
          note?: string | null;
          number?: string | null;
          opening_balance_id?: string | null;
          organization_id?: string;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id?: string | null;
          reversal_approved_at?: string | null;
          reversal_approved_by?: string | null;
          reversal_of_id?: string | null;
          reversal_reason?: string | null;
          reversal_requested_at?: string | null;
          reversal_requested_by?: string | null;
          status?: Database["public"]["Enums"]["cash_tx_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cash_transactions_cash_account_id_organization_id_fkey";
            columns: ["cash_account_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "cash_accounts";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "cash_transactions_counterparty_crew_id_organization_id_fkey";
            columns: ["counterparty_crew_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "crews";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "cash_transactions_counterparty_supplier_id_organization_id_fkey";
            columns: ["counterparty_supplier_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "cash_transactions_opening_balance_id_organization_id_fkey";
            columns: ["opening_balance_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "opening_balances";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "cash_transactions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cash_transactions_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "cash_transactions_reversal_of_id_fkey";
            columns: ["reversal_of_id"];
            isOneToOne: true;
            referencedRelation: "cash_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cash_transactions_reversal_of_id_fkey";
            columns: ["reversal_of_id"];
            isOneToOne: true;
            referencedRelation: "payments";
            referencedColumns: ["cash_transaction_id"];
          },
        ];
      };
      crew_members: {
        Row: {
          created_at: string;
          created_by: string | null;
          crew_id: string;
          full_name: string;
          id: string;
          is_active: boolean;
          organization_id: string;
          phone: string | null;
          position: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          crew_id: string;
          full_name: string;
          id?: string;
          is_active?: boolean;
          organization_id: string;
          phone?: string | null;
          position?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          crew_id?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          organization_id?: string;
          phone?: string | null;
          position?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crew_members_crew_id_organization_id_fkey";
            columns: ["crew_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "crews";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "crew_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crews: {
        Row: {
          created_at: string;
          created_by: string | null;
          foreman_member_id: string | null;
          id: string;
          is_active: boolean;
          leader_name: string | null;
          name: string;
          organization_id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          foreman_member_id?: string | null;
          id?: string;
          is_active?: boolean;
          leader_name?: string | null;
          name: string;
          organization_id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          foreman_member_id?: string | null;
          id?: string;
          is_active?: boolean;
          leader_name?: string | null;
          name?: string;
          organization_id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crews_foreman_member_id_organization_id_fkey";
            columns: ["foreman_member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_members";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "crews_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      document_attachments: {
        Row: {
          created_at: string;
          created_by: string | null;
          doc_id: string;
          doc_type: Database["public"]["Enums"]["document_type"];
          file_name: string;
          id: string;
          mime_type: string;
          organization_id: string;
          project_id: string | null;
          size_bytes: number;
          storage_path: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          doc_id: string;
          doc_type: Database["public"]["Enums"]["document_type"];
          file_name: string;
          id?: string;
          mime_type: string;
          organization_id: string;
          project_id?: string | null;
          size_bytes: number;
          storage_path: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          doc_id?: string;
          doc_type?: Database["public"]["Enums"]["document_type"];
          file_name?: string;
          id?: string;
          mime_type?: string;
          organization_id?: string;
          project_id?: string | null;
          size_bytes?: number;
          storage_path?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_attachments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      document_sequences: {
        Row: {
          doc_type: Database["public"]["Enums"]["document_type"];
          last_value: number;
          organization_id: string;
          year: number;
        };
        Insert: {
          doc_type: Database["public"]["Enums"]["document_type"];
          last_value?: number;
          organization_id: string;
          year: number;
        };
        Update: {
          doc_type?: Database["public"]["Enums"]["document_type"];
          last_value?: number;
          organization_id?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_sequences_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      floors: {
        Row: {
          block_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          level: number | null;
          name: string;
          organization_id: string;
          project_id: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          block_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          level?: number | null;
          name: string;
          organization_id: string;
          project_id: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          block_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          level?: number | null;
          name?: string;
          organization_id?: string;
          project_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "floors_block_id_project_id_fkey";
            columns: ["block_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "blocks";
            referencedColumns: ["id", "project_id"];
          },
          {
            foreignKeyName: "floors_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "floors_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      goods_receipt_items: {
        Row: {
          created_at: string;
          created_by: string | null;
          goods_receipt_id: string;
          id: string;
          line_no: number;
          material_id: string;
          ordered_quantity: number | null;
          organization_id: string;
          project_id: string;
          purchase_request_item_id: string | null;
          received_quantity: number;
          unit_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          goods_receipt_id: string;
          id?: string;
          line_no: number;
          material_id: string;
          ordered_quantity?: number | null;
          organization_id: string;
          project_id: string;
          purchase_request_item_id?: string | null;
          received_quantity: number;
          unit_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          goods_receipt_id?: string;
          id?: string;
          line_no?: number;
          material_id?: string;
          ordered_quantity?: number | null;
          organization_id?: string;
          project_id?: string;
          purchase_request_item_id?: string | null;
          received_quantity?: number;
          unit_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_goods_receipt_id_organization_id_proje_fkey";
            columns: ["goods_receipt_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "goods_receipts";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "goods_receipt_items_material_id_organization_id_fkey";
            columns: ["material_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "goods_receipt_items_purchase_request_item_id_fkey";
            columns: ["purchase_request_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_request_fulfillment";
            referencedColumns: ["purchase_request_item_id"];
          },
          {
            foreignKeyName: "goods_receipt_items_purchase_request_item_id_fkey";
            columns: ["purchase_request_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_request_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goods_receipt_items_purchase_request_item_id_fkey";
            columns: ["purchase_request_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_request_items_priced";
            referencedColumns: ["id"];
          },
        ];
      };
      goods_receipts: {
        Row: {
          correction_approved_at: string | null;
          correction_approved_by: string | null;
          correction_reason: string | null;
          corrects_receipt_id: string | null;
          created_at: string;
          created_by: string | null;
          doc_date: string;
          id: string;
          note: string | null;
          number: string | null;
          organization_id: string;
          posted_at: string | null;
          posted_by: string | null;
          project_id: string;
          purchase_request_id: string | null;
          received_at: string;
          status: Database["public"]["Enums"]["goods_receipt_status"];
          supplier_id: string;
          supplier_invoice_id: string | null;
          updated_at: string;
          warehouse_id: string;
        };
        Insert: {
          correction_approved_at?: string | null;
          correction_approved_by?: string | null;
          correction_reason?: string | null;
          corrects_receipt_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          doc_date?: string;
          id?: string;
          note?: string | null;
          number?: string | null;
          organization_id: string;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id: string;
          purchase_request_id?: string | null;
          received_at?: string;
          status?: Database["public"]["Enums"]["goods_receipt_status"];
          supplier_id: string;
          supplier_invoice_id?: string | null;
          updated_at?: string;
          warehouse_id: string;
        };
        Update: {
          correction_approved_at?: string | null;
          correction_approved_by?: string | null;
          correction_reason?: string | null;
          corrects_receipt_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          doc_date?: string;
          id?: string;
          note?: string | null;
          number?: string | null;
          organization_id?: string;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id?: string;
          purchase_request_id?: string | null;
          received_at?: string;
          status?: Database["public"]["Enums"]["goods_receipt_status"];
          supplier_id?: string;
          supplier_invoice_id?: string | null;
          updated_at?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goods_receipts_corrects_receipt_id_fkey";
            columns: ["corrects_receipt_id"];
            isOneToOne: true;
            referencedRelation: "goods_receipts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goods_receipts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goods_receipts_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "goods_receipts_purchase_request_id_organization_id_project_fkey";
            columns: ["purchase_request_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requests";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "goods_receipts_supplier_id_organization_id_fkey";
            columns: ["supplier_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "goods_receipts_supplier_invoice_id_organization_id_project_fkey";
            columns: ["supplier_invoice_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "supplier_invoices";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "goods_receipts_supplier_invoice_id_organization_id_project_fkey";
            columns: ["supplier_invoice_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "supplier_invoices_priced";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "goods_receipts_warehouse_id_organization_id_project_id_fkey";
            columns: ["warehouse_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
        ];
      };
      idempotency_keys: {
        Row: {
          created_at: string;
          key: string;
          operation: string;
          organization_id: string;
          response: Json | null;
          target_id: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          key: string;
          operation: string;
          organization_id: string;
          response?: Json | null;
          target_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          key?: string;
          operation?: string;
          organization_id?: string;
          response?: Json | null;
          target_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      material_issue_items: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          line_no: number;
          material_id: string;
          material_issue_id: string;
          organization_id: string;
          project_id: string;
          quantity: number;
          unit_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          line_no: number;
          material_id: string;
          material_issue_id: string;
          organization_id: string;
          project_id: string;
          quantity: number;
          unit_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          line_no?: number;
          material_id?: string;
          material_issue_id?: string;
          organization_id?: string;
          project_id?: string;
          quantity?: number;
          unit_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "material_issue_items_material_id_organization_id_fkey";
            columns: ["material_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "material_issue_items_material_issue_id_organization_id_pro_fkey";
            columns: ["material_issue_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "material_issues";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
        ];
      };
      material_issues: {
        Row: {
          block_id: string;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          created_by: string | null;
          crew_id: string;
          doc_date: string;
          floor_id: string;
          id: string;
          note: string | null;
          number: string | null;
          organization_id: string;
          posted_at: string | null;
          posted_by: string | null;
          project_id: string;
          received_by_name: string | null;
          status: Database["public"]["Enums"]["issue_status"];
          updated_at: string;
          warehouse_id: string;
        };
        Insert: {
          block_id: string;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          crew_id: string;
          doc_date?: string;
          floor_id: string;
          id?: string;
          note?: string | null;
          number?: string | null;
          organization_id: string;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id: string;
          received_by_name?: string | null;
          status?: Database["public"]["Enums"]["issue_status"];
          updated_at?: string;
          warehouse_id: string;
        };
        Update: {
          block_id?: string;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          crew_id?: string;
          doc_date?: string;
          floor_id?: string;
          id?: string;
          note?: string | null;
          number?: string | null;
          organization_id?: string;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id?: string;
          received_by_name?: string | null;
          status?: Database["public"]["Enums"]["issue_status"];
          updated_at?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "material_issues_block_id_project_id_fkey";
            columns: ["block_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "blocks";
            referencedColumns: ["id", "project_id"];
          },
          {
            foreignKeyName: "material_issues_crew_id_organization_id_fkey";
            columns: ["crew_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "crews";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "material_issues_floor_id_block_id_fkey";
            columns: ["floor_id", "block_id"];
            isOneToOne: false;
            referencedRelation: "floors";
            referencedColumns: ["id", "block_id"];
          },
          {
            foreignKeyName: "material_issues_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "material_issues_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "material_issues_warehouse_id_organization_id_project_id_fkey";
            columns: ["warehouse_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
        ];
      };
      material_return_items: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          line_no: number;
          material_id: string;
          material_issue_item_id: string;
          material_return_id: string;
          organization_id: string;
          project_id: string;
          quantity: number;
          unit_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          line_no: number;
          material_id: string;
          material_issue_item_id: string;
          material_return_id: string;
          organization_id: string;
          project_id: string;
          quantity: number;
          unit_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          line_no?: number;
          material_id?: string;
          material_issue_item_id?: string;
          material_return_id?: string;
          organization_id?: string;
          project_id?: string;
          quantity?: number;
          unit_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "material_return_items_material_id_organization_id_fkey";
            columns: ["material_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "material_return_items_material_issue_item_id_fkey";
            columns: ["material_issue_item_id"];
            isOneToOne: false;
            referencedRelation: "material_issue_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "material_return_items_material_return_id_organization_id_p_fkey";
            columns: ["material_return_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "material_returns";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
        ];
      };
      material_returns: {
        Row: {
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          created_by: string | null;
          crew_id: string;
          doc_date: string;
          id: string;
          material_issue_id: string;
          note: string | null;
          number: string | null;
          organization_id: string;
          posted_at: string | null;
          posted_by: string | null;
          project_id: string;
          status: Database["public"]["Enums"]["issue_status"];
          updated_at: string;
          warehouse_id: string;
        };
        Insert: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          crew_id: string;
          doc_date?: string;
          id?: string;
          material_issue_id: string;
          note?: string | null;
          number?: string | null;
          organization_id: string;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id: string;
          status?: Database["public"]["Enums"]["issue_status"];
          updated_at?: string;
          warehouse_id: string;
        };
        Update: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          crew_id?: string;
          doc_date?: string;
          id?: string;
          material_issue_id?: string;
          note?: string | null;
          number?: string | null;
          organization_id?: string;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id?: string;
          status?: Database["public"]["Enums"]["issue_status"];
          updated_at?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "material_returns_crew_id_organization_id_fkey";
            columns: ["crew_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "crews";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "material_returns_material_issue_id_organization_id_project_fkey";
            columns: ["material_issue_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "material_issues";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "material_returns_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "material_returns_warehouse_id_organization_id_project_id_fkey";
            columns: ["warehouse_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
        ];
      };
      materials: {
        Row: {
          category: string | null;
          code: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          name: string;
          organization_id: string;
          unit_id: string;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          organization_id: string;
          unit_id: string;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          organization_id?: string;
          unit_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "materials_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "materials_unit_id_organization_id_fkey";
            columns: ["unit_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "units_of_measure";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      member_roles: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          member_id: string;
          organization_id: string;
          role_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          member_id: string;
          organization_id: string;
          role_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          member_id?: string;
          organization_id?: string;
          role_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_roles_member_id_organization_id_fkey";
            columns: ["member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_members";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "member_roles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_roles_role_id_organization_id_fkey";
            columns: ["role_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      opening_balances: {
        Row: {
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          created_by: string | null;
          doc_date: string;
          id: string;
          kind: Database["public"]["Enums"]["opening_kind"];
          note: string | null;
          number: string | null;
          organization_id: string;
          posted_at: string | null;
          posted_by: string | null;
          project_id: string | null;
          status: Database["public"]["Enums"]["opening_status"];
          updated_at: string;
          warehouse_id: string | null;
        };
        Insert: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          doc_date?: string;
          id?: string;
          kind: Database["public"]["Enums"]["opening_kind"];
          note?: string | null;
          number?: string | null;
          organization_id: string;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id?: string | null;
          status?: Database["public"]["Enums"]["opening_status"];
          updated_at?: string;
          warehouse_id?: string | null;
        };
        Update: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          doc_date?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["opening_kind"];
          note?: string | null;
          number?: string | null;
          organization_id?: string;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id?: string | null;
          status?: Database["public"]["Enums"]["opening_status"];
          updated_at?: string;
          warehouse_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "opening_balances_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "opening_balances_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "opening_balances_warehouse_id_organization_id_project_id_fkey";
            columns: ["warehouse_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
        ];
      };
      opening_cash_items: {
        Row: {
          amount: number;
          cash_account_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          line_no: number;
          opening_balance_id: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          cash_account_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          line_no: number;
          opening_balance_id: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          cash_account_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          line_no?: number;
          opening_balance_id?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "opening_cash_items_cash_account_id_organization_id_fkey";
            columns: ["cash_account_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "cash_accounts";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "opening_cash_items_opening_balance_id_organization_id_fkey";
            columns: ["opening_balance_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "opening_balances";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      opening_payable_items: {
        Row: {
          amount: number;
          basis: string;
          created_at: string;
          created_by: string | null;
          currency: string;
          due_date: string | null;
          id: string;
          line_no: number;
          opening_balance_id: string;
          organization_id: string;
          project_id: string | null;
          supplier_id: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          basis: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          due_date?: string | null;
          id?: string;
          line_no: number;
          opening_balance_id: string;
          organization_id: string;
          project_id?: string | null;
          supplier_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          basis?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          due_date?: string | null;
          id?: string;
          line_no?: number;
          opening_balance_id?: string;
          organization_id?: string;
          project_id?: string | null;
          supplier_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "opening_payable_items_opening_balance_id_organization_id_fkey";
            columns: ["opening_balance_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "opening_balances";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "opening_payable_items_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "opening_payable_items_supplier_id_organization_id_fkey";
            columns: ["supplier_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      opening_stock_items: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          line_no: number;
          material_id: string;
          opening_balance_id: string;
          organization_id: string;
          quantity: number;
          unit_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          line_no: number;
          material_id: string;
          opening_balance_id: string;
          organization_id: string;
          quantity: number;
          unit_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          line_no?: number;
          material_id?: string;
          opening_balance_id?: string;
          organization_id?: string;
          quantity?: number;
          unit_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "opening_stock_items_material_id_organization_id_fkey";
            columns: ["material_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "opening_stock_items_opening_balance_id_organization_id_fkey";
            columns: ["opening_balance_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "opening_balances";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      organization_members: {
        Row: {
          all_projects: boolean;
          created_at: string;
          created_by: string | null;
          email: string;
          full_name: string;
          id: string;
          invited_at: string | null;
          invited_by: string | null;
          is_active: boolean;
          organization_id: string;
          phone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          all_projects?: boolean;
          created_at?: string;
          created_by?: string | null;
          email: string;
          full_name: string;
          id?: string;
          invited_at?: string | null;
          invited_by?: string | null;
          is_active?: boolean;
          organization_id: string;
          phone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          all_projects?: boolean;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          full_name?: string;
          id?: string;
          invited_at?: string | null;
          invited_by?: string | null;
          is_active?: boolean;
          organization_id?: string;
          phone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          created_by: string | null;
          default_currency: string;
          id: string;
          name: string;
          tax_id: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          default_currency?: string;
          id?: string;
          name: string;
          tax_id?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          default_currency?: string;
          id?: string;
          name?: string;
          tax_id?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payables: {
        Row: {
          amount: number;
          basis: string | null;
          counterparty_kind: Database["public"]["Enums"]["payable_counterparty"];
          created_at: string;
          created_by: string | null;
          crew_id: string | null;
          currency: string;
          due_date: string | null;
          id: string;
          organization_id: string;
          paid_amount: number;
          project_id: string | null;
          source_doc_id: string;
          source_doc_type: Database["public"]["Enums"]["document_type"];
          status: Database["public"]["Enums"]["payable_status"];
          supplier_id: string | null;
          updated_at: string;
        };
        Insert: {
          amount: number;
          basis?: string | null;
          counterparty_kind: Database["public"]["Enums"]["payable_counterparty"];
          created_at?: string;
          created_by?: string | null;
          crew_id?: string | null;
          currency: string;
          due_date?: string | null;
          id?: string;
          organization_id: string;
          paid_amount?: number;
          project_id?: string | null;
          source_doc_id: string;
          source_doc_type: Database["public"]["Enums"]["document_type"];
          status?: Database["public"]["Enums"]["payable_status"];
          supplier_id?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          basis?: string | null;
          counterparty_kind?: Database["public"]["Enums"]["payable_counterparty"];
          created_at?: string;
          created_by?: string | null;
          crew_id?: string | null;
          currency?: string;
          due_date?: string | null;
          id?: string;
          organization_id?: string;
          paid_amount?: number;
          project_id?: string | null;
          source_doc_id?: string;
          source_doc_type?: Database["public"]["Enums"]["document_type"];
          status?: Database["public"]["Enums"]["payable_status"];
          supplier_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payables_crew_id_organization_id_fkey";
            columns: ["crew_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "crews";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "payables_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payables_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "payables_supplier_id_organization_id_fkey";
            columns: ["supplier_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      payment_requests: {
        Row: {
          amount: number;
          approved_at: string | null;
          approved_by: string | null;
          basis: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          doc_date: string;
          id: string;
          note: string | null;
          number: string | null;
          organization_id: string;
          paid_amount: number;
          payee_crew_id: string | null;
          payee_name: string | null;
          posted_at: string | null;
          posted_by: string | null;
          project_id: string | null;
          purpose: Database["public"]["Enums"]["payment_purpose"];
          status: Database["public"]["Enums"]["payment_request_status"];
          status_comment: string | null;
          updated_at: string;
        };
        Insert: {
          amount: number;
          approved_at?: string | null;
          approved_by?: string | null;
          basis?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          doc_date?: string;
          id?: string;
          note?: string | null;
          number?: string | null;
          organization_id: string;
          paid_amount?: number;
          payee_crew_id?: string | null;
          payee_name?: string | null;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id?: string | null;
          purpose: Database["public"]["Enums"]["payment_purpose"];
          status?: Database["public"]["Enums"]["payment_request_status"];
          status_comment?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          approved_at?: string | null;
          approved_by?: string | null;
          basis?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          doc_date?: string;
          id?: string;
          note?: string | null;
          number?: string | null;
          organization_id?: string;
          paid_amount?: number;
          payee_crew_id?: string | null;
          payee_name?: string | null;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id?: string | null;
          purpose?: Database["public"]["Enums"]["payment_purpose"];
          status?: Database["public"]["Enums"]["payment_request_status"];
          status_comment?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_requests_payee_crew_id_organization_id_fkey";
            columns: ["payee_crew_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "crews";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "payment_requests_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      permissions: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          id: string;
          organization_id: string;
          role_id: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id: string;
          role_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id?: string;
          role_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "permissions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "permissions_role_id_organization_id_fkey";
            columns: ["role_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      project_members: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          member_id: string;
          organization_id: string;
          project_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          member_id: string;
          organization_id: string;
          project_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          member_id?: string;
          organization_id?: string;
          project_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_members_member_id_organization_id_fkey";
            columns: ["member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_members";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "project_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_members_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      projects: {
        Row: {
          address: string | null;
          code: string;
          created_at: string;
          created_by: string | null;
          end_date: string | null;
          id: string;
          name: string;
          organization_id: string;
          start_date: string | null;
          status: Database["public"]["Enums"]["project_status"];
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          code: string;
          created_at?: string;
          created_by?: string | null;
          end_date?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["project_status"];
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          end_date?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["project_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_request_items: {
        Row: {
          amount: number | null;
          created_at: string;
          created_by: string | null;
          id: string;
          line_no: number;
          material_id: string;
          note: string | null;
          organization_id: string;
          price: number | null;
          project_id: string;
          purchase_request_id: string;
          quantity: number;
          supplier_id: string | null;
          unit_id: string;
          updated_at: string;
        };
        Insert: {
          amount?: number | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          line_no: number;
          material_id: string;
          note?: string | null;
          organization_id: string;
          price?: number | null;
          project_id: string;
          purchase_request_id: string;
          quantity: number;
          supplier_id?: string | null;
          unit_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          line_no?: number;
          material_id?: string;
          note?: string | null;
          organization_id?: string;
          price?: number | null;
          project_id?: string;
          purchase_request_id?: string;
          quantity?: number;
          supplier_id?: string | null;
          unit_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_request_items_material_id_organization_id_fkey";
            columns: ["material_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "purchase_request_items_purchase_request_id_organization_id_fkey";
            columns: ["purchase_request_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requests";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "purchase_request_items_supplier_id_organization_id_fkey";
            columns: ["supplier_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      purchase_requests: {
        Row: {
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          doc_date: string;
          has_discrepancy: boolean;
          id: string;
          needed_by: string | null;
          note: string | null;
          number: string | null;
          organization_id: string;
          posted_at: string | null;
          posted_by: string | null;
          project_id: string;
          status: Database["public"]["Enums"]["purchase_request_status"];
          status_comment: string | null;
          updated_at: string;
          warehouse_id: string;
        };
        Insert: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          doc_date?: string;
          has_discrepancy?: boolean;
          id?: string;
          needed_by?: string | null;
          note?: string | null;
          number?: string | null;
          organization_id: string;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id: string;
          status?: Database["public"]["Enums"]["purchase_request_status"];
          status_comment?: string | null;
          updated_at?: string;
          warehouse_id: string;
        };
        Update: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          doc_date?: string;
          has_discrepancy?: boolean;
          id?: string;
          needed_by?: string | null;
          note?: string | null;
          number?: string | null;
          organization_id?: string;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id?: string;
          status?: Database["public"]["Enums"]["purchase_request_status"];
          status_comment?: string | null;
          updated_at?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_requests_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "purchase_requests_warehouse_id_organization_id_project_id_fkey";
            columns: ["warehouse_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
        ];
      };
      roles: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          id: string;
          is_system: boolean;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_system?: boolean;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_system?: boolean;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_balances: {
        Row: {
          material_id: string;
          organization_id: string;
          project_id: string;
          quantity: number;
          updated_at: string;
          warehouse_id: string;
        };
        Insert: {
          material_id: string;
          organization_id: string;
          project_id: string;
          quantity?: number;
          updated_at?: string;
          warehouse_id: string;
        };
        Update: {
          material_id?: string;
          organization_id?: string;
          project_id?: string;
          quantity?: number;
          updated_at?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_balances_material_id_organization_id_fkey";
            columns: ["material_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "stock_balances_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_balances_warehouse_id_organization_id_project_id_fkey";
            columns: ["warehouse_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          material_id: string;
          movement_type: Database["public"]["Enums"]["stock_movement_type"];
          occurred_on: string;
          organization_id: string;
          project_id: string;
          quantity: number;
          reversal_of_id: string | null;
          source_doc_id: string;
          source_doc_type: Database["public"]["Enums"]["document_type"];
          source_line_id: string | null;
          unit_id: string;
          warehouse_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          material_id: string;
          movement_type: Database["public"]["Enums"]["stock_movement_type"];
          occurred_on: string;
          organization_id: string;
          project_id: string;
          quantity: number;
          reversal_of_id?: string | null;
          source_doc_id: string;
          source_doc_type: Database["public"]["Enums"]["document_type"];
          source_line_id?: string | null;
          unit_id: string;
          warehouse_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          material_id?: string;
          movement_type?: Database["public"]["Enums"]["stock_movement_type"];
          occurred_on?: string;
          organization_id?: string;
          project_id?: string;
          quantity?: number;
          reversal_of_id?: string | null;
          source_doc_id?: string;
          source_doc_type?: Database["public"]["Enums"]["document_type"];
          source_line_id?: string | null;
          unit_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_material_id_organization_id_fkey";
            columns: ["material_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "stock_movements_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_reversal_of_id_fkey";
            columns: ["reversal_of_id"];
            isOneToOne: true;
            referencedRelation: "stock_movements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_organization_id_project_id_fkey";
            columns: ["warehouse_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
        ];
      };
      supplier_invoice_items: {
        Row: {
          amount: number | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          line_no: number;
          material_id: string | null;
          organization_id: string;
          price: number;
          project_id: string;
          purchase_request_item_id: string | null;
          quantity: number;
          supplier_invoice_id: string;
          unit_id: string;
          updated_at: string;
        };
        Insert: {
          amount?: number | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          line_no: number;
          material_id?: string | null;
          organization_id: string;
          price: number;
          project_id: string;
          purchase_request_item_id?: string | null;
          quantity: number;
          supplier_invoice_id: string;
          unit_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          line_no?: number;
          material_id?: string | null;
          organization_id?: string;
          price?: number;
          project_id?: string;
          purchase_request_item_id?: string | null;
          quantity?: number;
          supplier_invoice_id?: string;
          unit_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_items_material_id_organization_id_fkey";
            columns: ["material_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "supplier_invoice_items_purchase_request_item_id_fkey";
            columns: ["purchase_request_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_request_fulfillment";
            referencedColumns: ["purchase_request_item_id"];
          },
          {
            foreignKeyName: "supplier_invoice_items_purchase_request_item_id_fkey";
            columns: ["purchase_request_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_request_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_invoice_items_purchase_request_item_id_fkey";
            columns: ["purchase_request_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_request_items_priced";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_invoice_items_supplier_invoice_id_organization_id_fkey";
            columns: ["supplier_invoice_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "supplier_invoices";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "supplier_invoice_items_supplier_invoice_id_organization_id_fkey";
            columns: ["supplier_invoice_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "supplier_invoices_priced";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "supplier_invoice_items_unit_id_organization_id_fkey";
            columns: ["unit_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "units_of_measure";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      supplier_invoices: {
        Row: {
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          doc_date: string;
          id: string;
          note: string | null;
          number: string | null;
          organization_id: string;
          posted_at: string | null;
          posted_by: string | null;
          project_id: string;
          purchase_request_id: string | null;
          status: Database["public"]["Enums"]["supplier_invoice_status"];
          supplier_doc_date: string;
          supplier_doc_number: string;
          supplier_id: string;
          total_amount: number;
          updated_at: string;
        };
        Insert: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          doc_date?: string;
          id?: string;
          note?: string | null;
          number?: string | null;
          organization_id: string;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id: string;
          purchase_request_id?: string | null;
          status?: Database["public"]["Enums"]["supplier_invoice_status"];
          supplier_doc_date: string;
          supplier_doc_number: string;
          supplier_id: string;
          total_amount?: number;
          updated_at?: string;
        };
        Update: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          doc_date?: string;
          id?: string;
          note?: string | null;
          number?: string | null;
          organization_id?: string;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id?: string;
          purchase_request_id?: string | null;
          status?: Database["public"]["Enums"]["supplier_invoice_status"];
          supplier_doc_date?: string;
          supplier_doc_number?: string;
          supplier_id?: string;
          total_amount?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_invoices_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "supplier_invoices_purchase_request_id_organization_id_proj_fkey";
            columns: ["purchase_request_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requests";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_organization_id_fkey";
            columns: ["supplier_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      suppliers: {
        Row: {
          address: string | null;
          contact_person: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          name: string;
          organization_id: string;
          phone: string | null;
          tax_id: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          contact_person?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          organization_id: string;
          phone?: string | null;
          tax_id?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          contact_person?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          organization_id?: string;
          phone?: string | null;
          tax_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      task_comments: {
        Row: {
          body: string;
          created_at: string;
          created_by: string | null;
          id: string;
          organization_id: string;
          project_id: string;
          task_id: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id: string;
          project_id: string;
          task_id: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id?: string;
          project_id?: string;
          task_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_organization_id_project_id_fkey";
            columns: ["task_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
        ];
      };
      tasks: {
        Row: {
          assignee_member_id: string;
          block_id: string | null;
          blocked_reason: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          due_date: string | null;
          floor_id: string | null;
          id: string;
          number: string | null;
          organization_id: string;
          posted_at: string | null;
          priority: Database["public"]["Enums"]["task_priority"];
          project_id: string;
          status: Database["public"]["Enums"]["task_status"];
          status_comment: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          assignee_member_id: string;
          block_id?: string | null;
          blocked_reason?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_date?: string | null;
          floor_id?: string | null;
          id?: string;
          number?: string | null;
          organization_id: string;
          posted_at?: string | null;
          priority?: Database["public"]["Enums"]["task_priority"];
          project_id: string;
          status?: Database["public"]["Enums"]["task_status"];
          status_comment?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          assignee_member_id?: string;
          block_id?: string | null;
          blocked_reason?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_date?: string | null;
          floor_id?: string | null;
          id?: string;
          number?: string | null;
          organization_id?: string;
          posted_at?: string | null;
          priority?: Database["public"]["Enums"]["task_priority"];
          project_id?: string;
          status?: Database["public"]["Enums"]["task_status"];
          status_comment?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_member_id_organization_id_fkey";
            columns: ["assignee_member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_members";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "tasks_block_id_project_id_fkey";
            columns: ["block_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "blocks";
            referencedColumns: ["id", "project_id"];
          },
          {
            foreignKeyName: "tasks_floor_id_block_id_fkey";
            columns: ["floor_id", "block_id"];
            isOneToOne: false;
            referencedRelation: "floors";
            referencedColumns: ["id", "block_id"];
          },
          {
            foreignKeyName: "tasks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      units_of_measure: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          decimals: number;
          id: string;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          decimals?: number;
          id?: string;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          decimals?: number;
          id?: string;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "units_of_measure_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      warehouses: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          name: string;
          organization_id: string;
          project_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          organization_id: string;
          project_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          organization_id?: string;
          project_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "warehouses_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "warehouses_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      work_completion_acts: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          created_by: string | null;
          crew_id: string;
          currency: string;
          doc_date: string;
          id: string;
          note: string | null;
          number: string | null;
          organization_id: string;
          period_from: string | null;
          period_to: string | null;
          posted_at: string | null;
          posted_by: string | null;
          project_id: string;
          reject_reason: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          replaces_act_id: string | null;
          status: Database["public"]["Enums"]["work_act_status"];
          status_comment: string | null;
          total_amount: number;
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          crew_id: string;
          currency?: string;
          doc_date?: string;
          id?: string;
          note?: string | null;
          number?: string | null;
          organization_id: string;
          period_from?: string | null;
          period_to?: string | null;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id: string;
          reject_reason?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          replaces_act_id?: string | null;
          status?: Database["public"]["Enums"]["work_act_status"];
          status_comment?: string | null;
          total_amount?: number;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          crew_id?: string;
          currency?: string;
          doc_date?: string;
          id?: string;
          note?: string | null;
          number?: string | null;
          organization_id?: string;
          period_from?: string | null;
          period_to?: string | null;
          posted_at?: string | null;
          posted_by?: string | null;
          project_id?: string;
          reject_reason?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          replaces_act_id?: string | null;
          status?: Database["public"]["Enums"]["work_act_status"];
          status_comment?: string | null;
          total_amount?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_completion_acts_crew_id_organization_id_fkey";
            columns: ["crew_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "crews";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "work_completion_acts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_completion_acts_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "work_completion_acts_replaces_act_id_fkey";
            columns: ["replaces_act_id"];
            isOneToOne: false;
            referencedRelation: "work_completion_acts";
            referencedColumns: ["id"];
          },
        ];
      };
      work_completion_items: {
        Row: {
          amount: number | null;
          block_id: string | null;
          created_at: string;
          created_by: string | null;
          floor_id: string | null;
          id: string;
          line_no: number;
          note: string | null;
          organization_id: string;
          project_id: string;
          quantity: number;
          rate: number;
          unit_id: string;
          updated_at: string;
          work_completion_act_id: string;
          work_rate_id: string;
          work_type: string;
        };
        Insert: {
          amount?: number | null;
          block_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          floor_id?: string | null;
          id?: string;
          line_no: number;
          note?: string | null;
          organization_id: string;
          project_id: string;
          quantity: number;
          rate: number;
          unit_id: string;
          updated_at?: string;
          work_completion_act_id: string;
          work_rate_id: string;
          work_type: string;
        };
        Update: {
          amount?: number | null;
          block_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          floor_id?: string | null;
          id?: string;
          line_no?: number;
          note?: string | null;
          organization_id?: string;
          project_id?: string;
          quantity?: number;
          rate?: number;
          unit_id?: string;
          updated_at?: string;
          work_completion_act_id?: string;
          work_rate_id?: string;
          work_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_completion_items_block_id_project_id_fkey";
            columns: ["block_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "blocks";
            referencedColumns: ["id", "project_id"];
          },
          {
            foreignKeyName: "work_completion_items_floor_id_block_id_fkey";
            columns: ["floor_id", "block_id"];
            isOneToOne: false;
            referencedRelation: "floors";
            referencedColumns: ["id", "block_id"];
          },
          {
            foreignKeyName: "work_completion_items_unit_id_organization_id_fkey";
            columns: ["unit_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "units_of_measure";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "work_completion_items_work_completion_act_id_organization__fkey";
            columns: ["work_completion_act_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_completion_acts";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_completion_items_work_rate_id_fkey";
            columns: ["work_rate_id"];
            isOneToOne: false;
            referencedRelation: "work_rates";
            referencedColumns: ["id"];
          },
        ];
      };
      work_rates: {
        Row: {
          created_at: string;
          created_by: string | null;
          crew_id: string;
          currency: string;
          id: string;
          note: string | null;
          organization_id: string;
          project_id: string | null;
          rate: number;
          unit_id: string;
          updated_at: string;
          valid_from: string;
          work_type: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          crew_id: string;
          currency?: string;
          id?: string;
          note?: string | null;
          organization_id: string;
          project_id?: string | null;
          rate: number;
          unit_id: string;
          updated_at?: string;
          valid_from: string;
          work_type: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          crew_id?: string;
          currency?: string;
          id?: string;
          note?: string | null;
          organization_id?: string;
          project_id?: string | null;
          rate?: number;
          unit_id?: string;
          updated_at?: string;
          valid_from?: string;
          work_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_rates_crew_id_organization_id_fkey";
            columns: ["crew_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "crews";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "work_rates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_rates_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "work_rates_unit_id_organization_id_fkey";
            columns: ["unit_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "units_of_measure";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
    };
    Views: {
      payments: {
        Row: {
          amount: number | null;
          cash_account_id: string | null;
          cash_transaction_id: string | null;
          currency: string | null;
          doc_date: string | null;
          id: string | null;
          number: string | null;
          organization_id: string | null;
          payable_id: string | null;
          payment_request_id: string | null;
          posted_at: string | null;
          project_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cash_transaction_allocations_payable_id_fkey";
            columns: ["payable_id"];
            isOneToOne: false;
            referencedRelation: "payables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cash_transaction_allocations_payment_request_id_fkey";
            columns: ["payment_request_id"];
            isOneToOne: false;
            referencedRelation: "payment_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_request_fulfillment: {
        Row: {
          diff: number | null;
          line_no: number | null;
          material_id: string | null;
          ordered: number | null;
          organization_id: string | null;
          project_id: string | null;
          purchase_request_id: string | null;
          purchase_request_item_id: string | null;
          received: number | null;
          remaining: number | null;
          supplier_id: string | null;
          unit_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_request_items_material_id_organization_id_fkey";
            columns: ["material_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "purchase_request_items_purchase_request_id_organization_id_fkey";
            columns: ["purchase_request_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requests";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "purchase_request_items_supplier_id_organization_id_fkey";
            columns: ["supplier_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      purchase_request_items_priced: {
        Row: {
          amount: number | null;
          id: string | null;
          line_no: number | null;
          material_id: string | null;
          note: string | null;
          organization_id: string | null;
          price: number | null;
          project_id: string | null;
          purchase_request_id: string | null;
          quantity: number | null;
          supplier_id: string | null;
          unit_id: string | null;
        };
        Insert: {
          amount?: number | null;
          id?: string | null;
          line_no?: number | null;
          material_id?: string | null;
          note?: string | null;
          organization_id?: string | null;
          price?: number | null;
          project_id?: string | null;
          purchase_request_id?: string | null;
          quantity?: number | null;
          supplier_id?: string | null;
          unit_id?: string | null;
        };
        Update: {
          amount?: number | null;
          id?: string | null;
          line_no?: number | null;
          material_id?: string | null;
          note?: string | null;
          organization_id?: string | null;
          price?: number | null;
          project_id?: string | null;
          purchase_request_id?: string | null;
          quantity?: number | null;
          supplier_id?: string | null;
          unit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_request_items_material_id_organization_id_fkey";
            columns: ["material_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "purchase_request_items_purchase_request_id_organization_id_fkey";
            columns: ["purchase_request_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requests";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "purchase_request_items_supplier_id_organization_id_fkey";
            columns: ["supplier_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      supplier_invoice_items_priced: {
        Row: {
          amount: number | null;
          description: string | null;
          id: string | null;
          line_no: number | null;
          material_id: string | null;
          organization_id: string | null;
          price: number | null;
          project_id: string | null;
          purchase_request_item_id: string | null;
          quantity: number | null;
          supplier_invoice_id: string | null;
          unit_id: string | null;
        };
        Insert: {
          amount?: number | null;
          description?: string | null;
          id?: string | null;
          line_no?: number | null;
          material_id?: string | null;
          organization_id?: string | null;
          price?: number | null;
          project_id?: string | null;
          purchase_request_item_id?: string | null;
          quantity?: number | null;
          supplier_invoice_id?: string | null;
          unit_id?: string | null;
        };
        Update: {
          amount?: number | null;
          description?: string | null;
          id?: string | null;
          line_no?: number | null;
          material_id?: string | null;
          organization_id?: string | null;
          price?: number | null;
          project_id?: string | null;
          purchase_request_item_id?: string | null;
          quantity?: number | null;
          supplier_invoice_id?: string | null;
          unit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_items_material_id_organization_id_fkey";
            columns: ["material_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "supplier_invoice_items_purchase_request_item_id_fkey";
            columns: ["purchase_request_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_request_fulfillment";
            referencedColumns: ["purchase_request_item_id"];
          },
          {
            foreignKeyName: "supplier_invoice_items_purchase_request_item_id_fkey";
            columns: ["purchase_request_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_request_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_invoice_items_purchase_request_item_id_fkey";
            columns: ["purchase_request_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_request_items_priced";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_invoice_items_supplier_invoice_id_organization_id_fkey";
            columns: ["supplier_invoice_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "supplier_invoices";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "supplier_invoice_items_supplier_invoice_id_organization_id_fkey";
            columns: ["supplier_invoice_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "supplier_invoices_priced";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "supplier_invoice_items_unit_id_organization_id_fkey";
            columns: ["unit_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "units_of_measure";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      supplier_invoices_priced: {
        Row: {
          currency: string | null;
          id: string | null;
          organization_id: string | null;
          project_id: string | null;
          total_amount: number | null;
        };
        Insert: {
          currency?: string | null;
          id?: string | null;
          organization_id?: string | null;
          project_id?: string | null;
          total_amount?: number | null;
        };
        Update: {
          currency?: string | null;
          id?: string | null;
          organization_id?: string | null;
          project_id?: string | null;
          total_amount?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_invoices_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      task_attachments: {
        Row: {
          created_at: string | null;
          created_by: string | null;
          file_name: string | null;
          id: string | null;
          mime_type: string | null;
          organization_id: string | null;
          project_id: string | null;
          size_bytes: number | null;
          storage_path: string | null;
          task_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          created_by?: string | null;
          file_name?: string | null;
          id?: string | null;
          mime_type?: string | null;
          organization_id?: string | null;
          project_id?: string | null;
          size_bytes?: number | null;
          storage_path?: string | null;
          task_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          created_by?: string | null;
          file_name?: string | null;
          id?: string | null;
          mime_type?: string | null;
          organization_id?: string | null;
          project_id?: string | null;
          size_bytes?: number | null;
          storage_path?: string | null;
          task_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "document_attachments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      add_document_attachment: {
        Args: {
          p_doc_id: string;
          p_doc_type: Database["public"]["Enums"]["document_type"];
          p_file_name: string;
          p_mime_type: string;
          p_size_bytes: number;
          p_storage_path: string;
        };
        Returns: string;
      };
      add_member: {
        Args: {
          p_all_projects: boolean;
          p_email: string;
          p_full_name: string;
          p_org: string;
          p_project_ids: string[];
          p_role_codes: string[];
          p_user_id: string;
        };
        Returns: string;
      };
      add_task_comment: {
        Args: { p_body: string; p_id: string; p_task_id: string };
        Returns: string;
      };
      approve_cash_reversal: {
        Args: { p_comment: string; p_id: string; p_key: string };
        Returns: Json;
      };
      approve_payment_request: {
        Args: { p_id: string; p_key: string };
        Returns: Json;
      };
      approve_receipt_correction: {
        Args: { p_comment: string; p_id: string; p_key: string };
        Returns: Json;
      };
      approve_work_act: { Args: { p_id: string; p_key: string }; Returns: Json };
      cancel_payment_request: {
        Args: { p_id: string; p_key: string; p_reason: string };
        Returns: Json;
      };
      cancel_purchase_request: {
        Args: { p_id: string; p_key: string; p_reason: string };
        Returns: Json;
      };
      cancel_supplier_invoice: {
        Args: { p_id: string; p_key: string; p_reason: string };
        Returns: Json;
      };
      cancel_work_act: {
        Args: { p_id: string; p_key: string; p_reason: string };
        Returns: Json;
      };
      cash_reversals_report: {
        Args: { p_from: string; p_org: string; p_to: string };
        Returns: {
          account_name: string;
          amount: number;
          approved_at: string;
          approved_by: string;
          category: Database["public"]["Enums"]["cash_category"];
          counterparty: string;
          currency: string;
          direction: Database["public"]["Enums"]["cash_direction"];
          doc_date: string;
          initiated_at: string;
          initiated_by: string;
          number: string;
          reason: string;
          reversal_number: string;
          reversed_at: string;
          transaction_id: string;
        }[];
      };
      change_task_status: {
        Args: {
          p_comment: string;
          p_id: string;
          p_key: string;
          p_status: Database["public"]["Enums"]["task_status"];
        };
        Returns: Json;
      };
      check_cash_consistency: {
        Args: { p_org: string };
        Returns: {
          cached: number;
          computed: number;
          entity: string;
          id: string;
        }[];
      };
      check_stock_consistency: {
        Args: { p_org: string };
        Returns: {
          balance: number;
          material_id: string;
          movements_sum: number;
          warehouse_id: string;
        }[];
      };
      close_purchase_request: {
        Args: { p_id: string; p_key: string };
        Returns: Json;
      };
      confirm_supplier_invoice: {
        Args: { p_id: string; p_key: string };
        Returns: Json;
      };
      copy_work_act: {
        Args: { p_new_id: string; p_source: string };
        Returns: string;
      };
      create_organization: {
        Args: {
          p_admin_email: string;
          p_admin_full_name: string;
          p_admin_user_id: string;
          p_name: string;
        };
        Returns: string;
      };
      create_receipt_correction: {
        Args: {
          p_copy_lines: boolean;
          p_new_id: string;
          p_original_id: string;
          p_reason: string;
        };
        Returns: string;
      };
      current_user_requires_mfa: { Args: never; Returns: boolean };
      delete_document_draft: {
        Args: {
          p_doc_type: Database["public"]["Enums"]["document_type"];
          p_id: string;
        };
        Returns: undefined;
      };
      delete_finance_draft: {
        Args: { p_id: string; p_kind: string };
        Returns: undefined;
      };
      delete_opening_balance_draft: {
        Args: { p_id: string };
        Returns: undefined;
      };
      delete_work_act_draft: { Args: { p_id: string }; Returns: undefined };
      find_user_id_by_email: { Args: { p_email: string }; Returns: string };
      issue_purchase_request: {
        Args: { p_id: string; p_key: string };
        Returns: Json;
      };
      mark_purchase_discrepancy: {
        Args: { p_comment: string; p_id: string; p_key: string };
        Returns: Json;
      };
      member_mfa_status: {
        Args: { p_org: string };
        Returns: {
          has_mfa: boolean;
          member_id: string;
        }[];
      };
      my_access: { Args: never; Returns: Json };
      post_cash_transaction: {
        Args: { p_id: string; p_key: string };
        Returns: Json;
      };
      post_goods_receipt: {
        Args: { p_id: string; p_key: string };
        Returns: Json;
      };
      post_material_issue: {
        Args: { p_id: string; p_key: string };
        Returns: Json;
      };
      post_material_return: {
        Args: { p_id: string; p_key: string };
        Returns: Json;
      };
      post_opening_balance: {
        Args: { p_id: string; p_key: string };
        Returns: Json;
      };
      recalculate_stock_balances: {
        Args: { p_warehouse: string };
        Returns: number;
      };
      reject_cash_reversal: {
        Args: { p_comment: string; p_id: string; p_key: string };
        Returns: Json;
      };
      reject_work_act: {
        Args: { p_comment: string; p_id: string; p_key: string };
        Returns: Json;
      };
      report_cash: {
        Args: {
          p_account?: string;
          p_from?: string;
          p_org: string;
          p_to?: string;
        };
        Returns: {
          account_id: string;
          account_name: string;
          closing: number;
          currency: string;
          expense: number;
          income: number;
          opening: number;
        }[];
      };
      report_material_issues: {
        Args: {
          p_block?: string;
          p_crew?: string;
          p_floor?: string;
          p_from?: string;
          p_org: string;
          p_project?: string;
          p_to?: string;
        };
        Returns: {
          block_name: string;
          crew_name: string;
          floor_name: string;
          issued: number;
          material_name: string;
          net: number;
          project_code: string;
          returned: number;
          unit_code: string;
        }[];
      };
      report_payables: {
        Args: {
          p_kind?: Database["public"]["Enums"]["payable_counterparty"];
          p_open_only?: boolean;
          p_org: string;
          p_project?: string;
        };
        Returns: {
          amount: number;
          counterparty_kind: Database["public"]["Enums"]["payable_counterparty"];
          counterparty_name: string;
          currency: string;
          doc_date: string;
          last_payment_date: string;
          paid: number;
          payable_id: string;
          project_code: string;
          remaining: number;
          source_doc_type: Database["public"]["Enums"]["document_type"];
          source_number: string;
          status: Database["public"]["Enums"]["payable_status"];
        }[];
      };
      report_stock_balances: {
        Args: { p_org: string; p_project?: string };
        Returns: {
          material_id: string;
          material_name: string;
          project_code: string;
          project_id: string;
          project_name: string;
          quantity: number;
          unit_code: string;
          warehouse_name: string;
        }[];
      };
      report_work_acts: {
        Args: {
          p_crew?: string;
          p_from?: string;
          p_org: string;
          p_project?: string;
          p_status?: Database["public"]["Enums"]["work_act_status"];
          p_to?: string;
        };
        Returns: {
          act_id: string;
          crew_name: string;
          currency: string;
          doc_date: string;
          number: string;
          paid: number;
          project_code: string;
          remaining: number;
          status: Database["public"]["Enums"]["work_act_status"];
          total: number;
        }[];
      };
      request_cash_reversal: {
        Args: { p_id: string; p_key: string; p_reason: string };
        Returns: Json;
      };
      reset_member_mfa: {
        Args: { p_member_id: string; p_reason: string };
        Returns: number;
      };
      reset_user_mfa_by_service: {
        Args: { p_email: string; p_reason: string };
        Returns: number;
      };
      resolve_purchase_discrepancy: {
        Args: { p_comment: string; p_id: string; p_key: string };
        Returns: Json;
      };
      return_payment_request: {
        Args: { p_comment: string; p_id: string; p_key: string };
        Returns: Json;
      };
      return_receipt_correction: {
        Args: { p_comment: string; p_id: string; p_key: string };
        Returns: Json;
      };
      return_supplier_invoice: {
        Args: { p_id: string; p_key: string };
        Returns: Json;
      };
      reverse_material_issue: {
        Args: { p_id: string; p_key: string; p_reason: string };
        Returns: Json;
      };
      reverse_material_return: {
        Args: { p_id: string; p_key: string; p_reason: string };
        Returns: Json;
      };
      reverse_opening_balance: {
        Args: { p_id: string; p_key: string; p_reason: string };
        Returns: Json;
      };
      save_cash_account: {
        Args: {
          p_account_number: string;
          p_bank_name: string;
          p_currency: string;
          p_id: string;
          p_is_active: boolean;
          p_kind: Database["public"]["Enums"]["cash_account_kind"];
          p_name: string;
          p_org: string;
          p_project_id: string;
        };
        Returns: string;
      };
      save_cash_transaction_draft: {
        Args: {
          p_allocations: Json;
          p_amount: number;
          p_basis: string;
          p_cash_account_id: string;
          p_category: Database["public"]["Enums"]["cash_category"];
          p_counterparty_crew_id: string;
          p_counterparty_name: string;
          p_counterparty_supplier_id: string;
          p_direction: Database["public"]["Enums"]["cash_direction"];
          p_id: string;
          p_note: string;
          p_org: string;
          p_project_id: string;
        };
        Returns: string;
      };
      save_goods_receipt_draft: {
        Args: {
          p_correction_reason: string;
          p_id: string;
          p_lines: Json;
          p_note: string;
          p_project_id: string;
          p_purchase_request_id: string;
          p_supplier_id: string;
        };
        Returns: string;
      };
      save_material_issue_draft: {
        Args: {
          p_block_id: string;
          p_crew_id: string;
          p_floor_id: string;
          p_id: string;
          p_lines: Json;
          p_note: string;
          p_project_id: string;
          p_received_by_name: string;
        };
        Returns: string;
      };
      save_material_return_draft: {
        Args: {
          p_id: string;
          p_lines: Json;
          p_material_issue_id: string;
          p_note: string;
        };
        Returns: string;
      };
      save_opening_balance_draft: {
        Args: {
          p_doc_date: string;
          p_id: string;
          p_kind: Database["public"]["Enums"]["opening_kind"];
          p_lines: Json;
          p_note: string;
          p_org: string;
          p_project_id: string;
        };
        Returns: string;
      };
      save_payment_request_draft: {
        Args: {
          p_amount: number;
          p_basis: string;
          p_currency: string;
          p_id: string;
          p_note: string;
          p_org: string;
          p_payee_crew_id: string;
          p_payee_name: string;
          p_project_id: string;
          p_purpose: Database["public"]["Enums"]["payment_purpose"];
        };
        Returns: string;
      };
      save_purchase_request_draft: {
        Args: {
          p_currency: string;
          p_id: string;
          p_lines: Json;
          p_needed_by: string;
          p_note: string;
          p_project_id: string;
        };
        Returns: string;
      };
      save_supplier_invoice_draft: {
        Args: {
          p_currency: string;
          p_id: string;
          p_lines: Json;
          p_note: string;
          p_project_id: string;
          p_purchase_request_id: string;
          p_supplier_doc_date: string;
          p_supplier_doc_number: string;
          p_supplier_id: string;
        };
        Returns: string;
      };
      save_task: {
        Args: {
          p_assignee_member_id: string;
          p_block_id: string;
          p_description: string;
          p_due_date: string;
          p_floor_id: string;
          p_id: string;
          p_priority: Database["public"]["Enums"]["task_priority"];
          p_project_id: string;
          p_title: string;
        };
        Returns: Json;
      };
      save_work_act_draft: {
        Args: {
          p_crew_id: string;
          p_doc_date: string;
          p_id: string;
          p_lines: Json;
          p_note: string;
          p_period_from: string;
          p_period_to: string;
          p_project_id: string;
        };
        Returns: string;
      };
      save_work_rate: {
        Args: {
          p_crew_id: string;
          p_currency: string;
          p_id: string;
          p_note: string;
          p_project_id: string;
          p_rate: number;
          p_unit_id: string;
          p_valid_from: string;
          p_work_type: string;
        };
        Returns: string;
      };
      set_member_projects: {
        Args: {
          p_all_projects: boolean;
          p_member_id: string;
          p_project_ids: string[];
        };
        Returns: undefined;
      };
      set_member_roles: {
        Args: { p_member_id: string; p_role_codes: string[] };
        Returns: undefined;
      };
      start_purchase_review: {
        Args: { p_id: string; p_key: string };
        Returns: Json;
      };
      submit_payment_request: {
        Args: { p_id: string; p_key: string };
        Returns: Json;
      };
      submit_receipt_correction: {
        Args: { p_id: string; p_key: string };
        Returns: Json;
      };
      submit_supplier_invoice: {
        Args: { p_id: string; p_key: string };
        Returns: Json;
      };
      submit_work_act: { Args: { p_id: string; p_key: string }; Returns: Json };
      task_assignees: {
        Args: { p_project_id: string };
        Returns: {
          full_name: string;
          member_id: string;
          roles: string[];
        }[];
      };
      update_member: {
        Args: {
          p_all_projects: boolean;
          p_full_name: string;
          p_is_active: boolean;
          p_member_id: string;
          p_phone: string;
          p_project_ids: string[];
          p_role_codes: string[];
        };
        Returns: undefined;
      };
      work_act_duplicates: {
        Args: { p_id: string };
        Returns: {
          act_id: string;
          block_name: string;
          doc_date: string;
          floor_name: string;
          number: string;
          quantity: number;
          status: Database["public"]["Enums"]["work_act_status"];
          work_type: string;
        }[];
      };
    };
    Enums: {
      approval_action: "SUBMIT" | "APPROVE" | "REJECT" | "RETURN" | "CANCEL" | "COMMENT";
      approval_status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
      cash_account_kind: "CASH" | "BANK";
      cash_category:
        | "APARTMENT_SALE"
        | "OWNER_FUNDS"
        | "OTHER_INCOME"
        | "SUPPLIER"
        | "CREW_ACT"
        | "OTHER_EXPENSE"
        | "SALARY"
        | "CREW_EXTRA"
        | "OPENING_BALANCE";
      cash_direction: "IN" | "OUT";
      cash_tx_kind: "REGULAR" | "REVERSAL" | "OPENING";
      cash_tx_status: "DRAFT" | "POSTED" | "REVERSED";
      document_type:
        | "PURCHASE_REQUEST"
        | "SUPPLIER_INVOICE"
        | "GOODS_RECEIPT"
        | "MATERIAL_ISSUE"
        | "MATERIAL_RETURN"
        | "PAYMENT_REQUEST"
        | "CASH_IN"
        | "CASH_OUT"
        | "WORK_ACT"
        | "TASK"
        | "OPENING_BALANCE";
      goods_receipt_status: "DRAFT" | "CORRECTION_APPROVAL" | "POSTED" | "CORRECTED";
      issue_status: "DRAFT" | "POSTED" | "REVERSED";
      opening_kind: "STOCK" | "CASH" | "PAYABLES";
      opening_status: "DRAFT" | "POSTED" | "REVERSED";
      payable_counterparty: "SUPPLIER" | "CREW";
      payable_status: "OPEN" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
      payment_purpose: "OTHER_EXPENSE" | "SALARY" | "CREW_EXTRA";
      payment_request_status:
        "DRAFT" | "APPROVAL" | "APPROVED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
      project_status: "ACTIVE" | "ARCHIVED";
      purchase_request_status:
        | "DRAFT"
        | "ISSUED"
        | "PARTIALLY_RECEIVED"
        | "RECEIVED"
        | "ACCOUNTING_REVIEW"
        | "DISCREPANCY"
        | "CLOSED"
        | "CANCELLED";
      stock_movement_type:
        | "RECEIPT"
        | "RECEIPT_REVERSAL"
        | "ISSUE"
        | "ISSUE_REVERSAL"
        | "RETURN"
        | "RETURN_REVERSAL"
        | "OPENING"
        | "ADJUSTMENT"
        | "OPENING_REVERSAL";
      supplier_invoice_status: "ENTERED" | "UNDER_REVIEW" | "CONFIRMED" | "CANCELLED";
      task_priority: "LOW" | "NORMAL" | "HIGH";
      task_status: "NEW" | "IN_PROGRESS" | "ON_REVIEW" | "DONE" | "BLOCKED" | "CANCELLED";
      work_act_status: "DRAFT" | "REVIEW" | "APPROVED" | "REJECTED" | "CANCELLED";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      approval_action: ["SUBMIT", "APPROVE", "REJECT", "RETURN", "CANCEL", "COMMENT"],
      approval_status: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
      cash_account_kind: ["CASH", "BANK"],
      cash_category: [
        "APARTMENT_SALE",
        "OWNER_FUNDS",
        "OTHER_INCOME",
        "SUPPLIER",
        "CREW_ACT",
        "OTHER_EXPENSE",
        "SALARY",
        "CREW_EXTRA",
        "OPENING_BALANCE",
      ],
      cash_direction: ["IN", "OUT"],
      cash_tx_kind: ["REGULAR", "REVERSAL", "OPENING"],
      cash_tx_status: ["DRAFT", "POSTED", "REVERSED"],
      document_type: [
        "PURCHASE_REQUEST",
        "SUPPLIER_INVOICE",
        "GOODS_RECEIPT",
        "MATERIAL_ISSUE",
        "MATERIAL_RETURN",
        "PAYMENT_REQUEST",
        "CASH_IN",
        "CASH_OUT",
        "WORK_ACT",
        "TASK",
        "OPENING_BALANCE",
      ],
      goods_receipt_status: ["DRAFT", "CORRECTION_APPROVAL", "POSTED", "CORRECTED"],
      issue_status: ["DRAFT", "POSTED", "REVERSED"],
      opening_kind: ["STOCK", "CASH", "PAYABLES"],
      opening_status: ["DRAFT", "POSTED", "REVERSED"],
      payable_counterparty: ["SUPPLIER", "CREW"],
      payable_status: ["OPEN", "PARTIALLY_PAID", "PAID", "CANCELLED"],
      payment_purpose: ["OTHER_EXPENSE", "SALARY", "CREW_EXTRA"],
      payment_request_status: [
        "DRAFT",
        "APPROVAL",
        "APPROVED",
        "PARTIALLY_PAID",
        "PAID",
        "CANCELLED",
      ],
      project_status: ["ACTIVE", "ARCHIVED"],
      purchase_request_status: [
        "DRAFT",
        "ISSUED",
        "PARTIALLY_RECEIVED",
        "RECEIVED",
        "ACCOUNTING_REVIEW",
        "DISCREPANCY",
        "CLOSED",
        "CANCELLED",
      ],
      stock_movement_type: [
        "RECEIPT",
        "RECEIPT_REVERSAL",
        "ISSUE",
        "ISSUE_REVERSAL",
        "RETURN",
        "RETURN_REVERSAL",
        "OPENING",
        "ADJUSTMENT",
        "OPENING_REVERSAL",
      ],
      supplier_invoice_status: ["ENTERED", "UNDER_REVIEW", "CONFIRMED", "CANCELLED"],
      task_priority: ["LOW", "NORMAL", "HIGH"],
      task_status: ["NEW", "IN_PROGRESS", "ON_REVIEW", "DONE", "BLOCKED", "CANCELLED"],
      work_act_status: ["DRAFT", "REVIEW", "APPROVED", "REJECTED", "CANCELLED"],
    },
  },
} as const;
