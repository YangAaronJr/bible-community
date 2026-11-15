"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { BellRing, Loader2, Mail, Settings, Shield, X } from "lucide-react";
import { getInitials } from "@/components/ui/Navbar";
import { triggerRingPush } from "@/lib/notifications/push-client";
import { createClient } from "@/lib/supabase/client";
import DirectMessageDrawer from "@/components/circle/DirectMessageDrawer";

export interface CircleInfo {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  max_members: number;
}

export interface CircleMemberProfile {
  user_id: string;
  role: "member" | "leader";
  display_name: string;
  avatar_url?: string | null;
}

interface IncomingRing {
  id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: string;
}

interface CircleManagerProps {
  onActiveCircleChange?: (
    circle: CircleInfo | null,
    members: CircleMemberProfile[],
    currentUserId: string | null
  ) => void;
}

export default function CircleManager({
  onActiveCircleChange,
}: CircleManagerProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [circles, setCircles] = useState<CircleInfo[]>([]);
  const [activeCircleId, setActiveCircleId] = useState<string | null>(null);
  const [members, setMembers] = useState<CircleMemberProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dmTarget, setDmTarget] = useState<CircleMemberProfile | null>(null);

  const [sentRingRecipientIds, setSentRingRecipientIds] = useState<Set<string>>(
    new Set()
  );
  const [incomingRings, setIncomingRings] = useState<IncomingRing[]>([]);
  const [dismissedRingIds, setDismissedRingIds] = useState<Set<string>>(
    new Set()
  );
  const [ringingUserId, setRingingUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadCircles = useCallback(async (preferredId?: string) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUserId(null);
      setLoading(false);
      return;
    }
    setUserId(user.id);

    const { data: memberships } = await supabase
      .from("circle_members")
      .select("circle_id")
      .eq("user_id", user.id);

    const circleIds = (memberships || []).map((m) => m.circle_id);
    if (circleIds.length === 0) {
      setCircles([]);
      setActiveCircleId(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    const { data: circleRows } = await supabase
      .from("circles")
      .select("id, name, invite_code, created_by, max_members")
      .in("id", circleIds)
      .order("created_at", { ascending: true });

    const list = circleRows || [];
    setCircles(list);

    const savedId =
      typeof window !== "undefined"
        ? localStorage.getItem("active_circle_id")
        : null;
    const selected =
      list.find((c) => c.id === (preferredId || savedId)) || list[0] || null;

    setActiveCircleId(selected ? selected.id : null);
    setLoading(false);
  }, []);

  const loadMembersAndRings = useCallback(
    async (circleId: string) => {
      const supabase = createClient();
      const { data: memberRows } = await supabase
        .from("circle_members")
        .select("user_id, role")
        .eq("circle_id", circleId)
        .order("joined_at", { ascending: true });

      if (!memberRows || memberRows.length === 0) {
        setMembers([]);
        return;
      }

      const ids = memberRows.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);

      const profileMap = new Map(
        (profiles || []).map((p) => [
          p.id,
          { display_name: p.display_name, avatar_url: p.avatar_url },
        ])
      );

      const enriched: CircleMemberProfile[] = memberRows.map((m) => ({
        user_id: m.user_id,
        role: m.role,
        display_name:
          profileMap.get(m.user_id)?.display_name || "Fellow Reader",
        avatar_url: profileMap.get(m.user_id)?.avatar_url || null,
      }));

      setMembers(enriched);
      const activeObj = circles.find((c) => c.id === circleId) || null;
      onActiveCircleChange?.(activeObj, enriched, userId);

      if (userId) {
        const since10m = new Date(
          Date.now() - 10 * 60 * 1000
        ).toISOString();

        const { data: ringRows } = await supabase
          .from("rings")
          .select("id, sender_id, recipient_id, message, created_at")
          .eq("circle_id", circleId)
          .gte("created_at", since10m)
          .order("created_at", { ascending: false });

        const sentSet = new Set<string>();
        const incomingList: IncomingRing[] = [];

        for (const r of ringRows || []) {
          if (r.sender_id === userId) {
            sentSet.add(r.recipient_id);
          }
          if (r.recipient_id === userId) {
            incomingList.push({
              id: r.id,
              sender_id: r.sender_id,
              sender_name:
                profileMap.get(r.sender_id)?.display_name || "A Circle Friend",
              message: r.message,
              created_at: r.created_at,
            });
          }
        }

        setSentRingRecipientIds(sentSet);
        setIncomingRings(incomingList);
      }
    },
    [circles, onActiveCircleChange, userId]
  );

  useEffect(() => {
    loadCircles();
  }, [loadCircles]);

  useEffect(() => {
    if (activeCircleId) {
      if (typeof window !== "undefined") {
        localStorage.setItem("active_circle_id", activeCircleId);
      }
      loadMembersAndRings(activeCircleId);
    } else {
      onActiveCircleChange?.(null, [], userId);
    }
  }, [activeCircleId, loadMembersAndRings, onActiveCircleChange, userId]);

  async function handleSendRing(target: CircleMemberProfile) {
    if (!activeCircleId || !userId) return;
    setRingingUserId(target.user_id);
    setFeedback(null);

    const supabase = createClient();
    try {
      const ringMessage = "Praying for your time in the Word today";
      const { error } = await supabase.from("rings").insert({
        circle_id: activeCircleId,
        sender_id: userId,
        recipient_id: target.user_id,
        message: ringMessage,
      });

      if (error) throw error;

      triggerRingPush({
        circleId: activeCircleId,
        recipientId: target.user_id,
        message: ringMessage,
      });

      setSentRingRecipientIds((prev) => new Set(prev).add(target.user_id));
      setFeedback({
        type: "success",
        text: `Sent gentle Ring to ${target.display_name}`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Already rung · 10m gentle cooldown active",
      });
    } finally {
      setRingingUserId(null);
    }
  }

  const activeCircle = circles.find((c) => c.id === activeCircleId) || null;
  const visibleRings = incomingRings.filter(
    (r) => !dismissedRingIds.has(r.id)
  );

  if (loading) {
    return (
      <div className="p-6 bg-white border border-[#E6E1D6] rounded-2xl flex items-center justify-center text-xs text-[#6B7280]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading your circle...
      </div>
    );
  }

  if (!activeCircle) {
    return (
      <div className="bg-white border border-[#E6E1D6] rounded-2xl p-6 text-center space-y-3">
        <p className="font-editorial text-lg font-medium text-[#1F2937]">
          No Circle Joined Yet
        </p>
        <p className="text-xs text-[#6B7280]">
          Create an invite-only circle (up to 12 members) or enter an invite
          code in Settings.
        </p>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Open Circle Settings</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {visibleRings.map((ring) => (
        <div
          key={ring.id}
          className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#EBF1EE] border border-[#CFE0D6] text-xs text-[#1F2937]"
        >
          <div className="flex items-center gap-2.5">
            <BellRing className="w-4 h-4 text-[#4A6B5D] shrink-0" />
            <span>
              <strong>{ring.sender_name}</strong>: &ldquo;{ring.message}&rdquo;
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              setDismissedRingIds((prev) => new Set(prev).add(ring.id))
            }
            className="p-1 text-[#6B7280] hover:text-[#1F2937] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs border ${
            feedback.type === "success"
              ? "bg-[#EBF1EE] border-[#CFE0D6] text-[#3D5A4E]"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="bg-white border border-[#E6E1D6] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-editorial text-lg font-semibold text-[#1F2937]">
              {activeCircle.name}
            </h2>
            <p className="text-[11px] text-[#6B7280]">
              {members.length} of {activeCircle.max_members} members
            </p>
          </div>

          <div className="flex items-center gap-2">
            {circles.length > 1 && (
              <select
                value={activeCircle.id}
                onChange={(e) => setActiveCircleId(e.target.value)}
                className="text-xs border border-[#E6E1D6] rounded-xl px-2.5 py-1.5 bg-[#FAF9F6] text-[#1F2937]"
              >
                {circles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <Link
              href="/settings"
              title="Circle Settings & Invite Code"
              className="p-2 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-[#1F2937]"
            >
              <Settings className="w-4 h-4 text-[#4A6B5D]" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {members.map((m) => {
            const isSelf = m.user_id === userId;
            const onCooldown = sentRingRecipientIds.has(m.user_id);
            const isRinging = ringingUserId === m.user_id;

            return (
              <div
                key={m.user_id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#FAF9F6] border border-[#E6E1D6] text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-full overflow-hidden bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center text-[10px] font-semibold shrink-0">
                    {m.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.avatar_url}
                        alt={m.display_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      getInitials(m.display_name)
                    )}
                  </span>
                  <span className="font-semibold text-[#1F2937] truncate">
                    {m.display_name}
                    {isSelf ? " (You)" : ""}
                  </span>
                  {m.role === "leader" && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[#EBF1EE] text-[#4A6B5D] text-[10px] font-semibold shrink-0">
                      <Shield className="w-2.5 h-2.5" />
                      Leader
                    </span>
                  )}
                </div>

                {!isSelf && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDmTarget(m)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#E6E1D6] hover:border-[#4A6B5D] text-[#1F2937] text-[11px] font-medium cursor-pointer"
                    >
                      <Mail className="w-3 h-3 text-[#4A6B5D]" />
                      <span>DM</span>
                    </button>
                    <button
                      type="button"
                      disabled={onCooldown || isRinging}
                      onClick={() => handleSendRing(m)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer ${
                        onCooldown
                          ? "bg-[#F4F1EA] border-[#E6E1D6] text-[#6B7280]"
                          : "bg-[#FBF5EE] border-[#E7D3BC] text-[#B47B44]"
                      }`}
                    >
                      <BellRing className="w-3 h-3" />
                      <span>{onCooldown ? "Rung" : "Ring"}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {activeCircle && userId && dmTarget && (
        <DirectMessageDrawer
          circle={activeCircle}
          currentUserId={userId}
          recipient={dmTarget}
          onClose={() => setDmTarget(null)}
        />
      )}
    </div>
  );
}
