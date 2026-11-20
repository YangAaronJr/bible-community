"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  KeyRound,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { getInitials } from "@/components/ui/Navbar";
import { getSharedPlanTitle } from "@/lib/plans/reading-plans";
import { createClient } from "@/lib/supabase/client";

interface DirectoryCircle {
  id: string;
  name: string;
  invite_code: string;
  max_members: number;
  avatar_url: string | null;
  shared_plan_id: string | null;
  member_count: number;
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getPlanTitle(planId: string | null): string | null {
  return getSharedPlanTitle(planId);
}

export default function CircleDirectory() {
  const [userId, setUserId] = useState<string | null>(null);
  const [circles, setCircles] = useState<DirectoryCircle[]>([]);
  const [loading, setLoading] = useState(true);

  const [drawer, setDrawer] = useState<"create" | "join" | null>(null);
  const [newName, setNewName] = useState("");
  const [creatorIsLeader, setCreatorIsLeader] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadDirectory = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
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
      setLoading(false);
      return;
    }

    const [{ data: circleRows }, { data: allMembers }] = await Promise.all([
      supabase
        .from("circles")
        .select("id, name, invite_code, max_members, avatar_url, shared_plan_id")
        .in("id", circleIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("circle_members")
        .select("circle_id")
        .in("circle_id", circleIds),
    ]);

    const counts = new Map<string, number>();
    for (const m of allMembers || []) {
      counts.set(m.circle_id, (counts.get(m.circle_id) || 0) + 1);
    }

    setCircles(
      (circleRows || []).map((c) => ({
        ...c,
        member_count: counts.get(c.id) || 1,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadDirectory();
    });
    return () => {
      active = false;
    };
  }, [loadDirectory]);

  async function handleCreateCircle(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !newName.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const supabase = createClient();
    const code = generateInviteCode();

    try {
      const { data: created, error: createError } = await supabase
        .from("circles")
        .insert({
          name: newName.trim(),
          invite_code: code,
          created_by: userId,
          max_members: 12,
        })
        .select("id, name, invite_code")
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

      setNewName("");
      setCreatorIsLeader(false);
      setDrawer(null);
      setFeedback({
        type: "success",
        text: `Created "${created.name}" · Code: ${created.invite_code}`,
      });
      await loadDirectory();
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
    if (!inviteCode.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc("join_circle_by_code", {
        code: inviteCode.trim().toUpperCase(),
      });

      if (error) throw error;
      const result = data as {
        circle_id: string;
        name: string;
        already_member?: boolean;
      };
      setInviteCode("");
      setDrawer(null);
      setFeedback({
        type: "success",
        text: result.already_member
          ? `Already in "${result.name}".`
          : `Joined "${result.name}".`,
      });
      await loadDirectory();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to join circle.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5 py-2">
      {/* Header with compact New Circle & Join by Code triggers */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-editorial text-[26px] leading-none font-medium text-[#1F2937] tracking-tight">
          Circles
        </h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setDrawer("join");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-medium text-[#1F2937] transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#4A6B5D]" />
            <span>Join by Code</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setDrawer("create");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Circle</span>
          </button>
        </div>
      </div>

      {feedback && !drawer && (
        <div
          className={`px-4 py-2.5 rounded-2xl text-xs font-medium border ${
            feedback.type === "success"
              ? "bg-[#EBF1EE] border-[#CFE0D6] text-[#3D5A4E]"
              : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {loading ? (
        <div className="p-8 bg-white border border-[#E6E1D6] rounded-2xl flex items-center justify-center text-xs text-[#6B7280]">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Loading circles...
        </div>
      ) : circles.length === 0 ? (
        <div className="bg-white border border-[#E6E1D6] rounded-2xl p-8 text-center space-y-4">
          <div className="space-y-1">
            <p className="font-editorial text-lg font-medium text-[#1F2937]">
              No circles yet
            </p>
            <p className="text-xs text-[#6B7280]">
              Start an invite-only reading circle or enter a friend&apos;s code.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => setDrawer("join")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-medium text-[#1F2937] cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#4A6B5D]" />
              <span>Join by Code</span>
            </button>
            <button
              type="button"
              onClick={() => setDrawer("create")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white text-xs font-medium cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Circle</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {circles.map((circle) => {
            const planTitle = getPlanTitle(circle.shared_plan_id);

            return (
              <Link
                key={circle.id}
                href={`/circles/${circle.id}`}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    localStorage.setItem("active_circle_id", circle.id);
                  }
                }}
                className="flex items-center justify-between gap-3.5 p-3.5 rounded-2xl bg-white border border-[#E6E1D6] hover:bg-[#FCFBF8] transition-colors group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* 56px circular avatar with monogram fallback */}
                  <div className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-[#E6E1D6] dark:ring-[#2E2E2B] bg-[#DDE6E1] dark:bg-[#212B25] text-[#4A6B5D] flex items-center justify-center font-editorial text-lg font-semibold shrink-0 select-none">
                    {circle.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={circle.avatar_url}
                        alt={circle.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      getInitials(circle.name)
                    )}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <p className="font-editorial text-[18px] leading-snug font-medium text-[#1F2937] truncate">
                      {circle.name}
                    </p>
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="text-xs text-[#6B7280]">
                        {circle.member_count} / {circle.max_members || 12}
                      </span>
                      {planTitle && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EBF1EE] border border-[#CFE0D6] text-[10.5px] font-medium text-[#3D5A4E] max-w-[180px] truncate">
                          <BookOpen className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{planTitle}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-[#6B7280] group-hover:text-[#1F2937] shrink-0 transition-colors" />
              </Link>
            );
          })}
        </div>
      )}

      {/* Slide-Up Drawers for New Circle & Join by Code */}
      {drawer && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
          onClick={() => setDrawer(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white border-t sm:border border-[#E6E1D6] rounded-t-3xl sm:rounded-3xl p-5 pb-7 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-editorial text-xl font-medium text-[#1F2937]">
                {drawer === "create" ? "New Circle" : "Join by Code"}
              </h2>
              <button
                type="button"
                onClick={() => setDrawer(null)}
                aria-label="Close drawer"
                className="p-1.5 rounded-full bg-[#F4F1EA] text-[#6B7280] hover:text-[#1F2937] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {feedback && (
              <div className="px-3.5 py-2 rounded-xl text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
                {feedback.text}
              </div>
            )}

            {drawer === "create" ? (
              <form onSubmit={handleCreateCircle} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#1F2937]">
                    Circle Name
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Sunday Morning Fellowship"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E1D6] bg-[#FAF9F6] text-xs text-[#1F2937] focus:outline-none focus:border-[#4A6B5D]"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-[#6B7280] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={creatorIsLeader}
                    onChange={(e) => setCreatorIsLeader(e.target.checked)}
                    className="rounded border-[#E6E1D6] accent-[#4A6B5D]"
                  />
                  <span>Add optional Leader badge for me</span>
                </label>

                <button
                  type="submit"
                  disabled={submitting || !newName.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
                >
                  {submitting ? "Creating..." : "Create Circle"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleJoinByCode} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#1F2937]">
                    Invite Code
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={10}
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E1D6] bg-[#FAF9F6] text-sm font-mono tracking-widest uppercase text-[#1F2937] focus:outline-none focus:border-[#4A6B5D]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !inviteCode.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
                >
                  {submitting ? "Joining..." : "Join Circle"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
