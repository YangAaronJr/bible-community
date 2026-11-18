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
      user_friend_codes: {
        Row: {
          user_id: string;
          friend_code: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          friend_code?: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          friend_code?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: "pending" | "accepted";
          created_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          addressee_id: string;
          status?: "pending" | "accepted";
          created_at?: string;
        };
        Update: {
          id?: string;
          requester_id?: string;
          addressee_id?: string;
          status?: "pending" | "accepted";
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
          avatar_url: string | null;
          shared_plan_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code: string;
          created_by: string;
          max_members?: number;
          avatar_url?: string | null;
          shared_plan_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          created_by?: string;
          max_members?: number;
          avatar_url?: string | null;
          shared_plan_id?: string | null;
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
          circle_id: string | null;
          user_id: string;
          book: string;
          chapter: number;
          verse_start: number;
          verse_end: number;
          content: string;
          visibility: "private" | "friends" | "circles";
          target_circle_ids: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          circle_id?: string | null;
          user_id: string;
          book: string;
          chapter: number;
          verse_start: number;
          verse_end: number;
          content: string;
          visibility?: "private" | "friends" | "circles";
          target_circle_ids?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          circle_id?: string | null;
          user_id?: string;
          book?: string;
          chapter?: number;
          verse_start?: number;
          verse_end?: number;
          content?: string;
          visibility?: "private" | "friends" | "circles";
          target_circle_ids?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          circle_id: string | null;
          friendship_id: string | null;
          sender_id: string;
          recipient_id: string | null;
          parent_id: string | null;
          prayer_request_id: string | null;
          content: string;
          image_url: string | null;
          ocr_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          circle_id?: string | null;
          friendship_id?: string | null;
          sender_id: string;
          recipient_id?: string | null;
          parent_id?: string | null;
          prayer_request_id?: string | null;
          content: string;
          image_url?: string | null;
          ocr_text?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          circle_id?: string | null;
          friendship_id?: string | null;
          sender_id?: string;
          recipient_id?: string | null;
          parent_id?: string | null;
          prayer_request_id?: string | null;
          content?: string;
          image_url?: string | null;
          ocr_text?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      message_prayer_responses: {
        Row: {
          message_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          message_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          message_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      user_read_states: {
        Row: {
          user_id: string;
          scope_type: "circle" | "dm";
          scope_id: string;
          last_read_at: string;
        };
        Insert: {
          user_id: string;
          scope_type: "circle" | "dm";
          scope_id: string;
          last_read_at?: string;
        };
        Update: {
          user_id?: string;
          scope_type?: "circle" | "dm";
          scope_id?: string;
          last_read_at?: string;
        };
        Relationships: [];
      };
      rings: {
        Row: {
          id: string;
          circle_id: string | null;
          sender_id: string;
          recipient_id: string;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          circle_id?: string | null;
          sender_id: string;
          recipient_id: string;
          message?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          circle_id?: string | null;
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
      circle_docs: {
        Row: {
          id: string;
          circle_id: string;
          title: string;
          content: string;
          updated_by: string | null;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          circle_id: string;
          title: string;
          content?: string;
          updated_by?: string | null;
          updated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          circle_id?: string;
          title?: string;
          content?: string;
          updated_by?: string | null;
          updated_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
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
      are_friends: {
        Args: { target_user_id: string };
        Returns: boolean;
      };
      send_friend_request_by_code: {
        Args: { code: string };
        Returns: {
          friendship_id: string;
          target_user_id: string;
          display_name: string;
          status: "pending" | "accepted";
          direction: "outgoing" | "incoming";
          already_exists: boolean;
        };
      };
      join_circle_by_code: {
        Args: { code: string };
        Returns: { circle_id: string; name: string; already_member?: boolean };
      };
      get_my_friend_code: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      get_ring_push_subscriptions: {
        Args: { p_circle_id: string | null; p_recipient_id: string };
        Returns: { endpoint: string; p256dh: string; auth: string }[];
      };
      prune_stale_push_subscriptions: {
        Args: { p_recipient_id: string; p_endpoints: string[] };
        Returns: number;
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
