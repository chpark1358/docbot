export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ChunkChatSource = {
  type?: "chunk";
  id: string;
  order: number;
  similarity: number;
  snippet?: string;
  doc_title?: string;
};

export type UrlChatSource = {
  type: "url";
  url: string;
  order: number;
  title?: string;
};

export type ChatSource = ChunkChatSource | UrlChatSource;

export interface Database {
  public: {
    Tables: {
      documents: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          storage_path: string;
          mime_type: string;
          size: number;
          status: "queued" | "processing" | "ready" | "failed";
          error_message: string | null;
          is_shared: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          storage_path: string;
          mime_type: string;
          size: number;
          status?: "queued" | "processing" | "ready" | "failed";
          error_message?: string | null;
          is_shared?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          storage_path?: string;
          mime_type?: string;
          size?: number;
          status?: "queued" | "processing" | "ready" | "failed";
          error_message?: string | null;
          is_shared?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      document_chunks: {
        Row: {
          id: string;
          document_id: string;
          user_id: string;
          content: string;
          embedding: number[];
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          user_id: string;
          content: string;
          embedding: number[];
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          user_id?: string;
          content?: string;
          embedding?: number[];
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      chat_threads: {
        Row: {
          id: string;
          document_id: string;
          user_id: string;
          title: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          user_id: string;
          title: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          user_id?: string;
          title?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          thread_id: string;
          user_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          sources: ChatSource[];
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          user_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          sources?: ChatSource[];
          created_at?: string;
        };
        Update: {
          id?: string;
          thread_id?: string;
          user_id?: string;
          role?: "user" | "assistant" | "system";
          content?: string;
          sources?: ChatSource[];
          created_at?: string;
        };
        Relationships: [];
      };
      zendesk_raw_tickets: {
        Row: {
          id: number;
          subject: string | null;
          requester: string | null;
          assignee: string | null;
          status: string | null;
          tags: string[] | null;
          solved_at: string | null;
          body_json: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          subject?: string | null;
          requester?: string | null;
          assignee?: string | null;
          status?: string | null;
          tags?: string[] | null;
          solved_at?: string | null;
          body_json?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          subject?: string | null;
          requester?: string | null;
          assignee?: string | null;
          status?: string | null;
          tags?: string[] | null;
          solved_at?: string | null;
          body_json?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      zendesk_clean: {
        Row: {
          id: number;
          raw_id: number | null;
          clean_question: string | null;
          clean_answer: string | null;
          environment_info: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          raw_id?: number | null;
          clean_question?: string | null;
          clean_answer?: string | null;
          environment_info?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          raw_id?: number | null;
          clean_question?: string | null;
          clean_answer?: string | null;
          environment_info?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      zendesk_intent: {
        Row: {
          id: number;
          clean_id: number | null;
          intent_category: string | null;
          core_problem: string | null;
          condition: string | null;
          suspected_cause: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          clean_id?: number | null;
          intent_category?: string | null;
          core_problem?: string | null;
          condition?: string | null;
          suspected_cause?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          clean_id?: number | null;
          intent_category?: string | null;
          core_problem?: string | null;
          condition?: string | null;
          suspected_cause?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      zendesk_solution: {
        Row: {
          id: number;
          intent_id: number | null;
          solution_steps: Json | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          intent_id?: number | null;
          solution_steps?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          intent_id?: number | null;
          solution_steps?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      zendesk_faq: {
        Row: {
          id: number;
          intent_id: number | null;
          faq_question: string | null;
          faq_answer: string | null;
          candidate: boolean | null;
          approved: boolean | null;
          reviewer: string | null;
          approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          intent_id?: number | null;
          faq_question?: string | null;
          faq_answer?: string | null;
          candidate?: boolean | null;
          approved?: boolean | null;
          reviewer?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          intent_id?: number | null;
          faq_question?: string | null;
          faq_answer?: string | null;
          candidate?: boolean | null;
          approved?: boolean | null;
          reviewer?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      faq_embeddings: {
        Row: {
          id: number;
          faq_id: number | null;
          content: string | null;
          embedding: number[] | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          faq_id?: number | null;
          content?: string | null;
          embedding?: number[] | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          faq_id?: number | null;
          content?: string | null;
          embedding?: number[] | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_chunks: {
        Args: {
          query_embedding: number[];
          doc_id: string;
          match_count?: number;
          similarity_threshold?: number;
        };
        Returns: {
          id: string;
          content: string;
          metadata: Json;
          similarity: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
