"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import QuietPageHeader from "@/components/ui/QuietPageHeader";
import WaystoneTrail from "@/components/journey/WaystoneTrail";
import type { PrivateVerseNote } from "@/components/journey/ChapterNotesInline";
import {
  READING_PLAN_PRESETS,
  chapterKey,
  getNextUnreadChapters,
  isRestDay,
  resolveTrackSequence,
  type CustomScheduleSlot,
} from "@/lib/plans/reading-plans";
import { createClient } from "@/lib/supabase/client";

interface ProgressRow {
  book: string;
  chapter: number;
}

interface ActiveScheduleRow {
  rest_days: number[] | null;
  schedule_items: unknown;
}

export default function JourneyPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [userNotes, setUserNotes] = useState<PrivateVerseNote[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<ActiveScheduleRow | null>(
    null
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string>("nt-90");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadJourney() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        router.push("/login");
        return;
      }

      const savedPlan =
        typeof window !== "undefined"
          ? localStorage.getItem("selected_reading_plan")
          : null;
      if (savedPlan === "nt-90" || savedPlan === "gospels-psalms") {
        setSelectedPresetId(savedPlan);
      }

      const [{ data: rows }, { data: notes }, { data: sched }] =
        await Promise.all([
          supabase
            .from("reading_progress")
            .select("book, chapter")
            .eq("user_id", user.id),
          supabase
            .from("verse_notes")
            .select(
              "id, book, chapter, verse_start, verse_end, content, created_at"
            )
            .eq("user_id", user.id)
            .order("verse_start", { ascending: true })
            .order("created_at", { ascending: false }),
          supabase
            .from("custom_schedules")
            .select("rest_days, schedule_items")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      if (!active) return;

      setProgress(rows || []);
      setUserNotes(notes || []);
      setActiveSchedule(sched ?? null);
      setLoading(false);
    }

    loadJourney();
    return () => {
      active = false;
    };
  }, [router]);

  const completedByBook = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const row of progress) {
      if (!map.has(row.book)) {
        map.set(row.book, new Set());
      }
      map.get(row.book)!.add(row.chapter);
    }
    return map;
  }, [progress]);

  const notesByBookChapter = useMemo(() => {
    const map = new Map<string, PrivateVerseNote[]>();
    for (const note of userNotes) {
      const key = `${note.book}:${note.chapter}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(note);
    }
    return map;
  }, [userNotes]);

  const todayChapterKeys = useMemo(() => {
    const completedKeys = new Set(
      progress.map((row) => chapterKey(row.book, row.chapter))
    );
    const keys = new Set<string>();

    if (activeSchedule) {
      const restDays = activeSchedule.rest_days ?? [];
      if (isRestDay(restDays)) return keys;

      const slots = Array.isArray(activeSchedule.schedule_items)
        ? (activeSchedule.schedule_items as CustomScheduleSlot[])
        : [];
      for (const slot of slots) {
        const seq = resolveTrackSequence(slot.track);
        const next = getNextUnreadChapters(
          seq,
          completedKeys,
          slot.chaptersPerDay || 1
        );
        for (const ch of next) {
          keys.add(chapterKey(ch.book, ch.chapter));
        }
      }
      return keys;
    }

    const preset =
      READING_PLAN_PRESETS.find((p) => p.id === selectedPresetId) ||
      READING_PLAN_PRESETS[0];
    const next = getNextUnreadChapters(
      preset.sequence,
      completedKeys,
      preset.dailyTargetCount
    );
    for (const ch of next) {
      keys.add(chapterKey(ch.book, ch.chapter));
    }
    return keys;
  }, [activeSchedule, progress, selectedPresetId]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] dark:bg-[#141413] text-[#1F2937] dark:text-[#F3F2EE] pb-24">
      <Navbar variant="inner" />

      <main className="flex-1 max-w-xl w-full mx-auto px-5 pt-4 pb-6 space-y-5">
        <QuietPageHeader />

        <div className="text-center space-y-1 pt-1">
          <h1 className="font-serif text-3xl font-medium tracking-tight text-[#1F2937] dark:text-[#F3F2EE]">
            Journey
          </h1>
          <p className="text-xs text-[#6B7280] dark:text-[#A3A19A]">
            Hebrews 12:1–2 · Pressing on
          </p>
        </div>

        {loading ? (
          <div className="p-8 bg-white dark:bg-[#1E1E1C] border border-[#E6E1D6] dark:border-[#2E2E2B] rounded-2xl flex items-center justify-center text-xs text-[#6B7280] dark:text-[#A3A19A]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading trail...
          </div>
        ) : (
          <WaystoneTrail
            completedByBook={completedByBook}
            notesByBookChapter={notesByBookChapter}
            todayChapterKeys={todayChapterKeys}
          />
        )}
      </main>
    </div>
  );
}
