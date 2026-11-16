"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import ChatThread, { type ChatParticipant } from "@/components/chat/ChatThread";
import { triggerRingPush } from "@/lib/notifications/push-client";
import { createClient } from "@/lib/supabase/client";
import type {
  CircleInfo,
  CircleMemberProfile,
} from "@/components/circle/CircleManager";

interface DirectMessageDrawerProps {
  circle: CircleInfo;
  currentUserId: string;
  recipient: CircleMemberProfile;
  members?: CircleMemberProfile[];
  onClose: () => void;
  onOpenMemberCard?: (member: CircleMemberProfile) => void;
}

export default function DirectMessageDrawer({
  circle,
  currentUserId,
  recipient,
  members,
  onClose,
  onOpenMemberCard,
}: DirectMessageDrawerProps) {
  const [isRung, setIsRung] = useState(false);

  useEffect(() => {
    async function checkRecentRing() {
      const supabase = createClient();
      const since10m = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("rings")
        .select("id")
        .eq("circle_id", circle.id)
        .eq("sender_id", currentUserId)
        .eq("recipient_id", recipient.user_id)
        .gte("created_at", since10m)
        .limit(1);

      setIsRung(Boolean(data && data.length > 0));
    }
    checkRecentRing();
  }, [circle.id, currentUserId, recipient.user_id]);

  async function handleQuickRing() {
    if (isRung) return;
    const supabase = createClient();
    const ringMessage = "Praying for your time in the Word today";
    const { error: ringError } = await supabase.from("rings").insert({
      circle_id: circle.id,
      sender_id: currentUserId,
      recipient_id: recipient.user_id,
      message: ringMessage,
    });
    if (!ringError) {
      setIsRung(true);
      triggerRingPush({
        circleId: circle.id,
        recipientId: recipient.user_id,
        message: ringMessage,
      });
    }
  }

  const shortName = recipient.display_name.split(" ")[0];
  const participants: ChatParticipant[] =
    members && members.length > 0 ? members : [recipient];

  return (
    <div className="fixed inset-0 z-40 bg-[#FAF9F6] flex flex-col pb-20">
      <div className="max-w-xl w-full mx-auto px-4 pt-3 flex-1 flex flex-col min-h-0">
        <ChatThread
          mode="circle-dm"
          threadId={circle.id}
          title={recipient.display_name}
          subtitle={`${circle.name} · 1-on-1 DM`}
          participants={participants}
          currentUserId={currentUserId}
          peerUserId={recipient.user_id}
          headerAvatarUrl={recipient.avatar_url}
          privacyNotice={`Private 1-on-1 conversation · Only visible to you and ${shortName}`}
          headerAction={
            <button
              type="button"
              disabled={isRung}
              onClick={handleQuickRing}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                isRung
                  ? "bg-[#F4F1EA] border-[#E6E1D6] text-[#6B7280]"
                  : "bg-[#FBF5EE] border-[#E7D3BC] text-[#B47B44] hover:bg-[#F6EAD9]"
              }`}
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>{isRung ? "Rung" : "Ring"}</span>
            </button>
          }
          onBack={onClose}
          onSelectParticipant={(participant) => {
            const match =
              participants.find((m) => m.user_id === participant.user_id) ||
              recipient;
            onOpenMemberCard?.({
              user_id: match.user_id,
              display_name: match.display_name,
              avatar_url: match.avatar_url,
              role: match.role || "member",
            });
          }}
        />
      </div>
    </div>
  );
}
