"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Moon,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from "lucide-react";
import Navbar, { getInitials } from "@/components/ui/Navbar";
import { createClient } from "@/lib/supabase/client";
import {
  READING_PLAN_PRESETS,
  chapterKey,
  resolveTrackSequence,
  type ChapterRef,
  type CustomScheduleSlot,
  type ReadingPlanPreset,
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

type UpdateItem = FriendDmUpdate | FriendRequestUpdate | CircleActivityUpdate;

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

export default function HomePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState<"nt-90" | "gospels-psalms">("nt-90");
  const [progressMap, setProgressMap] = useState<Map<string, ProgressEntry>>(
    new Map()
  );
  const [recentlyCompletedKeys, setRecentlyCompletedKeys] = useState<
    Set<string>
  >(new Set());
  const [presetStep, setPresetStep] = useState(0);
  const [slotSteps, setSlotSteps] = useState<Record<number, number>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [activeCustomSchedule, setActiveCustomSchedule] = useState<{
    title: string;
    rest_days: number[];
    schedule_items: CustomScheduleSlot[];
  } | null>(null);

  const loadSnapshot = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const savedPlan =
      typeof window !== "undefined"
        ? localStorage.getItem("selected_reading_plan")
        : null;
    if (savedPlan === "nt-90" || savedPlan === "gospels-psalms") {
      setPlanId(savedPlan);
    }

    if (!user) {
      setUserId(null);
      setLoading(false);
      return;
    }
    setUserId(user.id);

    const { data: progressRows } = await supabase
      .from("reading_progress")
      .select("book, chapter, read_in_physical_bible")
      .eq("user_id", user.id);

    const map = new Map<string, ProgressEntry>();
    for (const row of progressRows || []) {
      map.set(chapterKey(row.book, row.chapter), row);
    }
    setProgressMap(map);

    const { data: activeSched } = await supabase
      .from("custom_schedules")
      .select("title, rest_days, schedule_items")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeSched) {
      setActiveCustomSchedule({
        title: activeSched.title,
        rest_days: activeSched.rest_days ?? [],
        schedule_items: Array.isArray(activeSched.schedule_items)
          ? (activeSched.schedule_items as unknown as CustomScheduleSlot[])
          : [],
      });
    } else {
      setActiveCustomSchedule(null);
    }

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
    if (circleIds.length > 0) {
      const [
        { data: circleRows },
        { data: recentCircleMsgs },
        { data: recentPrayers },
        { data: recentDocs },
      ] = await Promise.all([
        supabase
          .from("circles")
          .select("id, name, avatar_url")
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
      ]);

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
    setUpdates(items.slice(0, 6));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
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
        () => {
          loadSnapshot();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => {
          loadSnapshot();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as { sender_id?: string };
          if (row.sender_id !== userId) {
            loadSnapshot();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prayer_requests" },
        () => {
          loadSnapshot();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "circle_docs" },
        () => {
          loadSnapshot();
        }
      )
      .subscribe();

    const handleFocus = () => {
      loadSnapshot();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      supabase.removeChannel(channel);
    };
  }, [userId, loadSnapshot]);

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

  const activePlan: ReadingPlanPreset =
    READING_PLAN_PRESETS.find((p) => p.id === planId) ||
    READING_PLAN_PRESETS[0];

  const completedInPlan = activePlan.sequence.filter((c) =>
    progressMap.has(chapterKey(c.book, c.chapter))
  ).length;
  const pct = Math.min(
    100,
    Math.round((completedInPlan / activePlan.sequence.length) * 100)
  );

  const todayChapters = gatherPortionChapters(
    activePlan.sequence,
    progressMap,
    recentlyCompletedKeys,
    activePlan.dailyTargetCount
  );
  const activePresetIndex = Math.min(
    presetStep,
    Math.max(0, todayChapters.length - 1)
  );
  const nextUp = todayChapters[activePresetIndex] || activePlan.sequence[0];

  const nextKey = chapterKey(nextUp.book, nextUp.chapter);
  const isNextChecked = progressMap.has(nextKey);

  const todayWeekday = new Date().getDay();
  const isSabbathRestDay = Boolean(
    activeCustomSchedule &&
      activeCustomSchedule.rest_days.includes(todayWeekday)
  );

  const customSlotReadings = (activeCustomSchedule?.schedule_items || []).map(
    (slot, idx) => {
      const seq = resolveTrackSequence(slot.track);
      const chapters = gatherPortionChapters(
        seq,
        progressMap,
        recentlyCompletedKeys,
        slot.chaptersPerDay || 1
      );
      const safeChapters =
        chapters.length > 0 ? chapters : [{ book: "John", chapter: 1 }];
      const activeIdx = Math.min(
        slotSteps[idx] ?? 0,
        Math.max(0, safeChapters.length - 1)
      );
      const activeChapter = safeChapters[activeIdx] || safeChapters[0];
      return {
        ...slot,
        chapters: safeChapters,
        activeIdx,
        book: activeChapter.book,
        chapter: activeChapter.chapter,
      };
    }
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-24">
      <Navbar />

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
                {completedInPlan}/{activePlan.sequence.length}
              </span>
            </div>
          </div>
          <p className="font-editorial text-base font-medium text-[#1F2937] mt-2">
            {activeCustomSchedule
              ? activeCustomSchedule.title
              : activePlan.title}
          </p>
        </div>

        {/* Compact Today's Reading Card (Supports Preset, Morning/Evening Split, or Sabbath Rest Day) */}
        <section className="bg-white border border-[#E6E1D6] rounded-2xl p-5 space-y-4 shadow-2xs">
          {isSabbathRestDay && activeCustomSchedule ? (
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
                  <strong>{activeCustomSchedule.title}</strong>. Pause, reflect,
                  or open the Reader freely whenever you wish.
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
          ) : activeCustomSchedule && customSlotReadings.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#4A6B5D]">
                  Today&apos;s Split Schedule
                </span>
                <span className="text-[11px] text-[#6B7280]">
                  {activeCustomSchedule.title}
                </span>
              </div>

              <div className="divide-y divide-[#E6E1D6]">
                {customSlotReadings.map((slot, idx) => {
                  const key = chapterKey(slot.book, slot.chapter);
                  const checked = progressMap.has(key);
                  return (
                    <div
                      key={`${slot.timeOfDay}-${idx}`}
                      className="py-3 first:pt-1 last:pb-0 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-7 h-7 rounded-xl bg-[#F4F1EA] flex items-center justify-center shrink-0">
                            {slot.timeOfDay === "Morning" ? (
                              <Sun className="w-3.5 h-3.5 text-[#B47B44]" />
                            ) : (
                              <Moon className="w-3.5 h-3.5 text-[#4A6B5D]" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">
                              {slot.timeOfDay} · {slot.chaptersPerDay} ch
                            </span>
                            <h3 className="font-editorial text-lg font-semibold text-[#1F2937] leading-tight truncate">
                              {slot.book} {slot.chapter}
                            </h3>
                          </div>
                        </div>

                        {slot.chapters.length > 1 && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setSlotSteps((prev) => ({
                                  ...prev,
                                  [idx]:
                                    (slot.activeIdx - 1 + slot.chapters.length) %
                                    slot.chapters.length,
                                }))
                              }
                              aria-label={`Previous ${slot.timeOfDay} chapter`}
                              className="w-7 h-7 rounded-full bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] flex items-center justify-center text-[#1F2937] cursor-pointer"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-[11px] font-medium text-[#6B7280] tabular-nums min-w-[34px] text-center">
                              {slot.activeIdx + 1} of {slot.chapters.length}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setSlotSteps((prev) => ({
                                  ...prev,
                                  [idx]:
                                    (slot.activeIdx + 1) % slot.chapters.length,
                                }))
                              }
                              aria-label={`Next ${slot.timeOfDay} chapter`}
                              className="w-7 h-7 rounded-full bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] flex items-center justify-center text-[#1F2937] cursor-pointer"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {slot.chapters.length > 1 && (
                        <div className="flex items-center justify-center gap-1.5">
                          {slot.chapters.map((ch, cIdx) => {
                            const chDone = progressMap.has(
                              chapterKey(ch.book, ch.chapter)
                            );
                            const isActiveDot = cIdx === slot.activeIdx;
                            return (
                              <button
                                key={chapterKey(ch.book, ch.chapter)}
                                type="button"
                                onClick={() =>
                                  setSlotSteps((prev) => ({
                                    ...prev,
                                    [idx]: cIdx,
                                  }))
                                }
                                aria-label={`Go to ${ch.book} ${ch.chapter}`}
                                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                  isActiveDot
                                    ? "w-4 bg-[#4A6B5D]"
                                    : chDone
                                      ? "w-1.5 bg-[#7C9A82]"
                                      : "w-1.5 bg-[#E6E1D6]"
                                }`}
                              />
                            );
                          })}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2.5">
                        <Link
                          href={`/reader?book=${encodeURIComponent(
                            slot.book
                          )}&chapter=${slot.chapter}`}
                          className="py-2.5 px-3 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Read in App</span>
                        </Link>
                        <button
                          type="button"
                          disabled={busyKey === key}
                          onClick={() =>
                            togglePhysicalBible(slot.book, slot.chapter)
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
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#4A6B5D]">
                    Today&apos;s Reading
                  </span>
                  <h2 className="font-editorial text-2xl font-semibold text-[#1F2937] mt-0.5 truncate">
                    {nextUp.book} {nextUp.chapter}
                  </h2>
                </div>
                {todayChapters.length > 1 ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setPresetStep(
                          (activePresetIndex - 1 + todayChapters.length) %
                            todayChapters.length
                        )
                      }
                      aria-label="Previous daily chapter"
                      className="w-8 h-8 rounded-full bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] flex items-center justify-center text-[#1F2937] cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-medium text-[#6B7280] tabular-nums min-w-[38px] text-center">
                      {activePresetIndex + 1} of {todayChapters.length}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPresetStep(
                          (activePresetIndex + 1) % todayChapters.length
                        )
                      }
                      aria-label="Next daily chapter"
                      className="w-8 h-8 rounded-full bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] flex items-center justify-center text-[#1F2937] cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="w-10 h-10 rounded-2xl bg-[#EBF1EE] text-[#4A6B5D] font-editorial font-semibold text-base flex items-center justify-center shrink-0">
                    {nextUp.chapter}
                  </span>
                )}
              </div>

              {todayChapters.length > 1 && (
                <div className="flex items-center justify-center gap-1.5">
                  {todayChapters.map((ch, idx) => {
                    const chDone = progressMap.has(
                      chapterKey(ch.book, ch.chapter)
                    );
                    const isActiveDot = idx === activePresetIndex;
                    return (
                      <button
                        key={chapterKey(ch.book, ch.chapter)}
                        type="button"
                        onClick={() => setPresetStep(idx)}
                        aria-label={`Go to ${ch.book} ${ch.chapter}`}
                        className={`h-1.5 rounded-full transition-all cursor-pointer ${
                          isActiveDot
                            ? "w-4 bg-[#4A6B5D]"
                            : chDone
                              ? "w-1.5 bg-[#7C9A82]"
                              : "w-1.5 bg-[#E6E1D6]"
                        }`}
                      />
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Link
                  href={`/reader?book=${encodeURIComponent(
                    nextUp.book
                  )}&chapter=${nextUp.chapter}`}
                  className="py-3 px-4 rounded-2xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium flex items-center justify-center gap-2 shadow-2xs transition-colors"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Read in App</span>
                </Link>

                {userId ? (
                  <button
                    type="button"
                    disabled={busyKey === nextKey}
                    onClick={() =>
                      togglePhysicalBible(nextUp.book, nextUp.chapter)
                    }
                    className={`py-3 px-4 rounded-2xl border text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                      isNextChecked
                        ? "bg-[#EBF1EE] border-[#4A6B5D] text-[#3D5A4E]"
                        : "bg-[#FBF5EE] border-[#E7D3BC] text-[#B47B44] hover:bg-[#F6EAD9]"
                    }`}
                  >
                    {isNextChecked ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Completed</span>
                      </>
                    ) : (
                      <>
                        <BookMarked className="w-4 h-4" />
                        <span>Physical Bible</span>
                      </>
                    )}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="py-3 px-4 rounded-2xl border border-[#E6E1D6] bg-[#FAF9F6] text-[#1F2937] text-xs font-medium flex items-center justify-center gap-2"
                  >
                    <span>Sign In</span>
                  </Link>
                )}
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
            <div className="bg-white border border-[#E6E1D6] rounded-2xl p-5 text-center">
              <p className="text-xs text-[#6B7280]">
                All caught up · Visit{" "}
                <Link
                  href="/social"
                  className="text-[#4A6B5D] font-medium underline"
                >
                  Social
                </Link>{" "}
                to connect with friends or open a Circle.
              </p>
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
                          {u.actorName.split(" ")[0]} sent you a friend request
                        </p>
                        <p className="text-[11px] text-[#6B7280] truncate">
                          Tap to view profile &amp; respond
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
