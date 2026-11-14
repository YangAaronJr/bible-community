"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BellRing,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  PlusCircle,
  Shield,
  Users,
  X,
} from "lucide-react";
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
}

interface IncomingRing {
  id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: string;
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
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

  // 1-on-1 Direct Message Drawer target
  const [dmTarget, setDmTarget] = useState<CircleMemberProfile | null>(null);

  // Rings state (24-hour cooldown & incoming notifications)
  const [sentRingRecipientIds, setSentRingRecipientIds] = useState<Set<string>>(
    new Set()
  );
  const [incomingRings, setIncomingRings] = useState<IncomingRing[]>([]);
  const [dismissedRingIds, setDismissedRingIds] = useState<Set<string>>(
    new Set()
  );
  const [ringingUserId, setRingingUserId] = useState<string | null>(null);

  // Forms
  const [newCircleName, setNewCircleName] = useState("");
  const [creatorIsLeader, setCreatorIsLeader] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

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
        .select("id, display_name")
        .in("id", ids);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.id, p.display_name])
      );

      const enriched: CircleMemberProfile[] = memberRows.map((m) => ({
        user_id: m.user_id,
        role: m.role,
        display_name: profileMap.get(m.user_id) || "Fellow Reader",
      }));

      setMembers(enriched);
      const activeObj = circles.find((c) => c.id === circleId) || null;
      onActiveCircleChange?.(activeObj, enriched, userId);

      // Load rings from the last 24 hours for this circle
      if (userId) {
        const since24h = new Date(
          Date.now() - 24 * 60 * 60 * 1000
        ).toISOString();

        const { data: ringRows } = await supabase
          .from("rings")
          .select("id, sender_id, recipient_id, message, created_at")
          .eq("circle_id", circleId)
          .gte("created_at", since24h)
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
              sender_name: profileMap.get(r.sender_id) || "A Circle Friend",
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
      const { error } = await supabase.from("rings").insert({
        circle_id: activeCircleId,
        sender_id: userId,
        recipient_id: target.user_id,
        message: "Praying for your time in the Word today",
      });

      if (error) throw error;

      setSentRingRecipientIds((prev) => new Set(prev).add(target.user_id));
      setFeedback({
        type: "success",
        text: `Sent a gentle Ring to ${target.display_name}: "Praying for your time in the Word today"`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "A Ring was already sent within the last 24 hours.",
      });
    } finally {
      setRingingUserId(null);
    }
  }

  async function handleCreateCircle(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !newCircleName.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const supabase = createClient();
    const code = generateInviteCode();

    try {
      const { data: created, error: createError } = await supabase
        .from("circles")
        .insert({
          name: newCircleName.trim(),
          invite_code: code,
          created_by: userId,
          max_members: 12,
        })
        .select("id, name, invite_code, created_by, max_members")
        .single();

      if (createError) throw createError;

      const { error: memberError } = await supabase
        .from("circle_members")
        .insert({
          circle_id: created.id,
          user_id: userId,
          role: creatorIsLeader ? "leader" : "member",
        });

      if (memberError) throw memberError;

      setNewCircleName("");
      setCreatorIsLeader(false);
      setFeedback({
        type: "success",
        text: `Created "${created.name}" (Invite code: ${created.invite_code})`,
      });
      await loadCircles(created.id);
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Could not create circle.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCodeInput.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc("join_circle_by_code", {
        code: inviteCodeInput.trim().toUpperCase(),
      });

      if (error) throw error;

      const result = data as {
        circle_id: string;
        name: string;
        already_member?: boolean;
      };
      setInviteCodeInput("");
      setFeedback({
        type: "success",
        text: result.already_member
          ? `You are already a member of "${result.name}".`
          : `Joined "${result.name}"!`,
      });
      await loadCircles(result.circle_id);
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to join circle.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleLeaderRole(member: CircleMemberProfile) {
    if (!activeCircleId) return;
    const nextRole = member.role === "leader" ? "member" : "leader";
    const supabase = createClient();

    const { error } = await supabase
      .from("circle_members")
      .update({ role: nextRole })
      .eq("circle_id", activeCircleId)
      .eq("user_id", member.user_id);

    if (!error) {
      await loadMembersAndRings(activeCircleId);
    }
  }

  const activeCircle = circles.find((c) => c.id === activeCircleId) || null;
  const isCreator = activeCircle && userId === activeCircle.created_by;
  const visibleRings = incomingRings.filter(
    (r) => !dismissedRingIds.has(r.id)
  );

  if (loading) {
    return (
      <div className="p-6 bg-white border border-[#E5E0D8] rounded-2xl flex items-center justify-center text-sm text-[#596579]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading your fellowship circles...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* In-App Notification Banner for Incoming Rings */}
      {visibleRings.length > 0 && (
        <div className="space-y-2">
          {visibleRings.map((ring) => (
            <div
              key={ring.id}
              className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[#F4F7F5] border border-[#C5D7CC] text-xs text-[#1F2937] shadow-2xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#E3EBE6] text-[#4B6F5B] shrink-0">
                  <BellRing className="w-4 h-4" />
                </span>
                <div>
                  <p className="font-medium text-[#1F2937]">
                    <strong>{ring.sender_name}</strong> sent you a gentle Ring:
                  </p>
                  <p className="font-serif italic text-[#3D5A4A] mt-0.5">
                    &ldquo;{ring.message}&rdquo;
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDismissedRingIds((prev) => new Set(prev).add(ring.id))
                }
                className="p-1 rounded-lg text-[#596579] hover:text-[#1F2937] cursor-pointer"
                title="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs border ${
            feedback.type === "success"
              ? "bg-[#F4F7F5] border-[#C5D7CC] text-[#3D5A4A]"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Active Circle Top Bar & Member Roster */}
      {activeCircle && (
        <div className="bg-white border border-[#E5E0D8] rounded-2xl p-5 space-y-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-serif font-semibold text-[#1F2937]">
                  {activeCircle.name}
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#F3EFEA] text-[#596579]">
                  {members.length} / {activeCircle.max_members} members
                </span>
              </div>
              <p className="text-xs text-[#596579] mt-0.5">
                Tap <strong>1-on-1 Message</strong> or <strong>Ring</strong>{" "}
                (24h cooldown nudge) on any member below.
              </p>
            </div>

            {circles.length > 1 && (
              <select
                value={activeCircle.id}
                onChange={(e) => setActiveCircleId(e.target.value)}
                className="text-xs border border-[#E5E0D8] rounded-lg px-3 py-1.5 bg-[#FAF9F6] text-[#1F2937]"
              >
                {circles.map((c) => (
                  <option key={c.id} value={c.id}>
                    Switch: {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E5E0D8]">
            <div className="flex items-center gap-2 text-xs text-[#596579]">
              <span>Invite Code:</span>
              <code className="px-2.5 py-1 rounded-md bg-[#FAF9F6] border border-[#E5E0D8] font-mono font-semibold text-[#1F2937] tracking-wider">
                {activeCircle.invite_code}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(activeCircle.invite_code);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-[#4B6F5B] hover:bg-[#F4F7F5] transition-colors cursor-pointer"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>

            {isCreator && (
              <span className="text-[11px] text-[#596579]">
                Creator option: Toggle optional{" "}
                <strong>Leader / Pastor</strong> badge on any member.
              </span>
            )}
          </div>

          {/* Member Cards with 1-on-1 DM icon & Ring (24h cooldown) icon */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {members.map((m) => {
              const isSelf = m.user_id === userId;
              const onCooldown = sentRingRecipientIds.has(m.user_id);
              const isRinging = ringingUserId === m.user_id;

              return (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] border border-[#E5E0D8] text-xs"
                >
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-[#1F2937] truncate">
                      {m.display_name}
                      {isSelf ? " (You)" : ""}
                    </span>
                    {m.role === "leader" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E3EBE6] text-[#3D5A4A] text-[10px] font-semibold">
                        <Shield className="w-2.5 h-2.5" />
                        Leader
                      </span>
                    )}
                    {isCreator && (
                      <button
                        type="button"
                        onClick={() => handleToggleLeaderRole(m)}
                        className="text-[10px] text-[#596579] hover:text-[#4B6F5B] underline cursor-pointer"
                      >
                        {m.role === "leader" ? "Remove badge" : "+ Leader"}
                      </button>
                    )}
                  </div>

                  {!isSelf && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setDmTarget(m)}
                        title={`1-on-1 Direct Message with ${m.display_name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#E5E0D8] hover:border-[#4B6F5B] text-[#1F2937] text-[11px] font-medium transition-colors cursor-pointer"
                      >
                        <Mail className="w-3.5 h-3.5 text-[#4B6F5B]" />
                        <span>DM</span>
                      </button>

                      <button
                        type="button"
                        disabled={onCooldown || isRinging}
                        onClick={() => handleSendRing(m)}
                        title={
                          onCooldown
                            ? "Ring already sent within the last 24 hours"
                            : `Send gentle nudge: "Praying for your time in the Word today"`
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                          onCooldown
                            ? "bg-[#E3EBE6] border-[#C5D7CC] text-[#3D5A4A] opacity-75 cursor-not-allowed"
                            : "bg-white border-[#E5E0D8] hover:border-[#4B6F5B] text-[#1F2937]"
                        }`}
                      >
                        <BellRing className="w-3.5 h-3.5 text-[#4B6F5B]" />
                        <span>{onCooldown ? "Rung (24h)" : "Ring"}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Join or Create Circle Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <form
          onSubmit={handleJoinByCode}
          className="bg-white border border-[#E5E0D8] rounded-2xl p-5 space-y-3 shadow-2xs"
        >
          <div className="flex items-center gap-2 text-sm font-serif font-semibold text-[#1F2937]">
            <KeyRound className="w-4 h-4 text-[#4B6F5B]" />
            <span>Join a Circle by Invite Code</span>
          </div>
          <p className="text-xs text-[#596579]">
            Have a 6-character code from a friend or small-group mentor? Enter
            it below.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              required
              maxLength={10}
              placeholder="e.g. GRACE7"
              value={inviteCodeInput}
              onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
              className="flex-1 px-3 py-2 rounded-lg border border-[#E5E0D8] bg-[#FAF9F6] text-xs font-mono uppercase tracking-wider text-[#1F2937] focus:outline-none focus:border-[#4B6F5B]"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-[#4B6F5B] hover:bg-[#3D5A4A] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
            >
              Join
            </button>
          </div>
        </form>

        <form
          onSubmit={handleCreateCircle}
          className="bg-white border border-[#E5E0D8] rounded-2xl p-5 space-y-3 shadow-2xs"
        >
          <div className="flex items-center gap-2 text-sm font-serif font-semibold text-[#1F2937]">
            <PlusCircle className="w-4 h-4 text-[#4B6F5B]" />
            <span>Start a New Circle (Max 12)</span>
          </div>
          <input
            type="text"
            required
            placeholder="Circle Name (e.g. Evening Psalms Group)"
            value={newCircleName}
            onChange={(e) => setNewCircleName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#E5E0D8] bg-[#FAF9F6] text-xs text-[#1F2937] focus:outline-none focus:border-[#4B6F5B]"
          />
          <label className="flex items-center gap-2 text-xs text-[#596579] cursor-pointer">
            <input
              type="checkbox"
              checked={creatorIsLeader}
              onChange={(e) => setCreatorIsLeader(e.target.checked)}
              className="rounded border-[#E5E0D8] text-[#4B6F5B] focus:ring-[#4B6F5B]"
            />
            <span>
              Add optional <strong>Leader / Pastor</strong> badge to my name
            </span>
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg bg-[#1F2937] hover:bg-[#374151] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Create Invite-Only Circle</span>
          </button>
        </form>
      </div>

      {/* 1-on-1 Direct Message Drawer */}
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
