"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  PlusCircle,
  Shield,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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

  const loadMembers = useCallback(
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
      loadMembers(activeCircleId);
    } else {
      onActiveCircleChange?.(null, [], userId);
    }
  }, [activeCircleId, loadMembers, onActiveCircleChange, userId]);

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
      await loadMembers(activeCircleId);
    }
  }

  const activeCircle = circles.find((c) => c.id === activeCircleId) || null;
  const isCreator = activeCircle && userId === activeCircle.created_by;

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

      {/* Active Circle Header & Invite Code */}
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
                Private invite-only circle • Capped at 12 for genuine fellowship
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
                Tip: Click a member&apos;s badge below to toggle optional{" "}
                <strong>Leader/Pastor</strong> role.
              </span>
            )}
          </div>

          {/* Member Roster with optional Leader/Pastor role toggle */}
          <div className="flex flex-wrap gap-2 pt-1">
            {members.map((m) => (
              <div
                key={m.user_id}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FAF9F6] border border-[#E5E0D8] text-xs"
              >
                <span className="font-medium text-[#1F2937]">
                  {m.display_name}
                  {m.user_id === userId ? " (You)" : ""}
                </span>
                {m.role === "leader" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E3EBE6] text-[#3D5A4A] text-[10px] font-semibold">
                    <Shield className="w-3 h-3" />
                    Leader / Pastor
                  </span>
                )}
                {isCreator && (
                  <button
                    type="button"
                    onClick={() => handleToggleLeaderRole(m)}
                    title="Toggle optional Leader/Pastor badge"
                    className="text-[10px] text-[#596579] hover:text-[#4B6F5B] underline ml-1 cursor-pointer"
                  >
                    {m.role === "leader" ? "Remove badge" : "+ Leader badge"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Join or Create Circle Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Join by Invite Code */}
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

        {/* Create New Circle */}
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
    </div>
  );
}
