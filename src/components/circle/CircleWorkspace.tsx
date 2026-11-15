"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  BellRing,
  BookOpen,
  ChevronLeft,
  FileText,
  Heart,
  Loader2,
  MessageSquare,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { getInitials } from "@/components/ui/Navbar";
import { triggerRingPush } from "@/lib/notifications/push-client";
import { READING_PLAN_PRESETS } from "@/lib/plans/reading-plans";
import { createClient } from "@/lib/supabase/client";
import type {
  CircleInfo,
  CircleMemberProfile,
} from "@/components/circle/CircleManager";
import CircleDocsView from "@/components/circle/CircleDocsView";
import CircleFeed from "@/components/circle/CircleFeed";
import CirclePrayerSection from "@/components/circle/CirclePrayerSection";
import DirectMessageDrawer from "@/components/circle/DirectMessageDrawer";

const RING_COOLDOWN_MS = 10 * 60 * 1000;
const RING_HALO_MS = 15 * 60 * 1000;

interface SharedReflection {
  passage: string;
  content: string;
  created_at: string;
}

interface MessageSummary {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  content: string;
  image_url: string | null;
  created_at: string;
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diffMin = Math.max(
    1,
    Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  );
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return `${Math.floor(diffHr / 24)}d`;
}

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

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

export default function CircleWorkspace({
  circleId,
}: {
  circleId?: string;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [circles, setCircles] = useState<CircleInfo[]>([]);
  const [activeCircleId, setActiveCircleId] = useState<string | null>(null);
  const [members, setMembers] = useState<CircleMemberProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Navigation: 'inbox' | 'group-chat' | 'dm'
  const [activeView, setActiveView] = useState<"inbox" | "group-chat">("inbox");
  const [circleTab, setCircleTab] = useState<"inbox" | "prayer" | "docs">(
    "inbox"
  );
  const [dmTarget, setDmTarget] = useState<CircleMemberProfile | null>(null);

  // Slide-Up Member Card Drawer
  const [drawerMember, setDrawerMember] = useState<CircleMemberProfile | null>(
    null
  );

  // Search filter
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Today's voluntary shared reflections per user_id (strictly from verse_notes & messages)
  const [sharedTodayMap, setSharedTodayMap] = useState<
    Map<string, SharedReflection>
  >(new Map());

  // Latest group message & DM threads
  const [latestGroupMsg, setLatestGroupMsg] = useState<MessageSummary | null>(
    null
  );
  const [latestDmByPeer, setLatestDmByPeer] = useState<
    Map<string, MessageSummary>
  >(new Map());

  // 10-minute outgoing Ring cooldown, 15-minute incoming Ring avatar halo, & toast feedback
  const [rungMemberIds, setRungMemberIds] = useState<Set<string>>(new Set());
  const [ringHaloMap, setRingHaloMap] = useState<Map<string, number>>(new Map());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2800);
  }

  const loadInboxData = useCallback(async (preferredCircleId?: string) => {
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
      setActiveCircleId(null);
      setLoading(false);
      return;
    }

    const { data: circleRows } = await supabase
      .from("circles")
      .select(
        "id, name, invite_code, created_by, max_members, avatar_url, shared_plan_id"
      )
      .in("id", circleIds)
      .order("created_at", { ascending: true });

    const list = circleRows || [];
    setCircles(list);

    const savedId =
      typeof window !== "undefined"
        ? localStorage.getItem("active_circle_id")
        : null;
    const requestedId = circleId || preferredCircleId;
    const active = circleId
      ? list.find((c) => c.id === circleId) || null
      : list.find((c) => c.id === (requestedId || savedId)) || list[0] || null;

    if (!active) {
      setActiveCircleId(null);
      setLoading(false);
      return;
    }

    setActiveCircleId(active.id);
    if (typeof window !== "undefined") {
      localStorage.setItem("active_circle_id", active.id);
    }

    // Load circle members + profiles
    const { data: memberRows } = await supabase
      .from("circle_members")
      .select("user_id, role")
      .eq("circle_id", active.id)
      .order("joined_at", { ascending: true });

    const ids = (memberRows || []).map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", ids);

    const profMap = new Map(
      (profiles || []).map((p) => [
        p.id,
        { display_name: p.display_name, avatar_url: p.avatar_url },
      ])
    );

    const enrichedMembers: CircleMemberProfile[] = (memberRows || []).map(
      (m) => ({
        user_id: m.user_id,
        role: m.role,
        display_name: profMap.get(m.user_id)?.display_name || "Fellow Reader",
        avatar_url: profMap.get(m.user_id)?.avatar_url || null,
      })
    );
    setMembers(enrichedMembers);

    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const since15m = new Date(now - RING_HALO_MS).toISOString();
    const since10mMs = now - RING_COOLDOWN_MS;

    const [{ data: notesToday }, { data: allMessages }, { data: recentRings }] =
      await Promise.all([
        supabase
          .from("verse_notes")
          .select(
            "user_id, book, chapter, verse_start, verse_end, content, created_at"
          )
          .eq("circle_id", active.id)
          .gte("created_at", since24h)
          .order("created_at", { ascending: false }),
        supabase
          .from("messages")
          .select("id, sender_id, recipient_id, content, image_url, created_at")
          .eq("circle_id", active.id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("rings")
          .select("sender_id, recipient_id, created_at")
          .eq("circle_id", active.id)
          .gte("created_at", since15m),
      ]);

    // Build sharedTodayMap strictly from voluntary verse_notes and group messages
    const reflectionMap = new Map<string, SharedReflection>();
    for (const n of notesToday || []) {
      if (!reflectionMap.has(n.user_id)) {
        const range =
          n.verse_end > n.verse_start
            ? `${n.verse_start}–${n.verse_end}`
            : `${n.verse_start}`;
        reflectionMap.set(n.user_id, {
          passage: `${n.book} ${n.chapter}:${range}`,
          content: n.content,
          created_at: n.created_at,
        });
      }
    }

    let newestGroup: MessageSummary | null = null;
    const dmMap = new Map<string, MessageSummary>();

    for (const msg of allMessages || []) {
      if (msg.recipient_id === null) {
        if (!newestGroup) newestGroup = msg;
        if (
          msg.created_at >= since24h &&
          !reflectionMap.has(msg.sender_id)
        ) {
          reflectionMap.set(msg.sender_id, {
            passage: msg.image_url ? "Notebook Reflection" : "Circle Reflection",
            content: msg.content,
            created_at: msg.created_at,
          });
        }
      } else if (
        msg.sender_id === user.id ||
        msg.recipient_id === user.id
      ) {
        const peerId =
          msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
        if (peerId && !dmMap.has(peerId)) {
          dmMap.set(peerId, msg);
        }
      }
    }

    const outgoingRungIds = new Set<string>();
    const incomingHaloMap = new Map<string, number>();
    for (const r of recentRings || []) {
      const ts = new Date(r.created_at).getTime();
      if (r.sender_id === user.id && ts >= since10mMs) {
        outgoingRungIds.add(r.recipient_id);
      }
      if (r.recipient_id === user.id && now - ts < RING_HALO_MS) {
        const prevTs = incomingHaloMap.get(r.sender_id) ?? 0;
        if (ts > prevTs) incomingHaloMap.set(r.sender_id, ts);
      }
    }

    setSharedTodayMap(reflectionMap);
    setLatestGroupMsg(newestGroup);
    setLatestDmByPeer(dmMap);
    setRungMemberIds(outgoingRungIds);
    setRingHaloMap(incomingHaloMap);
    setLoading(false);
  }, [circleId]);

  useEffect(() => {
    loadInboxData(circleId);
  }, [loadInboxData, circleId]);

  // Automatically clear temporary 15-minute muted-sage halos when they expire
  useEffect(() => {
    if (ringHaloMap.size === 0) return;
    const now = Date.now();
    let earliestRemaining = Infinity;
    for (const ts of ringHaloMap.values()) {
      const remaining = ts + RING_HALO_MS - now;
      if (remaining < earliestRemaining) earliestRemaining = remaining;
    }
    const timer = setTimeout(() => {
      const cutoff = Date.now() - RING_HALO_MS;
      setRingHaloMap((prev) => {
        const next = new Map<string, number>();
        for (const [senderId, ts] of prev.entries()) {
          if (ts > cutoff) next.set(senderId, ts);
        }
        return next;
      });
    }, Math.max(0, earliestRemaining) + 50);

    return () => clearTimeout(timer);
  }, [ringHaloMap]);

  // Subscribe to Supabase Realtime on messages & rings for live Inbox & Ring updates
  useEffect(() => {
    if (!activeCircleId || !userId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`circle-inbox-${activeCircleId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `circle_id=eq.${activeCircleId}`,
        },
        () => {
          loadInboxData(activeCircleId);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rings",
          filter: `circle_id=eq.${activeCircleId}`,
        },
        (payload) => {
          const newRing = payload.new as {
            sender_id: string;
            recipient_id: string;
            created_at?: string;
          };
          if (newRing.recipient_id === userId) {
            const ts = newRing.created_at
              ? new Date(newRing.created_at).getTime()
              : Date.now();
            setRingHaloMap((prev) => {
              const next = new Map(prev);
              next.set(newRing.sender_id, ts);
              return next;
            });
          }
          loadInboxData(activeCircleId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCircleId, userId, loadInboxData]);

  async function handleSendRing(target: CircleMemberProfile) {
    if (!activeCircleId || !userId) return;
    if (rungMemberIds.has(target.user_id)) {
      showToast("Already rung · 10m gentle cooldown active");
      return;
    }

    const supabase = createClient();
    const ringMessage = "Praying for your time in the Word today";
    const { error } = await supabase.from("rings").insert({
      circle_id: activeCircleId,
      sender_id: userId,
      recipient_id: target.user_id,
      message: ringMessage,
    });

    if (error) {
      showToast("Already rung · 10m gentle cooldown active");
      return;
    }

    triggerRingPush({
      circleId: activeCircleId,
      recipientId: target.user_id,
      message: ringMessage,
    });

    setRungMemberIds((prev) => new Set(prev).add(target.user_id));
    showToast(
      `Sent gentle Ring to ${target.display_name.split(" ")[0]}: "${ringMessage}"`
    );
  }

  const activeCircle = circles.find((c) => c.id === activeCircleId) || null;
  const memberById = new Map(members.map((m) => [m.user_id, m]));

  if (loading) {
    return (
      <div className="p-8 bg-white border border-[#E6E1D6] rounded-2xl flex items-center justify-center text-xs text-[#6B7280]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading Circles...
      </div>
    );
  }

  if (!activeCircle) {
    return (
      <div className="bg-white border border-[#E6E1D6] rounded-2xl p-6 text-center space-y-3 mt-4">
        <p className="font-editorial text-xl font-medium text-[#1F2937]">
          {circleId ? "Circle Not Found" : "Welcome to Circles"}
        </p>
        <p className="text-xs text-[#6B7280]">
          {circleId
            ? "You may not be a member of this circle yet."
            : "Join an invite-only circle (up to 12 members) or start a new one."}
        </p>
        <Link
          href="/circle"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white text-xs font-medium transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Back to Circles</span>
        </Link>
      </div>
    );
  }

  if (activeView === "group-chat" && userId) {
    return (
      <div className="space-y-3">
        <CircleFeed
          circle={activeCircle}
          members={members}
          currentUserId={userId}
          onBack={() => {
            setActiveView("inbox");
            loadInboxData(activeCircle.id);
          }}
          onSelectMember={(m) => setDrawerMember(m)}
        />
      </div>
    );
  }

  // Filter & sort 1-on-1 DM threads by most recent message
  const filteredMembers = searchQuery
    ? members.filter((m) =>
        m.display_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : members;

  const dmPeers = filteredMembers
    .filter((m) => m.user_id !== userId)
    .sort((a, b) => {
      const msgA = latestDmByPeer.get(a.user_id)?.created_at || "";
      const msgB = latestDmByPeer.get(b.user_id)?.created_at || "";
      return msgB.localeCompare(msgA);
    });

  const latestGroupAuthor = latestGroupMsg
    ? memberById.get(latestGroupMsg.sender_id)?.display_name.split(" ")[0] ||
      "Member"
    : null;

  const drawerReflection = drawerMember
    ? sharedTodayMap.get(drawerMember.user_id) || null
    : null;
  const isDrawerMemberRung = drawerMember
    ? rungMemberIds.has(drawerMember.user_id)
    : false;

  const sharedPlanTitle = activeCircle.shared_plan_id
    ? READING_PLAN_PRESETS.find((p) => p.id === activeCircle.shared_plan_id)
        ?.title || activeCircle.shared_plan_id
    : null;

  return (
    <div className="space-y-5 relative">
      {/* Gentle Toast Banner */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] bg-[#1F2937] dark:bg-[#2E2E2B] text-[#FAF9F6] dark:text-[#F3F2EE] text-xs font-medium px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#7FB09A] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Circle Header: Back to /circle, Avatar + Name + Shared Plan Pill, Search & Settings */}
      <div className="flex items-center justify-between gap-2.5 pt-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/circle"
            aria-label="Back to Circles"
            className="w-9 h-9 rounded-full bg-[#F4F1EA] border border-[#E6E1D6] flex items-center justify-center text-[#1F2937] hover:bg-[#EAE5DA] transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>

          {renderAvatar(activeCircle.name, activeCircle.avatar_url, 40)}

          <div className="min-w-0">
            <h1 className="font-editorial text-[22px] leading-tight font-medium text-[#1F2937] tracking-tight truncate">
              {activeCircle.name}
            </h1>
            {sharedPlanTitle && (
              <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full bg-[#EBF1EE] border border-[#CFE0D6] text-[10px] font-medium text-[#3D5A4E] max-w-[180px] truncate">
                <BookOpen className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{sharedPlanTitle}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowSearch((prev) => !prev);
              setSearchQuery("");
            }}
            aria-label="Search Circle"
            className="w-9 h-9 rounded-full bg-[#F4F1EA] border border-[#E6E1D6] flex items-center justify-center text-[#1F2937] hover:bg-[#EAE5DA] transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </button>

          <Link
            href={`/circles/${activeCircle.id}/settings`}
            aria-label="Circle Settings"
            title="Circle Settings"
            className="w-9 h-9 rounded-full bg-[#F4F1EA] border border-[#E6E1D6] flex items-center justify-center text-[#1F2937] hover:bg-[#EAE5DA] transition-colors"
          >
            <Settings className="w-4 h-4 text-[#4A6B5D]" />
          </Link>
        </div>
      </div>

      {showSearch && (
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter circle members..."
          className="w-full bg-white border border-[#E6E1D6] rounded-xl px-3.5 py-2 text-xs text-[#1F2937] placeholder-[#6B7280] focus:outline-none focus:border-[#4A6B5D]"
        />
      )}

      {/* 1. Horizontal Avatar Strip: Your Circle (N of 12) */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
            Your Circle · {members.length} of {activeCircle.max_members}
          </span>
          <span className="text-[11px] text-[#4A6B5D] font-medium">
            Tap avatar for notes
          </span>
        </div>

        <div className="flex items-start gap-3.5 overflow-x-auto no-scrollbar py-2 px-1.5 -mx-1.5">
          {filteredMembers.map((member) => {
            const sharedToday = sharedTodayMap.has(member.user_id);
            const hasRingHalo = ringHaloMap.has(member.user_id);
            const shortName = member.display_name.split(" ")[0];

            return (
              <button
                key={member.user_id}
                type="button"
                onClick={() => setDrawerMember(member)}
                title={hasRingHalo ? "Sent a gentle Ring recently" : undefined}
                className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-none cursor-pointer"
              >
                <div className="relative">
                  {hasRingHalo && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-1.5 rounded-full bg-[#7C9A82]/20 ring-2 ring-[#7C9A82]/55 shadow-[0_0_12px_rgba(124,154,130,0.35)]"
                    />
                  )}
                  <div
                    className={`relative w-[60px] h-[60px] rounded-full p-[2px] ${
                      sharedToday
                        ? "ring-2 ring-[#4A6B5D] bg-[#FAF9F6]"
                        : hasRingHalo
                          ? "ring-1 ring-[#7C9A82] bg-[#FAF9F6]"
                          : "ring-1 ring-[#E6E1D6] bg-[#FAF9F6]"
                    } group-hover:scale-[1.03] transition-transform flex items-center justify-center`}
                  >
                    {renderAvatar(member.display_name, member.avatar_url, 56)}
                  </div>
                  {sharedToday && (
                    <span
                      className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#4A6B5D] border-2 border-[#FAF9F6]"
                      title="Shared reflection today"
                    />
                  )}
                  {member.role === "leader" && (
                    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-[1px] rounded-full text-[9px] font-semibold bg-[#4A6B5D] text-white shadow-2xs">
                      Leader
                    </span>
                  )}
                </div>
                <span className="text-[11.5px] font-medium text-[#1F2937] mt-0.5 max-w-[64px] truncate">
                  {shortName}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Inbox / Prayer / Docs Tab Switcher */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#F4F1EA] border border-[#E6E1D6]">
        <button
          type="button"
          onClick={() => setCircleTab("inbox")}
          className={`py-2 px-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            circleTab === "inbox"
              ? "bg-white text-[#1F2937] shadow-2xs"
              : "text-[#6B7280] hover:text-[#1F2937]"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-[#4A6B5D]" />
          <span>Inbox</span>
        </button>

        <button
          type="button"
          onClick={() => setCircleTab("prayer")}
          className={`py-2 px-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            circleTab === "prayer"
              ? "bg-white text-[#1F2937] shadow-2xs"
              : "text-[#6B7280] hover:text-[#1F2937]"
          }`}
        >
          <Heart className="w-3.5 h-3.5 text-[#4A6B5D]" />
          <span>Prayer</span>
        </button>

        <button
          type="button"
          onClick={() => setCircleTab("docs")}
          className={`py-2 px-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            circleTab === "docs"
              ? "bg-white text-[#1F2937] shadow-2xs"
              : "text-[#6B7280] hover:text-[#1F2937]"
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-[#4A6B5D]" />
          <span>Docs</span>
        </button>
      </div>

      {circleTab === "prayer" && userId ? (
        <CirclePrayerSection
          circle={activeCircle}
          members={members}
          currentUserId={userId}
          onSelectMember={(m) => setDrawerMember(m)}
        />
      ) : circleTab === "docs" && userId ? (
        <CircleDocsView
          circle={activeCircle}
          members={members}
          currentUserId={userId}
          onBack={() => setCircleTab("inbox")}
        />
      ) : (
        <>
          {/* 2. Pinned Main Circle Group Chat Card */}
          <div>
            <button
              type="button"
              onClick={() => setActiveView("group-chat")}
              className="w-full text-left bg-white hover:bg-[#FCFBF8] border border-[#E6E1D6] rounded-2xl p-3.5 shadow-2xs transition-all flex items-center gap-3.5 group cursor-pointer"
            >
              <div className="w-[52px] h-[52px] rounded-2xl bg-[#EBF1EE] text-[#4A6B5D] flex items-center justify-center shrink-0 relative">
                <Users className="w-6 h-6" />
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#4A6B5D] ring-2 ring-white" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#4A6B5D]">
                    Pinned Circle Thread
                  </span>
                  <span className="text-[11px] text-[#6B7280]">
                    {latestGroupMsg
                      ? formatRelativeTime(latestGroupMsg.created_at)
                      : "Now"}
                  </span>
                </div>
                <h2 className="text-[14.5px] font-semibold text-[#1F2937] truncate group-hover:text-[#4A6B5D] transition-colors">
                  {activeCircle.name}
                </h2>
                <p className="text-[12.5px] text-[#6B7280] truncate mt-0.5">
                  {latestGroupMsg
                    ? `${latestGroupAuthor}: ${
                        latestGroupMsg.image_url
                          ? "Uploaded a handwritten notebook page"
                          : latestGroupMsg.content
                      }`
                    : "Tap to open your Circle group fellowship chat"}
                </p>
              </div>
            </button>
          </div>

          {/* 3. 1-on-1 Fellowship Direct Messages */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                1-on-1 Fellowship
              </span>
              <span className="text-[11px] text-[#6B7280]">Private DMs</span>
            </div>

            {dmPeers.length === 0 ? (
              <div className="bg-white border border-[#E6E1D6] rounded-2xl p-5 text-center text-xs text-[#6B7280]">
                Share your invite code in{" "}
                <Link
                  href={`/circles/${activeCircle.id}/settings`}
                  className="text-[#4A6B5D] underline"
                >
                  Circle Settings
                </Link>{" "}
                to begin 1-on-1 conversations.
              </div>
            ) : (
              <div className="bg-white border border-[#E6E1D6] rounded-2xl divide-y divide-[#E6E1D6] overflow-hidden">
                {dmPeers.map((peer) => {
                  const lastDm = latestDmByPeer.get(peer.user_id);
                  const unread = lastDm && lastDm.sender_id === peer.user_id;

                  return (
                    <button
                      key={peer.user_id}
                      type="button"
                      onClick={() => setDmTarget(peer)}
                      className="w-full text-left px-3.5 py-3 hover:bg-[#FAF9F6] transition-colors flex items-center gap-3 cursor-pointer"
                    >
                      <div className="relative shrink-0">
                        {renderAvatar(peer.display_name, peer.avatar_url, 46)}
                        {unread && (
                          <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-[#4A6B5D] ring-2 ring-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-[13.5px] font-semibold text-[#1F2937] truncate">
                              {peer.display_name}
                            </span>
                            {peer.role === "leader" && (
                              <span className="px-1.5 py-[1px] rounded-md text-[10px] font-medium bg-[#EBF1EE] text-[#4A6B5D] shrink-0">
                                Leader
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-[#6B7280] shrink-0">
                            {lastDm ? formatRelativeTime(lastDm.created_at) : ""}
                          </span>
                        </div>
                        <p
                          className={`text-[12.5px] truncate mt-0.5 ${
                            unread
                              ? "text-[#1F2937] font-medium"
                              : "text-[#6B7280]"
                          }`}
                        >
                          {lastDm
                            ? lastDm.content
                            : `Start a 1-on-1 conversation with ${
                                peer.display_name.split(" ")[0]
                              }`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Slide-Up Member Card Drawer Overlay matching docs/ui-reference.html */}
      {drawerMember && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerMember(null);
          }}
          className="fixed inset-0 z-50 bg-[#1F2937]/30 backdrop-blur-[1px] flex flex-col justify-end"
        >
          <div className="max-w-xl w-full mx-auto bg-[#FAF9F6] rounded-t-[30px] border-t border-[#E6E1D6] shadow-2xl px-5 pt-3 pb-8 flex flex-col">
            {/* Drag Handle */}
            <div className="w-10 h-1 rounded-full bg-[#D6D0C4] mx-auto mb-4" />

            {/* Header Row */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3.5">
                <div className="rounded-full ring-2 ring-[#E6E1D6] p-0.5 bg-white">
                  {renderAvatar(
                    drawerMember.display_name,
                    drawerMember.avatar_url,
                    68
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-editorial text-xl font-semibold text-[#1F2937]">
                      {drawerMember.display_name}
                    </h3>
                    {drawerMember.role === "leader" && (
                      <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#EBF1EE] text-[#4A6B5D]">
                        Leader / Pastor
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    Member of {activeCircle.name}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrawerMember(null)}
                aria-label="Close member drawer"
                className="w-8 h-8 rounded-full bg-[#F4F1EA] text-[#6B7280] hover:text-[#1F2937] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Shared Today Card (Voluntary notes only — zero private reading progress) */}
            <div className="bg-white border border-[#E6E1D6] rounded-2xl p-4 mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4A6B5D]">
                  Shared Today
                </span>
                {drawerReflection && (
                  <span className="text-[11px] text-[#6B7280]">
                    {formatClockTime(drawerReflection.created_at)}
                  </span>
                )}
              </div>

              {drawerReflection ? (
                <>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F4F1EA] text-[#1F2937] text-xs font-medium mb-2">
                    <BookOpen className="w-3.5 h-3.5 text-[#4A6B5D]" />
                    <span>{drawerReflection.passage}</span>
                  </div>
                  <p className="font-editorial text-[15px] leading-relaxed text-[#1F2937]">
                    &ldquo;{drawerReflection.content}&rdquo;
                  </p>
                </>
              ) : (
                <p className="text-xs text-[#6B7280] leading-relaxed py-2">
                  No reflection shared today — resting in grace. Private reading
                  progress stays personal.
                </p>
              )}
            </div>

            {/* Two Large Thumb-Friendly Action Buttons */}
            {drawerMember.user_id !== userId ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const target = drawerMember;
                    setDrawerMember(null);
                    setDmTarget(target);
                  }}
                  className="py-3 px-4 rounded-2xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-sm font-medium flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Message</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendRing(drawerMember)}
                  className={`py-3 px-4 rounded-2xl border text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    isDrawerMemberRung
                      ? "bg-[#F4F1EA] border-[#E6E1D6] text-[#6B7280]"
                      : "bg-[#FBF5EE] border-[#E7D3BC] text-[#B47B44] hover:bg-[#F6EAD9]"
                  }`}
                >
                  <BellRing className="w-4 h-4" />
                  <span>{isDrawerMemberRung ? "Rung · 10m" : "Ring"}</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/reader"
                  onClick={() => setDrawerMember(null)}
                  className="py-3 px-4 rounded-2xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-sm font-medium flex items-center justify-center gap-2 shadow-2xs transition-colors"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Open Reader</span>
                </Link>
                <Link
                  href={`/circles/${activeCircle.id}/settings`}
                  onClick={() => setDrawerMember(null)}
                  className="py-3 px-4 rounded-2xl bg-[#F4F1EA] border border-[#E6E1D6] text-[#1F2937] text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span>Circle Settings</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 1-on-1 Direct Message Drawer */}
      {activeCircle && userId && dmTarget && (
        <DirectMessageDrawer
          circle={activeCircle}
          currentUserId={userId}
          recipient={dmTarget}
          onClose={() => {
            setDmTarget(null);
            loadInboxData(activeCircle.id);
          }}
          onOpenMemberCard={(m) => setDrawerMember(m)}
        />
      )}
    </div>
  );
}
