import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface InitialSessionProfile {
  userId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

const EMPTY_SESSION_PROFILE: InitialSessionProfile = {
  userId: null,
  displayName: null,
  avatarUrl: null,
};

export const getInitialSessionProfile = cache(
  async (): Promise<InitialSessionProfile> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      const user = data?.user ?? null;

      if (error || !user) {
        return { ...EMPTY_SESSION_PROFILE };
      }

      const metaName =
        typeof user.user_metadata?.display_name === "string"
          ? user.user_metadata.display_name.trim()
          : "";
      const emailPrefix = user.email?.split("@")[0]?.trim() || "";
      const fallbackName = metaName || emailPrefix || "Reader";

      let profileDisplayName: string | null = null;
      let avatarUrl: string | null = null;

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle();

        profileDisplayName = profile?.display_name?.trim() || null;
        avatarUrl = profile?.avatar_url?.trim() || null;
      } catch {
        // Keep authenticated userId with metadata/email fallback if profile query fails
      }

      return {
        userId: user.id,
        displayName: profileDisplayName || fallbackName,
        avatarUrl,
      };
    } catch {
      return { ...EMPTY_SESSION_PROFILE };
    }
  }
);
