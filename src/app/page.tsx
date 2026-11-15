"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  BellRing,
  BookMarked,
  BookOpen,
  Check,
  Heart,
  Loader2,
  MessageCircle,
  SlidersHorizontal,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import { createClient } from "@/lib/supabase/client";
import {
  READING_PLAN_PRESETS,
  chapterKey,
  type ReadingPlanPreset,
} from "@/lib/plans/reading-plans";

interface ProgressEntry {
  book: string;
  chapter: number;
  read_in_physical_bible: boolean;
}

interface UpdateItem {
  id: string;
  kind: "ring" | "dm" | "note" | "prayer";
  actor: string;
  summary: string;
  href: string;
  time: string;
}

function formatShortTime(iso: string): string {
  const diffMin = Math.max(
    1,
    Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  );
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return `${Math.floor(diffHr / 24)}d`;
}

export default function HomePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState<"nt-90" | "gospels-psalms">("nt-90");
  const [progressMap, setProgressMap] = useState<Map<string, ProgressEntry>>(
    new Map()
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [updates, setUpdates] = useState<UpdateItem[]>([]);

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

    // Fetch Today's Updates (Rings, Active Prayer Requests, DMs, and recent Circle Notes)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [
      { data: rings },
      { data: prayers },
      { data: messages },
      { data: notes },
    ] = await Promise.all([
      supabase
        .from("rings")
        .select("id, sender_id, message, created_at")
        .eq("recipient_id", user.id)
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("prayer_requests")
        .select("id, user_id, content, created_at")
        .eq("is_answered", false)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("messages")
        .select("id, sender_id, recipient_id, content, created_at")
        .neq("sender_id", user.id)
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(4),
      supabase
        .from("verse_notes")
        .select("id, user_id, book, chapter, verse_start, content, created_at")
        .neq("user_id", user.id)
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    const actorIds = new Set<string>();
    (rings || []).forEach((r) => actorIds.add(r.sender_id));
    (prayers || []).forEach((p) => actorIds.add(p.user_id));
    (messages || []).forEach((m) => actorIds.add(m.sender_id));
    (notes || []).forEach((n) => actorIds.add(n.user_id));

    const nameMap = new Map<string, string>();
    if (actorIds.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", Array.from(actorIds));
      for (const p of profs || []) {
        nameMap.set(p.id, p.display_name);
      }
    }

    const items: UpdateItem[] = [];
    for (const r of rings || []) {
      items.push({
        id: `ring-${r.id}`,
        kind: "ring",
        actor: nameMap.get(r.sender_id) || "Circle Friend",
        summary: `Sent a Ring: "${r.message}"`,
        href: "/circle",
        time: formatShortTime(r.created_at),
      });
    }
    for (const p of prayers || []) {
      items.push({
        id: `prayer-${p.id}`,
        kind: "prayer",
        actor: nameMap.get(p.user_id) || "Circle Member",
        summary: `Prayer Request: ${p.content}`,
        href: "/circle",
        time: formatShortTime(p.created_at),
      });
    }
    for (const m of messages || []) {
      items.push({
        id: `msg-${m.id}`,
        kind: m.recipient_id === user.id ? "dm" : "note",
        actor: nameMap.get(m.sender_id) || "Circle Member",
        summary: m.content,
        href: "/circle",
        time: formatShortTime(m.created_at),
      });
    }
    for (const n of notes || []) {
      items.push({
        id: `note-${n.id}`,
        kind: "note",
        actor: nameMap.get(n.user_id) || "Circle Member",
        summary: `${n.book} ${n.chapter}:${n.verse_start} — ${n.content}`,
        href: `/reader?book=${encodeURIComponent(n.book)}&chapter=${n.chapter}`,
        time: formatShortTime(n.created_at),
      });
    }

    setUpdates(items.slice(0, 5));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

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

  const nextUp =
    activePlan.sequence.find(
      (c) => !progressMap.has(chapterKey(c.book, c.chapter))
    ) || activePlan.sequence[0];

  const nextKey = chapterKey(nextUp.book, nextUp.chapter);
  const isNextChecked = progressMap.has(nextKey);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-24">
      <Navbar />

      <main className="flex-1 max-w-xl w-full mx-auto px-5 py-6 space-y-6">
        {/* Top Row: Subtle Plan Pill */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
            Daily Snapshot
          </span>
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
            {activePlan.title}
          </p>
        </div>

        {/* Compact Today's Reading Card */}
        <section className="bg-white border border-[#E6E1D6] rounded-2xl p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#4A6B5D]">
                Today&apos;s Reading
              </span>
              <h2 className="font-editorial text-2xl font-semibold text-[#1F2937] mt-0.5">
                {nextUp.book} {nextUp.chapter}
              </h2>
            </div>
            <span className="w-10 h-10 rounded-2xl bg-[#EBF1EE] text-[#4A6B5D] font-editorial font-semibold text-base flex items-center justify-center">
              {nextUp.chapter}
            </span>
          </div>

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
        </section>

        {/* Clean Today's Updates List */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
              Today&apos;s Updates
            </span>
            <Link
              href="/circle"
              className="text-[11px] font-medium text-[#4A6B5D] hover:underline"
            >
              Open Circles
            </Link>
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
                  href="/circle"
                  className="text-[#4A6B5D] font-medium underline"
                >
                  Circles
                </Link>{" "}
                to share a reflection or send a Ring.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-[#E6E1D6] rounded-2xl divide-y divide-[#E6E1D6] overflow-hidden">
              {updates.map((u) => (
                <Link
                  key={u.id}
                  href={u.href}
                  className="px-4 py-3 hover:bg-[#FAF9F6] transition-colors flex items-center gap-3"
                >
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      u.kind === "ring"
                        ? "bg-[#FBF5EE] text-[#B47B44]"
                        : "bg-[#EBF1EE] text-[#4A6B5D]"
                    }`}
                  >
                    {u.kind === "ring" ? (
                      <BellRing className="w-4 h-4" />
                    ) : u.kind === "prayer" ? (
                      <Heart className="w-4 h-4" />
                    ) : (
                      <MessageCircle className="w-4 h-4" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#1F2937] truncate">
                        {u.actor}
                      </span>
                      <span className="text-[10.5px] text-[#6B7280] shrink-0">
                        {u.time}
                      </span>
                    </div>
                    <p className="text-xs text-[#6B7280] truncate mt-0.5">
                      {u.summary}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
