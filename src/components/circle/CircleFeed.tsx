"use client";

import ChatThread from "@/components/chat/ChatThread";
import { ThemeSettingsCluster } from "@/components/ui/QuietPageHeader";
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
  onMessagesUpdated?: (latestCreatedAt: string | null) => void;
}

export default function CircleFeed({
  circle,
  members,
  currentUserId,
  onBack,
  onSelectMember,
  onMessagesUpdated,
}: CircleFeedProps) {
  return (
    <ChatThread
      mode="circle"
      threadId={circle.id}
      title={circle.name}
      subtitle={`${members.length} members · Live fellowship`}
      participants={members}
      currentUserId={currentUserId}
      headerAvatarUrl={circle.avatar_url}
      headerAction={<ThemeSettingsCluster />}
      onBack={onBack}
      onSelectParticipant={(participant) => {
        const match = members.find((m) => m.user_id === participant.user_id);
        if (match) onSelectMember?.(match);
      }}
      onMessagesUpdated={onMessagesUpdated}
    />
  );
}
