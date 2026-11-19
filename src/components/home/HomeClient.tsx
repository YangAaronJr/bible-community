"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Check,
  Loader2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import Navbar, { getInitials } from "@/components/ui/Navbar";
import { OliveBranchMark } from "@/components/ui/MinimalIllustrations";
import type { InitialSessionProfile } from "@/lib/auth/server-auth";
import { createClient } from "@/lib/supabase/client";
import {
  READING_PLAN_PRESETS,
  chapterKey,
  combineDailyReadings,
  getNextUnreadChapters,
  isRestDay,
  parseSharedPlan,
  resolveTrackSequence,
  resolveUnifiedPlanSequence,
  type ChapterRef,
  type CustomScheduleSlot,
  type ReadingPlanPreset,
  type UnifiedPlan,
} from "@/lib/plans/reading-plans";

interface ProgressEntry {
  book: string;
  chapter: number;
  read_in_physical_bible: boolean;
}

interface FriendDmUpdate {
  kind: "friend-dm";
  id: string;
  friendshipId: string;
  actorName: string;
  avatarUrl: string | null;
  unread: boolean;
  createdAt: string;
}

interface FriendRequestUpdate {
  kind: "friend-request";
  id: string;
  friendshipId: string;
  requesterId: string;
  actorName: string;
  avatarUrl: string | null;
  createdAt: string;
}

interface CircleActivityUpdate {
  kind: "circle-activity";
  id: string;
  circleId: string;
  circleName: string;
  avatarUrl: string | null;
  createdAt: string;
}

interface CirclePlanUpdate {
  kind: "circle-plan-update";
  id: string;
  circleId: string;
  circleName: string;
  avatarUrl: string | null;
  planId: string;
  planTitle: string;
  createdAt: string;
}

type UpdateItem =
  | FriendDmUpdate
  | FriendRequestUpdate
  | CircleActivityUpdate
  | CirclePlanUpdate;

interface CustomScheduleState {
  title: string;
  rest_days: number[];
  schedule_items: CustomScheduleSlot[];
}

interface HomeSnapshot {
  userId: string | null;
  planId: "nt-90" | "gospels-psalms" | null;
  progressMap: Map<string, ProgressEntry>;
  activeCustomSchedule: CustomScheduleState | null;
  activeCirclePlan: UnifiedPlan | null;
  updates: UpdateItem[];
}

function getLatestTimestampMs(...isos: Array<string | null | undefined>): number {
  let max = 0;
  for (const iso of isos) {
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (Number.isFinite(ms) && ms > max) {
      max = ms;
    }
  }
  return max;
}

function gatherPortionChapters(
  sequence: ChapterRef[],
  progressMap: Map<string, ProgressEntry>,
  sessionKeys: Set<string>,
  targetCount: number
): ChapterRef[] {
  const count = Math.max(1, targetCount);
  const remaining = sequence.filter((c) => {
    const key = chapterKey(c.book, c.chapter);
    return !progressMap.has(key) || sessionKeys.has(key);
  });
  if (remaining.length > 0) return remaining.slice(0, count);
  return sequence.length > 0 ? [sequence[0]] : [];
}

