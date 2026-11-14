"use client";

import { useState, useCallback } from "react";
import CircleManager, {
  type CircleInfo,
  type CircleMemberProfile,
} from "@/components/circle/CircleManager";
import CircleFeed from "@/components/circle/CircleFeed";

export default function CircleWorkspace() {
  const [activeCircle, setActiveCircle] = useState<CircleInfo | null>(null);
  const [members, setMembers] = useState<CircleMemberProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const handleCircleChange = useCallback(
    (
      circle: CircleInfo | null,
      memberList: CircleMemberProfile[],
      userId: string | null
    ) => {
      setActiveCircle(circle);
      setMembers(memberList);
      setCurrentUserId(userId);
    },
    []
  );

  return (
    <div className="space-y-8">
      <CircleManager onActiveCircleChange={handleCircleChange} />

      {activeCircle && currentUserId && (
        <CircleFeed
          circle={activeCircle}
          members={members}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}
