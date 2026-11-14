export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      circles: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          created_by: string;
          max_members: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code: string;
          created_by: string;
          max_members?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          created_by?: string;
          max_members?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      circle_members: {
        Row: {
          circle_id: string;
          user_id: string;
          role: "member" | "leader";
          joined_at: string;
        };
        Insert: {
          circle_id: string;
          user_id: string;
          role?: "member" | "leader";
          joined_at?: string;
        };
        Update: {
          circle_id?: string;
          user_id?: string;
          role?: "member" | "leader";
          joined_at?: string;
        };
        Relationships: [];
      };
      reading_progress: {
        Row: {
          id: string;
          user_id: string;
          book: string;
          chapter: number;
          read_in_physical_bible: boolean;
          completed_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          book: string;
          chapter: number;
          read_in_physical_bible?: boolean;
          completed_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          book?: string;
          chapter?: number;
          read_in_physical_bible?: boolean;
          completed_at?: string;
        };
        Relationships: [];
      };
      verse_notes: {
        Row: {
          id: string;
          circle_id: string;
          user_id: string;
          book: string;
          chapter: number;
          verse_start: number;
          verse_end: number;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          circle_id: string;
          user_id: string;
          book: string;
          chapter: number;
          verse_start: number;
          verse_end: number;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          circle_id?: string;
          user_id?: string;
          book?: string;
          chapter?: number;
          verse_start?: number;
          verse_end?: number;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          circle_id: string;
          sender_id: string;
          recipient_id: string | null;
          parent_id: string | null;
          content: string;
          image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          circle_id: string;
          sender_id: string;
          recipient_id?: string | null;
          parent_id?: string | null;
          content: string;
          image_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          circle_id?: string;
          sender_id?: string;
          recipient_id?: string | null;
          parent_id?: string | null;
          content?: string;
          image_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      rings: {
        Row: {
          id: string;
          circle_id: string;
          sender_id: string;
          recipient_id: string;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          circle_id: string;
          sender_id: string;
          recipient_id: string;
          message?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          circle_id?: string;
          sender_id?: string;
          recipient_id?: string;
          message?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_circle_member: {
        Args: { target_circle_id: string };
        Returns: boolean;
      };
      join_circle_by_code: {
        Args: { code: string };
        Returns: { circle_id: string; name: string; already_member?: boolean };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
