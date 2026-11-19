"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
import ChatThread, { type ChatParticipant } from "@/components/chat/ChatThread";
import QuietPageHeader, {
  ThemeSettingsCluster,
} from "@/components/ui/QuietPageHeader";
import { createClient } from "@/lib/supabase/client";

async function markDmRead(
  userId: string,
  friendshipId: string,
  latestIso?: string | null
) {
  const nowMs = Date.now();
  const latestMs = latestIso ? new Date(latestIso).getTime() : 0;
  const stamp = new Date(Math.max(nowMs, latestMs)).toISOString();

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`dm_last_read_${friendshipId}`, stamp);
    } catch {
      // Ignore storage write errors
    }
  }

  try {
    const supabase = createClient();
    await supabase.from("user_read_states").upsert(
      {
        user_id: userId,
        scope_type: "dm",
        scope_id: friendshipId,
        last_read_at: stamp,
      },
      { onConflict: "user_id,scope_type,scope_id" }
    );
  } catch {
    // Best-effort DB sync; localStorage fallback already updated
  }
}

export default function FriendDmRoom({
  friendshipId,
  initialUserId,
}: {
  friendshipId: string;
  initialUserId?: string;
}) {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    initialUserId ?? null
  );
  const [peer, setPeer] = useState<ChatParticipant | null>(null);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundReason, setNotFoundReason] = useState<string | null>(null);

  useEffect(() => {
    async function loadDmContext() {
      const supabase = createClient();
      let uid = initialUserId ?? null;
      if (!uid) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        uid = user?.id ?? null;
      }

      if (!uid) {
        setLoading(false);
        return;
      }
      setCurrentUserId(uid);

      const { data: friendship } = await supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status")
        .eq("id", friendshipId)
        .maybeSingle();

      if (!friendship) {
        setNotFoundReason("Conversation not found.");
        setLoading(false);
        return;
      }

      if (friendship.status !== "accepted") {
        setNotFoundReason(
          "1-on-1 messages open once both of you have accepted the friend request."
        );
        setLoading(false);
        return;
      }

      const peerId =
        friendship.requester_id === uid
          ? friendship.addressee_id
          : friendship.requester_id;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", [uid, peerId]);

      const profMap = new Map((profiles || []).map((p) => [p.id, p]));
      const meProf = profMap.get(uid);
      const peerProf = profMap.get(peerId);

      const peerParticipant: ChatParticipant = {
        user_id: peerId,
        display_name: peerProf?.display_name || "Friend",
        avatar_url: peerProf?.avatar_url || null,
      };
      const meParticipant: ChatParticipant = {
        user_id: uid,
        display_name: meProf?.display_name || "You",
        avatar_url: meProf?.avatar_url || null,
      };

      setPeer(peerParticipant);
      setParticipants([meParticipant, peerParticipant]);
      await markDmRead(uid, friendshipId);
      setLoading(false);
    }

    loadDmContext();
  }, [friendshipId, initialUserId]);

  const handleMessagesUpdated = useCallback(
    (latestCreatedAt: string | null) => {
      if (!currentUserId) return;
      void markDmRead(currentUserId, friendshipId, latestCreatedAt);
    },
    [currentUserId, friendshipId]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <QuietPageHeader backHref="/social" backLabel="Back to Social" />
        <div className="p-8 bg-white border border-[#E6E1D6] rounded-2xl flex items-center justify-center text-xs text-[#6B7280]">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Opening 1-on-1 conversation...
        </div>
      </div>
    );
  }

  if (!currentUserId || !peer || notFoundReason) {
    return (
      <div className="space-y-4">
        <QuietPageHeader backHref="/social" backLabel="Back to Social" />
        <div className="bg-white border border-[#E6E1D6] rounded-2xl p-8 text-center space-y-3">
          <p className="font-editorial text-lg text-[#1F2937]">
            {notFoundReason || "Conversation unavailable"}
          </p>
          <Link
            href="/social"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#4A6B5D] text-white text-xs font-medium"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Back to Social</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ChatThread
      mode="dm"
      threadId={friendshipId}
      title={peer.display_name}
      subtitle="1-on-1 Fellowship · Live"
      participants={participants}
      currentUserId={currentUserId}
      peerUserId={peer.user_id}
      headerAvatarUrl={peer.avatar_url}
      headerAction={<ThemeSettingsCluster />}
      onBack={() => router.push(`/members/${peer.user_id}`)}
      onSelectParticipant={(p) => router.push(`/members/${p.user_id}`)}
      onMessagesUpdated={handleMessagesUpdated}
    />
  );
}
