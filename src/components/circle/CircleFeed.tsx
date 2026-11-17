"use client";

import ChatThread from "@/components/chat/ChatThread";
import type {
  CircleInfo,
  CircleMemberProfile,
} from "@/components/circle/CircleManager";

interface CircleFeedProps {
  circle: CircleInfo;
  members: CircleMemberProfile[];
  currentUserId: string;
  onBack?: () => void;
  onSelectMember?: (member: CircleMemberProfile) => void;
}

export default function CircleFeed({
  circle,
  members,
  currentUserId,
  onBack,
  onSelectMember,
}: CircleFeedProps) {
  return (
    <ChatThread
      mode="circle"
      threadId={circle.id}
      title={circle.name}
      subtitle={`${members.length} members · Live fellowship`}
      participants={members}
      currentUserId={currentUserId}
      onBack={onBack}
      onSelectParticipant={(participant) => {
        const match = members.find((m) => m.user_id === participant.user_id);
        if (match) onSelectMember?.(match);
      }}
    />
  );
}
