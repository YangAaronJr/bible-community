"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronLeft,
  FileText,
  Heart,
  Loader2,
  Menu,
  MessageSquare,
  Settings,
  Users,
  X,
} from "lucide-react";
import { getInitials } from "@/components/ui/Navbar";
import { READING_PLAN_PRESETS } from "@/lib/plans/reading-plans";
import { createClient } from "@/lib/supabase/client";
import type {
  CircleInfo,
  CircleMemberProfile,
} from "@/components/circle/CircleManager";
import CircleDocsView from "@/components/circle/CircleDocsView";
import CircleFeed from "@/components/circle/CircleFeed";
import CirclePrayerSection from "@/components/circle/CirclePrayerSection";

const RING_HALO_MS = 15 * 60 * 1000;

type CircleSubView = "charlie" | "chat" | "prayer" | "docs";

function renderAvatar(
  name: string,
  avatarUrl: string | null | undefined,
  sizePx: number
) {
  return (
    <div
      style={{ width: sizePx, height: sizePx }}
      className="rounded-full overflow-hidden bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center font-semibold text-xs shrink-0 select-none"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full object-cover"
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}

function markCircleChatRead(circleId: string, latestIso?: string | null) {
  if (typeof window === "undefined") return;
  try {
    const nowMs = Date.now();
    const latestMs = latestIso ? new Date(latestIso).getTime() : 0;
    localStorage.setItem(
      `circle_chat_last_read_${circleId}`,
      new Date(Math.max(nowMs, latestMs)).toISOString()
    );
  } catch {
    // Ignore storage write errors
  }
}

export default function CircleWorkspace({
  circleId,
}: {
  circleId?: string;
}) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [activeCircle, setActiveCircle] = useState<CircleInfo | null>(null);
  const [members, setMembers] = useState<CircleMemberProfile[]>([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [sharedTodayIds, setSharedTodayIds] = useState<Set<string>>(new Set());
  const [ringHaloMap, setRingHaloMap] = useState<Map<string, number>>(
    new Map()
  );
  const [hasUnreadGroupChat, setHasUnreadGroupChat] = useState(false);

  const [subView, setSubView] = useState<CircleSubView>("charlie");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadCircleRoom = useCallback(async () => {
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
      setActiveCircle(null);
      setLoading(false);
      return;
    }

    const savedId =
      typeof window !== "undefined"
        ? localStorage.getItem("active_circle_id")
        : null;
    const targetId = circleId || savedId || circleIds[0];

    if (!circleIds.includes(targetId)) {
      setActiveCircle(null);
      setLoading(false);
      return;
    }

    const { data: circleRow } = await supabase
      .from("circles")
      .select(
        "id, name, invite_code, created_by, max_members, avatar_url, shared_plan_id"
      )
      .eq("id", targetId)
      .maybeSingle();

    if (!circleRow) {
      setActiveCircle(null);
      setLoading(false);
      return;
    }

    setActiveCircle(circleRow);
    if (typeof window !== "undefined") {
      localStorage.setItem("active_circle_id", circleRow.id);
    }

    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const since15m = new Date(now - RING_HALO_MS).toISOString();

    const [
      { data: memberRows },
      { data: friendshipRows },
      { data: notesToday },
      { data: latestGroupMsg },
      { data: recentRings },
    ] = await Promise.all([
      supabase
        .from("circle_members")
        .select("user_id, role")
        .eq("circle_id", circleRow.id)
        .order("joined_at", { ascending: true }),
      supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
      supabase
        .from("verse_notes")
        .select("user_id")
        .contains("target_circle_ids", [circleRow.id])
        .gte("created_at", since24h),
      supabase
        .from("messages")
        .select("sender_id, created_at")
        .eq("circle_id", circleRow.id)
        .is("recipient_id", null)
        .neq("sender_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("rings")
        .select("sender_id, recipient_id, created_at")
        .eq("circle_id", circleRow.id)
        .gte("created_at", since15m),
    ]);

    const memberIds = (memberRows || []).map((m) => m.user_id);
    const { data: profiles } =
      memberIds.length > 0
        ? await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .in("id", memberIds)
        : { data: [] };

    const profMap = new Map(
      (profiles || []).map((p) => [
        p.id,
        { display_name: p.display_name, avatar_url: p.avatar_url },
      ])
    );

    setMembers(
      (memberRows || []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        display_name: profMap.get(m.user_id)?.display_name || "Fellow Reader",
        avatar_url: profMap.get(m.user_id)?.avatar_url || null,
      }))
    );

    const friends = new Set<string>();
    for (const f of friendshipRows || []) {
      friends.add(
        f.requester_id === user.id ? f.addressee_id : f.requester_id
      );
    }
    setFriendIds(friends);
    setSharedTodayIds(new Set((notesToday || []).map((n) => n.user_id)));

    const haloMap = new Map<string, number>();
    for (const r of recentRings || []) {
      if (r.recipient_id === user.id) {
        const ts = new Date(r.created_at).getTime();
        if (now - ts < RING_HALO_MS && ts > (haloMap.get(r.sender_id) ?? 0)) {
          haloMap.set(r.sender_id, ts);
        }
      }
    }
    setRingHaloMap(haloMap);

    if (latestGroupMsg && typeof window !== "undefined") {
      const lastRead = localStorage.getItem(
        `circle_chat_last_read_${circleRow.id}`
      );
      setHasUnreadGroupChat(
        !lastRead || new Date(latestGroupMsg.created_at) > new Date(lastRead)
      );
    } else {
      setHasUnreadGroupChat(false);
    }

    setLoading(false);
  }, [circleId]);

  useEffect(() => {
    loadCircleRoom();
  }, [loadCircleRoom]);

  // Clear temporary 15-minute Ring halos when they expire
  useEffect(() => {
    if (ringHaloMap.size === 0) return;
    const now = Date.now();
    const earliest = Math.min(
      ...Array.from(ringHaloMap.values()).map((ts) => ts + RING_HALO_MS - now)
    );
    const timer = setTimeout(() => {
      const cutoff = Date.now() - RING_HALO_MS;
      setRingHaloMap((prev) => {
        const next = new Map<string, number>();
        for (const [sid, ts] of prev.entries()) {
          if (ts > cutoff) next.set(sid, ts);
        }
        return next;
      });
    }, Math.max(0, earliest) + 50);
    return () => clearTimeout(timer);
  }, [ringHaloMap]);

  // Realtime updates for unread Group Chat dot & Ring halos
  useEffect(() => {
    if (!activeCircle || !userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`circle-room-${activeCircle.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `circle_id=eq.${activeCircle.id}`,
        },
        (payload) => {
          const msg = payload.new as {
            sender_id: string;
            recipient_id: string | null;
            created_at: string;
          };
          if (msg.recipient_id !== null || msg.sender_id === userId) return;
          if (subView === "chat") {
            markCircleChatRead(activeCircle.id, msg.created_at);
            setHasUnreadGroupChat(false);
          } else {
            setHasUnreadGroupChat(true);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rings",
          filter: `circle_id=eq.${activeCircle.id}`,
        },
        (payload) => {
          const ring = payload.new as {
            sender_id: string;
            recipient_id: string;
            created_at?: string;
          };
          if (ring.recipient_id === userId) {
            const ts = ring.created_at
              ? new Date(ring.created_at).getTime()
              : Date.now();
            setRingHaloMap((prev) => new Map(prev).set(ring.sender_id, ts));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCircle, userId, subView]);

  function openSubView(next: CircleSubView) {
    setSubView(next);
    setMenuOpen(false);
    if (next === "chat" && activeCircle) {
      markCircleChatRead(activeCircle.id);
      setHasUnreadGroupChat(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 bg-white border border-[#E6E1D6] rounded-2xl flex items-center justify-center text-xs text-[#6B7280]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Opening Circle room...
      </div>
    );
  }

  if (!activeCircle) {
    return (
      <div className="bg-white border border-[#E6E1D6] rounded-2xl p-6 text-center space-y-3 mt-4">
        <p className="font-editorial text-xl font-medium text-[#1F2937]">
          Circle Not Found
        </p>
        <p className="text-xs text-[#6B7280]">
          You may not be a member of this circle yet.
        </p>
        <Link
          href="/social"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Back to Social</span>
        </Link>
      </div>
    );
  }

  const sharedPlanTitle = activeCircle.shared_plan_id
    ? READING_PLAN_PRESETS.find((p) => p.id === activeCircle.shared_plan_id)
        ?.title || activeCircle.shared_plan_id
    : null;

  return (
    <div className="space-y-5 relative">
      {/* Circle Header with Left Side Dropdown Menu (☰) */}
      <header className="flex items-center justify-between gap-2.5 pt-1 pb-3 border-b border-[#E6E1D6] relative">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Open circle menu"
            aria-expanded={menuOpen}
            className="relative w-9 h-9 rounded-xl bg-[#F4F1EA] border border-[#E6E1D6] flex items-center justify-center text-[#1F2937] hover:bg-[#EAE5DA] transition-colors shrink-0 cursor-pointer"
          >
            {menuOpen ? (
              <X className="w-4 h-4" />
            ) : (
              <Menu className="w-4 h-4" />
            )}
            {hasUnreadGroupChat && subView !== "chat" && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#4A6B5D]" />
            )}
          </button>

          {renderAvatar(activeCircle.name, activeCircle.avatar_url, 38)}

          <div className="min-w-0">
            <h1 className="font-editorial text-[20px] leading-tight font-medium text-[#1F2937] tracking-tight truncate">
              {activeCircle.name}
            </h1>
            {sharedPlanTitle ? (
              <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full bg-[#EBF1EE] border border-[#CFE0D6] text-[10px] font-medium text-[#3D5A4E] max-w-[180px] truncate">
                <BookOpen className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{sharedPlanTitle}</span>
              </span>
            ) : (
              <p className="text-[11px] text-[#6B7280]">
                {members.length} of {activeCircle.max_members} members
              </p>
            )}
          </div>
        </div>

        <Link
          href="/social"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-medium text-[#4A6B5D] shrink-0 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Social</span>
        </Link>

        {/* Side Dropdown Menu */}
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
            />
            <nav
              aria-label="Circle navigation"
              className="absolute left-0 top-12 z-50 w-60 bg-white border border-[#E6E1D6] rounded-2xl shadow-xl p-2 space-y-1 text-xs"
            >
              <button
                type="button"
                onClick={() => openSubView("charlie")}
                className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer ${
                  subView === "charlie"
                    ? "bg-[#EBF1EE] text-[#4A6B5D] font-semibold"
                    : "text-[#1F2937] hover:bg-[#F4F1EA]"
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>Members (Charlie)</span>
              </button>

              <button
                type="button"
                onClick={() => openSubView("chat")}
                className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between transition-colors cursor-pointer ${
                  subView === "chat"
                    ? "bg-[#EBF1EE] text-[#4A6B5D] font-semibold"
                    : "text-[#1F2937] hover:bg-[#F4F1EA]"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span>Group Chat</span>
                </span>
                {hasUnreadGroupChat && (
                  <span
                    aria-label="Unread group chat messages"
                    className="w-2.5 h-2.5 rounded-full bg-[#4A6B5D]"
                  />
                )}
              </button>

              <button
                type="button"
                onClick={() => openSubView("prayer")}
                className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer ${
                  subView === "prayer"
                    ? "bg-[#EBF1EE] text-[#4A6B5D] font-semibold"
                    : "text-[#1F2937] hover:bg-[#F4F1EA]"
                }`}
              >
                <Heart className="w-4 h-4 shrink-0" />
                <span>Prayer Requests</span>
              </button>

              <button
                type="button"
                onClick={() => openSubView("docs")}
                className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer ${
                  subView === "docs"
                    ? "bg-[#EBF1EE] text-[#4A6B5D] font-semibold"
                    : "text-[#1F2937] hover:bg-[#F4F1EA]"
                }`}
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span>Shared Docs</span>
              </button>

              <div className="border-t border-[#E6E1D6] my-1" />

              <Link
                href={`/circles/${activeCircle.id}/settings`}
                onClick={() => setMenuOpen(false)}
                className="w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 text-[#1F2937] hover:bg-[#F4F1EA] transition-colors"
              >
                <Settings className="w-4 h-4 shrink-0 text-[#4A6B5D]" />
                <span>Circle Settings</span>
              </Link>
            </nav>
          </>
        )}
      </header>

      {/* Main Circle Sub-View */}
      {subView === "chat" && userId ? (
        <CircleFeed
          circle={activeCircle}
          members={members}
          currentUserId={userId}
          onBack={() => openSubView("charlie")}
          onSelectMember={(m) => router.push(`/members/${m.user_id}`)}
        />
      ) : subView === "prayer" && userId ? (
        <CirclePrayerSection
          circle={activeCircle}
          members={members}
          currentUserId={userId}
          onSelectMember={(m) => router.push(`/members/${m.user_id}`)}
        />
      ) : subView === "docs" && userId ? (
        <CircleDocsView
          circle={activeCircle}
          members={members}
          currentUserId={userId}
          onBack={() => openSubView("charlie")}
        />
      ) : (
        /* Spacious Avatar-First "Charlie" Constellation Canvas */
        <section className="space-y-4 pt-1 text-center">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">
              Circle Members · {members.length} of {activeCircle.max_members}
            </span>
            <button
              type="button"
              onClick={() => openSubView("chat")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4A6B5D] hover:opacity-80 cursor-pointer"
            >
              <span>Group Chat</span>
              {hasUnreadGroupChat && (
                <span className="w-2 h-2 rounded-full bg-[#4A6B5D]" />
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 pt-1">
            {members.map((member, index) => {
              const isSelf = member.user_id === userId;
              const isFriend = friendIds.has(member.user_id);
              const sharedToday = sharedTodayIds.has(member.user_id);
              const hasRingHalo = ringHaloMap.has(member.user_id);

              const roleLabel = isSelf
                ? "You"
                : isFriend
                  ? "Friend"
                  : member.role === "leader"
                    ? "Leader"
                    : "Member";

              return (
                <Link
                  key={member.user_id}
                  href={`/members/${member.user_id}`}
                  className={`bg-white border border-[#E6E1D6] hover:border-[#4A6B5D] rounded-3xl p-4 flex flex-col items-center gap-2 transition-all group shadow-2xs ${
                    index % 2 === 1 ? "sm:translate-y-1.5" : ""
                  }`}
                >
                  <div className="relative">
                    {hasRingHalo && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -inset-1.5 rounded-full bg-[#7C9A82]/20 ring-2 ring-[#7C9A82]/55 shadow-[0_0_12px_rgba(124,154,130,0.35)]"
                      />
                    )}
                    <div
                      className={`relative rounded-full p-0.5 transition-transform group-hover:scale-105 ${
                        sharedToday
                          ? "ring-2 ring-[#4A6B5D]"
                          : "ring-1 ring-[#E6E1D6]"
                      }`}
                    >
                      {renderAvatar(member.display_name, member.avatar_url, 60)}
                    </div>
                    {sharedToday && (
                      <span
                        className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#4A6B5D] border-2 border-white dark:border-[#1E1E1C]"
                        title="Shared reflection today"
                      />
                    )}
                  </div>

                  <span className="text-xs font-semibold text-[#1F2937] truncate w-full">
                    {member.display_name}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      isFriend
                        ? "bg-[#EBF1EE] text-[#4A6B5D]"
                        : "bg-[#F4F1EA] text-[#6B7280]"
                    }`}
                  >
                    {roleLabel}
                  </span>
                </Link>
              );
            })}
          </div>

          <p className="text-[11px] text-[#6B7280] pt-2">
            Tap any member to view their profile, reflections, or connect
            1-on-1.
          </p>
        </section>
      )}
    </div>
  );
}
