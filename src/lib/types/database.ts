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
      prayer_requests: {
        Row: {
          id: string;
          circle_id: string;
          user_id: string;
          content: string;
          is_answered: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          circle_id: string;
          user_id: string;
          content: string;
          is_answered?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          circle_id?: string;
          user_id?: string;
          content?: string;
          is_answered?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      prayer_responses: {
        Row: {
          prayer_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          prayer_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          prayer_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      custom_schedules: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          rest_days: number[];
          schedule_items: Json;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          rest_days?: number[];
          schedule_items?: Json;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          rest_days?: number[];
          schedule_items?: Json;
          is_active?: boolean;
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