async function fetchHomeSnapshot(): Promise<HomeSnapshot> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let planId: "nt-90" | "gospels-psalms" | null = null;
  if (typeof window !== "undefined") {
    try {
      const savedPlan = localStorage.getItem("selected_reading_plan");
      if (savedPlan === "nt-90" || savedPlan === "gospels-psalms") {
        planId = savedPlan;
      }
    } catch {
      // Ignore storage read errors
    }
  }

  if (!user) {
    return {
      userId: null,
      planId,
      progressMap: new Map(),
      activeCustomSchedule: null,
      activeCirclePlan: null,
      updates: [],
    };
  }

  const { data: progressRows } = await supabase
    .from("reading_progress")
    .select("book, chapter, read_in_physical_bible")
    .eq("user_id", user.id);

  const map = new Map<string, ProgressEntry>();
  for (const row of progressRows || []) {
    map.set(chapterKey(row.book, row.chapter), row);
  }

  const { data: activeSched } = await supabase
    .from("custom_schedules")
    .select("title, rest_days, schedule_items")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const activeCustomSchedule: CustomScheduleState | null = activeSched
    ? {
        title: activeSched.title,
        rest_days: activeSched.rest_days ?? [],
        schedule_items: Array.isArray(activeSched.schedule_items)
          ? (activeSched.schedule_items as unknown as CustomScheduleSlot[])
          : [],
      }
    : null;

  // Fetch minimalist Updates: pending incoming requests, unread 1-on-1 DMs & Circle activity
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data: friendships }, { data: memberships }, { data: readStates }] =
    await Promise.all([
      supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status, created_at")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
      supabase
        .from("circle_members")
        .select("circle_id")
        .eq("user_id", user.id),
      supabase
        .from("user_read_states")
        .select("scope_type, scope_id, last_read_at")
        .eq("user_id", user.id),
    ]);

  const dmReadMap = new Map<string, string>();
  const circleReadMap = new Map<string, string>();
  for (const rs of readStates || []) {
    if (rs.scope_type === "dm") {
      dmReadMap.set(rs.scope_id, rs.last_read_at);
    } else if (rs.scope_type === "circle") {
      circleReadMap.set(rs.scope_id, rs.last_read_at);
    }
  }

  const items: UpdateItem[] = [];
  const allFriendships = friendships || [];
  const acceptedFriendships = allFriendships.filter(
    (f) => f.status === "accepted"
  );
  const incomingRequests = allFriendships.filter(
    (f) => f.status === "pending" && f.addressee_id === user.id
  );

  // 1. Incoming 1-on-1 Friend DMs (per-friendship check, no global cap)
  const unreadDms: Array<{
    friendshipId: string;
    senderId: string;
    createdAt: string;
  }> = [];

  if (acceptedFriendships.length > 0) {
    const latestResults = await Promise.all(
      acceptedFriendships.map((f) =>
        supabase
          .from("messages")
          .select("friendship_id, sender_id, created_at")
          .eq("friendship_id", f.id)
          .neq("sender_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      )
    );

    for (const { data: dm } of latestResults) {
      if (!dm?.friendship_id) continue;
      const localLastRead =
        typeof window !== "undefined"
          ? localStorage.getItem(`dm_last_read_${dm.friendship_id}`)
          : null;
      const lastReadMs = getLatestTimestampMs(
        dmReadMap.get(dm.friendship_id),
        localLastRead
      );
      const isUnread =
        lastReadMs === 0 || new Date(dm.created_at).getTime() > lastReadMs;
      if (isUnread) {
        unreadDms.push({
          friendshipId: dm.friendship_id,
          senderId: dm.sender_id,
          createdAt: dm.created_at,
        });
      }
    }
  }

  // Hydrate profiles for both unread DM senders and incoming friend requests
  const actorIdsToHydrate = Array.from(
    new Set([
      ...unreadDms.map((d) => d.senderId),
      ...incomingRequests.map((r) => r.requester_id),
    ])
  );

  if (actorIdsToHydrate.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", actorIdsToHydrate);
    const profMap = new Map((profs || []).map((p) => [p.id, p]));

    for (const dm of unreadDms) {
      const prof = profMap.get(dm.senderId);
      items.push({
        kind: "friend-dm",
        id: `dm-${dm.friendshipId}`,
        friendshipId: dm.friendshipId,
        actorName: prof?.display_name || "Friend",
        avatarUrl: prof?.avatar_url || null,
        unread: true,
        createdAt: dm.createdAt,
      });
    }

    for (const req of incomingRequests) {
      const prof = profMap.get(req.requester_id);
      items.push({
        kind: "friend-request",
        id: `req-${req.id}`,
        friendshipId: req.id,
        requesterId: req.requester_id,
        actorName: prof?.display_name || "Fellow Reader",
        avatarUrl: prof?.avatar_url || null,
        createdAt: req.created_at,
      });
    }
  }

  // 2. Non-granular Circle activity indicators
  const circleIds = (memberships || []).map((m) => m.circle_id);
  let activeCirclePlan: UnifiedPlan | null = null;
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  if (circleIds.length > 0) {
    const [
      { data: circleRows },
      { data: recentCircleMsgs },
      { data: recentPrayers },
      { data: recentDocs },
      { data: recentPlanUpdates },
    ] = await Promise.all([
      supabase
        .from("circles")
        .select("id, name, avatar_url, shared_plan_id")
        .in("id", circleIds),
      supabase
        .from("messages")
        .select("circle_id, created_at")
        .in("circle_id", circleIds)
        .is("recipient_id", null)
        .neq("sender_id", user.id)
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("prayer_requests")
        .select("circle_id, created_at")
        .in("circle_id", circleIds)
        .neq("user_id", user.id)
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("circle_docs")
        .select("circle_id, updated_at")
        .in("circle_id", circleIds)
        .neq("updated_by", user.id)
        .gte("updated_at", since24h)
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .from("circle_plan_updates")
        .select("id, circle_id, actor_id, plan_id, plan_title, created_at")
        .in("circle_id", circleIds)
        .neq("actor_id", user.id)
        .gte("created_at", since7d)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const preferredCircleId =
      typeof window !== "undefined"
        ? localStorage.getItem("active_circle_id")
        : null;
    const sortedCircles = [...(circleRows || [])].sort((a, b) =>
      a.id === preferredCircleId ? -1 : b.id === preferredCircleId ? 1 : 0
    );
    for (const c of sortedCircles) {
      const parsed = parseSharedPlan(c.shared_plan_id);
      if (parsed) {
        activeCirclePlan =
          parsed.kind === "preset"
            ? {
                id: `circle-${c.id}`,
                title: parsed.preset.title,
                presetId: parsed.preset.id,
                books: [],
                chaptersPerDay: parsed.preset.dailyTargetCount,
                restDays: [],
                source: "circle",
                circleId: c.id,
                circleName: c.name,
              }
            : {
                id: `circle-${c.id}`,
                title: parsed.custom.title,
                presetId: null,
                books: parsed.custom.books,
                chaptersPerDay: parsed.custom.chaptersPerDay,
                restDays: parsed.custom.restDays,
                source: "circle",
                circleId: c.id,
                circleName: c.name,
              };
        break;
      }
    }

    const circleById = new Map((circleRows || []).map((c) => [c.id, c]));
    const seenPlanUpdateCircle = new Set<string>();
    for (const pu of recentPlanUpdates || []) {
      if (seenPlanUpdateCircle.has(pu.circle_id)) continue;
      seenPlanUpdateCircle.add(pu.circle_id);
      const dismissed =
        typeof window !== "undefined" &&
        localStorage.getItem(`dismissed_plan_update_${pu.id}`) === "1";
      if (dismissed) continue;
      const c = circleById.get(pu.circle_id);
      if (!c) continue;
      items.push({
        kind: "circle-plan-update",
        id: pu.id,
        circleId: pu.circle_id,
        circleName: c.name,
        avatarUrl: c.avatar_url,
        planId: pu.plan_id,
        planTitle: pu.plan_title,
        createdAt: pu.created_at,
      });
    }

    const latestActivityByCircle = new Map<string, string>();
    const recordCircleActivity = (cid: string | null, iso: string) => {
      if (!cid) return;
      const prev = latestActivityByCircle.get(cid);
      if (!prev || iso > prev) latestActivityByCircle.set(cid, iso);
    };

    for (const m of recentCircleMsgs || []) {
      recordCircleActivity(m.circle_id, m.created_at);
    }
    for (const p of recentPrayers || []) {
      recordCircleActivity(p.circle_id, p.created_at);
    }
    for (const d of recentDocs || []) {
      recordCircleActivity(d.circle_id, d.updated_at);
    }

    for (const c of circleRows || []) {
      const latestAt = latestActivityByCircle.get(c.id);
      if (!latestAt) continue;
      const localRoomRead =
        typeof window !== "undefined"
          ? localStorage.getItem(`circle_room_last_read_${c.id}`)
          : null;
      const localChatRead =
        typeof window !== "undefined"
          ? localStorage.getItem(`circle_chat_last_read_${c.id}`)
          : null;
      const lastReadMs = getLatestTimestampMs(
        circleReadMap.get(c.id),
        localRoomRead,
        localChatRead
      );
      if (lastReadMs === 0 || new Date(latestAt).getTime() > lastReadMs) {
        items.push({
          kind: "circle-activity",
          id: `circle-${c.id}`,
          circleId: c.id,
          circleName: c.name,
          avatarUrl: c.avatar_url,
          createdAt: latestAt,
        });
      }
    }
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    userId: user.id,
    planId,
    progressMap: map,
    activeCustomSchedule,
    activeCirclePlan,
    updates: items.slice(0, 6),
  };
}

export default function HomeClient({
  userId: initialUserId,
  displayName: initialDisplayName,
  avatarUrl: initialAvatarUrl,
}: InitialSessionProfile) {
  const [userId, setUserId] = useState<string | null>(initialUserId ?? null);
  const [clientAuthResolved, setClientAuthResolved] = useState(false);
  const [loading, setLoading] = useState(initialUserId !== null);
  const [planId, setPlanId] = useState<"nt-90" | "gospels-psalms">("nt-90");
  const [progressMap, setProgressMap] = useState<Map<string, ProgressEntry>>(
    new Map()
  );
  const [recentlyCompletedKeys, setRecentlyCompletedKeys] = useState<
    Set<string>
  >(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [activeCustomSchedule, setActiveCustomSchedule] =
    useState<CustomScheduleState | null>(null);
  const [activeCirclePlan, setActiveCirclePlan] = useState<UnifiedPlan | null>(
    null
  );

  const authResolved = initialUserId !== undefined || clientAuthResolved;

  const applySnapshot = useCallback((snap: HomeSnapshot) => {
    if (snap.planId) {
      setPlanId(snap.planId);
    }
    setUserId(snap.userId);
    setClientAuthResolved(true);
    setProgressMap(snap.progressMap);
    setActiveCustomSchedule(snap.activeCustomSchedule);
    setActiveCirclePlan(snap.activeCirclePlan);
    setUpdates(snap.updates);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchHomeSnapshot()
      .then((snap) => {
        if (!cancelled) {
          applySnapshot(snap);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClientAuthResolved(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applySnapshot]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const refreshSnapshot = () => {
      void fetchHomeSnapshot().then(applySnapshot).catch(() => {});
    };

    const channel = supabase
      .channel(`home-updates-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_read_states",
          filter: `user_id=eq.${userId}`,
        },
        refreshSnapshot
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        refreshSnapshot
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as { sender_id?: string };
          if (row.sender_id !== userId) {
            refreshSnapshot();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prayer_requests" },
        refreshSnapshot
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "circle_docs" },
        refreshSnapshot
      )
      .subscribe();

    window.addEventListener("focus", refreshSnapshot);

    return () => {
      window.removeEventListener("focus", refreshSnapshot);
      supabase.removeChannel(channel);
    };
  }, [userId, applySnapshot]);

  async function togglePhysicalBible(book: string, chapter: number) {
    if (!userId) return;
    const key = chapterKey(book, chapter);
    setBusyKey(key);
    const supabase = createClient();
    const existing = progressMap.get(key);

    try {
      if (existing) {
        await supabase
          .from("reading_progress")
          .delete()
          .eq("user_id", userId)
          .eq("book", book)
          .eq("chapter", chapter);
        const next = new Map(progressMap);
        next.delete(key);
        setProgressMap(next);
        setRecentlyCompletedKeys((prev) => {
          if (!prev.has(key)) return prev;
          const nextSet = new Set(prev);
          nextSet.delete(key);
          return nextSet;
        });
      } else {
        await supabase.from("reading_progress").upsert(
          {
            user_id: userId,
            book,
            chapter,
            read_in_physical_bible: true,
            completed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,book,chapter" }
        );
        const next = new Map(progressMap);
        next.set(key, { book, chapter, read_in_physical_bible: true });
        setProgressMap(next);
        setRecentlyCompletedKeys((prev) => new Set(prev).add(key));
      }
    } finally {
      setBusyKey(null);
    }
  }

  function handleDismissPlanUpdate(updateId: string) {
    if (typeof window !== "undefined") {
      localStorage.setItem(`dismissed_plan_update_${updateId}`, "1");
    }
    setUpdates((prev) => prev.filter((u) => u.id !== updateId));
  }

  function handleJoinCirclePlanUpdate(u: CirclePlanUpdate) {
    const parsed = parseSharedPlan(u.planId);
    if (parsed) {
      setActiveCirclePlan(
        parsed.kind === "preset"
          ? {
              id: `circle-${u.circleId}`,
              title: parsed.preset.title,
              presetId: parsed.preset.id,
              books: [],
              chaptersPerDay: parsed.preset.dailyTargetCount,
              restDays: [],
              source: "circle",
              circleId: u.circleId,
              circleName: u.circleName,
            }
          : {
              id: `circle-${u.circleId}`,
              title: parsed.custom.title,
              presetId: null,
              books: parsed.custom.books,
              chaptersPerDay: parsed.custom.chaptersPerDay,
              restDays: parsed.custom.restDays,
              source: "circle",
              circleId: u.circleId,
              circleName: u.circleName,
            }
      );
      if (typeof window !== "undefined") {
        localStorage.setItem("active_circle_id", u.circleId);
      }
    }
    handleDismissPlanUpdate(u.id);
  }

  const activePlan: ReadingPlanPreset =
    READING_PLAN_PRESETS.find((p) => p.id === planId) ||
    READING_PLAN_PRESETS[0];

  const effectiveSequence = activePlan.sequence;

  const completedInPlan = effectiveSequence.filter((c) =>
    progressMap.has(chapterKey(c.book, c.chapter))
  ).length;
  const pct =
    effectiveSequence.length > 0
      ? Math.min(
          100,
          Math.round((completedInPlan / effectiveSequence.length) * 100)
        )
      : 0;

  const personalRest = Boolean(
    activeCustomSchedule && isRestDay(activeCustomSchedule.rest_days)
  );
  const circleRest = Boolean(
    activeCirclePlan && isRestDay(activeCirclePlan.restDays)
  );

  const personalChapters = personalRest
    ? []
    : activeCustomSchedule && activeCustomSchedule.schedule_items.length > 0
      ? activeCustomSchedule.schedule_items.flatMap((slot) =>
          gatherPortionChapters(
            resolveTrackSequence(slot.track),
            progressMap,
            recentlyCompletedKeys,
            slot.chaptersPerDay || 1
          ).map((ch) => ({ ...ch, timeOfDay: slot.timeOfDay }))
        )
      : gatherPortionChapters(
          activePlan.sequence,
          progressMap,
          recentlyCompletedKeys,
          activePlan.dailyTargetCount
        );

  const circleChapters =
    !activeCirclePlan || circleRest
      ? []
      : getNextUnreadChapters(
          resolveUnifiedPlanSequence(activeCirclePlan),
          progressMap,
          activeCirclePlan.chaptersPerDay,
          recentlyCompletedKeys
        );

  const combinedReadings = combineDailyReadings(
    personalChapters,
    circleChapters,
    activeCirclePlan?.circleName
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-24">
      <Navbar
        variant="home"
        initialUserId={initialUserId}
        initialDisplayName={initialDisplayName}
        initialAvatarUrl={initialAvatarUrl}
      />

      <main className="flex-1 max-w-xl w-full mx-auto px-5 py-6 space-y-6">
        {/* Top Row: Subtle Plan Pill */}
        <div className="flex items-center justify-end">
          <Link
            href="/plans"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-medium text-[#1F2937] transition-colors"
          >
            <SlidersHorizontal className="w-3 h-3 text-[#4A6B5D]" />
            <span>Plans</span>
          </Link>
        </div>

        {/* Warm Central Illustration / Progress Emblem */}
        <div className="flex flex-col items-center text-center pt-1 pb-2">
          <div className="relative w-28 h-28 flex items-center justify-center">
            <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke="var(--paper-border)"
                strokeWidth="6"
                fill="var(--paper-card)"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke="var(--sage-600)"
                strokeWidth="6"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={264}
                strokeDashoffset={264 - (264 * pct) / 100}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <svg
                className="w-7 h-7 text-[#4A6B5D] mb-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[11px] font-semibold text-[#6B7280]">
                {completedInPlan}/{effectiveSequence.length}
              </span>
            </div>
          </div>
          <p className="font-editorial text-base font-medium text-[#1F2937] mt-2">
            {activeCustomSchedule
              ? activeCustomSchedule.title
              : activePlan.title}
          </p>
        </div>

        {/* Combined Personal & Circle Daily Readings Carousel */}
        <section className="bg-white border border-[#E6E1D6] rounded-2xl p-5 space-y-3.5 shadow-2xs">
          {combinedReadings.length === 0 ? (
            <div className="text-center py-3 space-y-2.5">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-[#EBF1EE] text-[#4A6B5D] mx-auto">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#4A6B5D]">
                  Sabbath Rest Day
                </span>
                <h2 className="font-editorial text-xl font-semibold text-[#1F2937] mt-0.5">
                  Resting in Grace Today
                </h2>
                <p className="text-xs text-[#6B7280] mt-1 max-w-sm mx-auto">
                  No chapters are scheduled today in{" "}
                  <strong>
                    {activeCustomSchedule?.title ||
                      activeCirclePlan?.title ||
                      activePlan.title}
                  </strong>
                  . Pause, reflect, or open the Reader freely whenever you wish.
                </p>
              </div>
              <div className="pt-1">
                <Link
                  href="/reader"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-medium text-[#1F2937]"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#4A6B5D]" />
                  <span>Open Reader Freely</span>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#4A6B5D]">
                  Today&apos;s Reading
                </span>
                {combinedReadings.length > 1 && (
                  <span className="text-[11px] text-[#6B7280]">
                    {combinedReadings.length} chapters · Scroll
                  </span>
                )}
              </div>

              <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1">
                {combinedReadings.map((item) => {
                  const key = chapterKey(item.book, item.chapter);
                  const checked = progressMap.has(key);
                  const chipLabel =
                    item.source === "both"
                      ? `Personal · ${item.circleName || "Circle"}`
                      : item.source === "circle"
                        ? item.circleName || "Circle"
                        : "Personal";
                  const chipStyle =
                    item.source === "circle"
                      ? "bg-[#FBF5EE] border-[#E7D3BC] text-[#B47B44]"
                      : item.source === "both"
                        ? "bg-[#EBF1EE] border-[#CFE0D6] text-[#3D5A4E]"
                        : "bg-[#F4F1EA] border-[#E6E1D6] text-[#4A6B5D]";

                  return (
                    <div
                      key={key}
                      className={`snap-start rounded-2xl border border-[#E6E1D6] bg-[#FAF9F6] p-4 space-y-3.5 flex flex-col justify-between ${
                        combinedReadings.length === 1
                          ? "w-full"
                          : "min-w-[85%] sm:min-w-[300px] shrink-0"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold truncate max-w-[75%] ${chipStyle}`}
                          >
                            {chipLabel}
                          </span>
                          {item.timeOfDay && (
                            <span className="text-[10px] font-medium text-[#6B7280] shrink-0">
                              {item.timeOfDay}
                            </span>
                          )}
                        </div>
                        <h2 className="font-editorial text-2xl font-semibold text-[#1F2937] truncate">
                          {item.book} {item.chapter}
                        </h2>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <Link
                          href={`/reader?book=${encodeURIComponent(
                            item.book
                          )}&chapter=${item.chapter}`}
                          className="py-2.5 px-3 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Read in App</span>
                        </Link>

                        {!authResolved ? (
                          <span
                            aria-hidden="true"
                            className="w-full h-[38px] rounded-xl border border-[#E6E1D6] bg-[#F4F1EA] animate-pulse"
                          />
                        ) : userId ? (
                          <button
                            type="button"
                            disabled={busyKey === key}
                            onClick={() =>
                              togglePhysicalBible(item.book, item.chapter)
                            }
                            className={`py-2.5 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                              checked
                                ? "bg-[#EBF1EE] border-[#4A6B5D] text-[#3D5A4E]"
                                : "bg-[#FBF5EE] border-[#E7D3BC] text-[#B47B44] hover:bg-[#F6EAD9]"
                            }`}
                          >
                            {checked ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Completed</span>
                              </>
                            ) : (
                              <>
                                <BookMarked className="w-3.5 h-3.5" />
                                <span>Physical Bible</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <Link
                            href="/login"
                            className="py-2.5 px-3 rounded-xl border border-[#E6E1D6] bg-[#FAF9F6] text-[#1F2937] text-xs font-medium flex items-center justify-center gap-1.5"
                          >
                            <span>Sign In</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* Minimalist Non-Granular Updates Feed */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
              Updates
            </span>
          </div>

          {loading ? (
            <div className="p-6 bg-white border border-[#E6E1D6] rounded-2xl flex items-center justify-center text-xs text-[#6B7280]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading updates...
            </div>
          ) : updates.length === 0 ? (
            <div className="bg-white border border-[#E6E1D6] rounded-2xl p-5 text-center space-y-2">
              <OliveBranchMark className="w-7 h-7 text-[#4A6B5D] mx-auto opacity-80" />
              <div className="flex items-center justify-center gap-2 text-xs text-[#6B7280]">
                <span>Quiet for now</span>
                <span>·</span>
                <Link
                  href="/social"
                  className="text-[#4A6B5D] font-medium inline-flex items-center gap-1 hover:underline"
                >
                  <span>Social</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {updates.map((u) =>
                u.kind === "friend-request" ? (
                  <Link
                    key={u.id}
                    href={`/members/${u.requesterId}`}
                    className="w-full bg-white border border-[#E6E1D6] rounded-2xl p-3 flex items-center justify-between gap-3 hover:opacity-95 transition-all shadow-2xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center text-xs font-semibold">
                          {u.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.avatarUrl}
                              alt={u.actorName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            getInitials(u.actorName)
                          )}
                        </div>
                        <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-[#4A6B5D] ring-2 ring-white dark:ring-[#1E1E1C]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#1F2937] truncate">
                          {u.actorName.split(" ")[0]} · Friend request
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
                  </Link>
                ) : u.kind === "friend-dm" ? (
                  <Link
                    key={u.id}
                    href={`/dm/${u.friendshipId}`}
                    className="w-full bg-white border border-[#E6E1D6] rounded-2xl p-3 flex items-center justify-between gap-3 hover:opacity-95 transition-all shadow-2xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center text-xs font-semibold">
                          {u.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.avatarUrl}
                              alt={u.actorName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            getInitials(u.actorName)
                          )}
                        </div>
                        {u.unread && (
                          <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-[#4A6B5D] ring-2 ring-white dark:ring-[#1E1E1C]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#1F2937] truncate">
                          {u.actorName.split(" ")[0]} sent you a direct message
                        </p>
                        <p className="text-[11px] text-[#6B7280] truncate">
                          Tap to open conversation
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
                  </Link>
                ) : u.kind === "circle-plan-update" ? (
                  <div
                    key={u.id}
                    className="w-full bg-white dark:bg-[#1C1C1A] border border-[#E6E1D6] dark:border-[#2C2C28] rounded-2xl p-3 flex items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center font-editorial text-sm font-semibold shrink-0">
                        {u.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={u.avatarUrl}
                            alt={u.circleName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          getInitials(u.circleName)
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#1F2937] dark:text-[#F3F2EE] truncate">
                          {u.circleName} · New plan
                        </p>
                        <p className="text-[11px] text-[#6B7280] dark:text-[#A1A19A] truncate">
                          {u.planTitle}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleJoinCirclePlanUpdate(u)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Join / Switch
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismissPlanUpdate(u.id)}
                        aria-label="Dismiss plan update"
                        className="px-2 py-1.5 rounded-lg text-[11px] font-medium text-[#6B7280] dark:text-[#A1A19A] hover:text-[#1F2937] dark:hover:text-[#F3F2EE] cursor-pointer"
                      >
                        Later
                      </button>
                    </div>
                  </div>
                ) : (
                  <Link
                    key={u.id}
                    href={`/circles/${u.circleId}`}
                    className="w-full bg-[#F4F1EA] border border-[#E6E1D6] rounded-2xl p-3 flex items-center justify-between gap-3 hover:opacity-95 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center font-editorial text-sm font-semibold">
                          {u.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.avatarUrl}
                              alt={u.circleName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            getInitials(u.circleName)
                          )}
                        </div>
                        <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-[#4A6B5D] ring-2 ring-[#F4F1EA] dark:ring-[#252522]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#1F2937] truncate">
                          {u.circleName} has new activity
                        </p>
                        <p className="text-[11px] text-[#6B7280] truncate">
                          Enter circle room
                        </p>
                      </div>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-[#4A6B5D] shrink-0" />
                  </Link>
                )
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
