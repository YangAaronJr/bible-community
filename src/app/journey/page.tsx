"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Award,
  BookMarked,
  BookOpen,
  Check,
  Compass,
  Flag,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import { createClient } from "@/lib/supabase/client";
import { BIBLE_BOOKS, WEEKDAYS } from "@/lib/plans/reading-plans";

interface ProgressRow {
  book: string;
  chapter: number;
  read_in_physical_bible: boolean;
  completed_at: string;
}

interface GraceMilestone {
  id: string;
  title: string;
  subtitle: string;
  target: number;
  current: number;
  unit: "chapters" | "books";
}

export default function JourneyPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [restDays, setRestDays] = useState<number[]>([0]);
  const [loading, setLoading] = useState(true);
  const [testamentFilter, setTestamentFilter] = useState<"ALL" | "NT" | "OT">(
    "ALL"
  );

  const loadJourney = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const [{ data: rows }, { data: activeSched }] = await Promise.all([
      supabase
        .from("reading_progress")
        .select("book, chapter, read_in_physical_bible, completed_at")
        .eq("user_id", user.id)
        .order("completed_at", { ascending: false }),
      supabase
        .from("custom_schedules")
        .select("rest_days")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
    ]);

    setProgress(rows || []);
    if (activeSched?.rest_days) {
      setRestDays(activeSched.rest_days);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadJourney();
  }, [loadJourney]);

  // Compute private chapter & book totals (strictly cumulative — never resets)
  const completedSetByBook = new Map<string, Set<number>>();
  let physicalCount = 0;

  for (const row of progress) {
    if (!completedSetByBook.has(row.book)) {
      completedSetByBook.set(row.book, new Set());
    }
    completedSetByBook.get(row.book)!.add(row.chapter);
    if (row.read_in_physical_bible) physicalCount++;
  }

  const totalChaptersCompleted = progress.length;
  const totalBooksCompleted = BIBLE_BOOKS.filter((b) => {
    const set = completedSetByBook.get(b.name);
    return set && set.size >= b.chapters;
  }).length;

  const milestones: GraceMilestone[] = [
    {
      id: "m-1",
      title: "First Steps in the Word",
      subtitle: "Read your first chapter in Scripture",
      target: 1,
      current: totalChaptersCompleted,
      unit: "chapters",
    },
    {
      id: "m-10",
      title: "Quiet Rhythm",
      subtitle: "10 chapters completed at your own pace",
      target: 10,
      current: totalChaptersCompleted,
      unit: "chapters",
    },
    {
      id: "m-book-1",
      title: "First Book Completed",
      subtitle: "Finish every chapter of any canonical book",
      target: 1,
      current: totalBooksCompleted,
      unit: "books",
    },
    {
      id: "m-50",
      title: "Steadfast Endurance",
      subtitle: "50 chapters treasured in heart",
      target: 50,
      current: totalChaptersCompleted,
      unit: "chapters",
    },
    {
      id: "m-100",
      title: "Hundredfold Sanctuary",
      subtitle: "100 chapters walked in grace",
      target: 100,
      current: totalChaptersCompleted,
      unit: "chapters",
    },
    {
      id: "m-260",
      title: "New Testament Measure",
      subtitle: "260 chapters completed across Scripture",
      target: 260,
      current: totalChaptersCompleted,
      unit: "chapters",
    },
  ];

  const nextMilestone =
    milestones.find((m) => m.current < m.target) ||
    milestones[milestones.length - 1];
  const nextPct = Math.min(
    100,
    Math.round((nextMilestone.current / nextMilestone.target) * 100)
  );

  const sabbathLabels = restDays
    .map((d) => WEEKDAYS.find((w) => w.day === d)?.label)
    .filter(Boolean)
    .join(" & ");

  const filteredBooks = BIBLE_BOOKS.filter((b) =>
    testamentFilter === "ALL" ? true : b.testament === testamentFilter
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-24">
      <Navbar />

      <main className="flex-1 max-w-xl w-full mx-auto px-5 py-6 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#4A6B5D] font-semibold">
            <Lock className="w-3 h-3" />
            Strictly Private · Hebrews 12:1
          </span>
          <h1 className="font-editorial text-[28px] leading-none font-medium text-[#1F2937] tracking-tight">
            Running the Race
          </h1>
          <p className="text-xs text-[#6B7280]">
            Every chapter counts forever · Missed days never reset your journey
          </p>
        </div>

        {/* Sabbath & Grace Rhythm Banner */}
        <div className="bg-[#EBF1EE] border border-[#CFE0D6] rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-white text-[#4A6B5D] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-semibold text-[#1F2937]">
                Sabbath Rest Honored ({sabbathLabels || "Sunday"})
              </p>
              <p className="text-[11px] text-[#6B7280]">
                Rest days are part of the race—never a broken streak.
              </p>
            </div>
          </div>
          <Link
            href="/plans"
            className="text-[11px] font-semibold text-[#4A6B5D] hover:underline shrink-0"
          >
            Adjust
          </Link>
        </div>

        {/* Private Progress Totals */}
        <section className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-[#E6E1D6] rounded-2xl p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-[#6B7280]">
              <span>Chapters</span>
              <BookOpen className="w-3.5 h-3.5 text-[#4A6B5D]" />
            </div>
            <p className="font-editorial text-2xl font-semibold text-[#1F2937]">
              {totalChaptersCompleted}
            </p>
            <p className="text-[10px] text-[#6B7280]">of 1,189</p>
          </div>

          <div className="bg-white border border-[#E6E1D6] rounded-2xl p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-[#6B7280]">
              <span>Books</span>
              <Compass className="w-3.5 h-3.5 text-[#4A6B5D]" />
            </div>
            <p className="font-editorial text-2xl font-semibold text-[#1F2937]">
              {totalBooksCompleted}
            </p>
            <p className="text-[10px] text-[#6B7280]">of 66</p>
          </div>

          <div className="bg-white border border-[#E6E1D6] rounded-2xl p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-[#6B7280]">
              <span>Paper Bible</span>
              <BookMarked className="w-3.5 h-3.5 text-[#B47B44]" />
            </div>
            <p className="font-editorial text-2xl font-semibold text-[#1F2937]">
              {physicalCount}
            </p>
            <p className="text-[10px] text-[#6B7280]">chapters</p>
          </div>
        </section>

        {/* Visual "Running the Race" Milestone Path */}
        <section className="bg-white border border-[#E6E1D6] rounded-2xl p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-[#4A6B5D]" />
              <h2 className="font-editorial text-lg font-semibold text-[#1F2937]">
                Grace Milestones
              </h2>
            </div>
            <span className="text-[11px] font-medium text-[#4A6B5D]">
              Next: {nextMilestone.title} ({nextPct}%)
            </span>
          </div>

          {/* Next Milestone Progress Bar */}
          <div className="p-3.5 rounded-2xl bg-[#FAF9F6] border border-[#E6E1D6] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#1F2937]">
                {nextMilestone.title}
              </span>
              <span className="text-[11px] text-[#6B7280]">
                {Math.min(nextMilestone.current, nextMilestone.target)} /{" "}
                {nextMilestone.target} {nextMilestone.unit}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#E6E1D6] overflow-hidden">
              <div
                className="h-full bg-[#4A6B5D] transition-all duration-300"
                style={{ width: `${nextPct}%` }}
              />
            </div>
            <p className="text-[11px] text-[#6B7280]">
              {nextMilestone.subtitle}
            </p>
          </div>

          {/* Visual Stepping-Stone Path */}
          <div className="relative pl-4 space-y-3 before:content-[''] before:absolute before:left-[23px] before:top-3 before:bottom-3 before:w-[2px] before:bg-[#E6E1D6]">
            {milestones.map((m) => {
              const reached = m.current >= m.target;
              return (
                <div
                  key={m.id}
                  className="relative flex items-center gap-3.5"
                >
                  <span
                    className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      reached
                        ? "bg-[#4A6B5D] text-white"
                        : "bg-[#FAF9F6] border-2 border-[#E6E1D6] text-[#6B7280]"
                    }`}
                  >
                    {reached ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Award className="w-2.5 h-2.5" />
                    )}
                  </span>
                  <div className="flex-1 flex items-center justify-between gap-2 py-1">
                    <div>
                      <p
                        className={`text-xs font-semibold ${
                          reached ? "text-[#1F2937]" : "text-[#6B7280]"
                        }`}
                      >
                        {m.title}
                      </p>
                      <p className="text-[11px] text-[#6B7280]">{m.subtitle}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                        reached
                          ? "bg-[#EBF1EE] text-[#4A6B5D]"
                          : "bg-[#F4F1EA] text-[#6B7280]"
                      }`}
                    >
                      {reached ? "Reached" : `${m.target} ${m.unit}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Book-by-Book Private Progress */}
        <section className="bg-white border border-[#E6E1D6] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-editorial text-lg font-semibold text-[#1F2937]">
              Scripture by Book
            </h2>

            <div className="inline-flex p-1 rounded-xl bg-[#F4F1EA] border border-[#E6E1D6] text-[11px] font-medium">
              {(["ALL", "NT", "OT"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTestamentFilter(tab)}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    testamentFilter === tab
                      ? "bg-white text-[#1F2937] shadow-2xs"
                      : "text-[#6B7280] hover:text-[#1F2937]"
                  }`}
                >
                  {tab === "ALL" ? "All" : tab === "NT" ? "NT" : "OT"}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-10 flex items-center justify-center text-xs text-[#6B7280]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading your reading journey...
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
              {filteredBooks.map((b) => {
                const doneCount = completedSetByBook.get(b.name)?.size || 0;
                const isBookComplete = doneCount >= b.chapters;
                const pct = Math.min(
                  100,
                  Math.round((doneCount / b.chapters) * 100)
                );

                return (
                  <Link
                    key={b.name}
                    href={`/reader?book=${encodeURIComponent(b.name)}&chapter=1`}
                    className={`p-3 rounded-xl border transition-colors flex flex-col justify-between gap-2 ${
                      isBookComplete
                        ? "bg-[#EBF1EE] border-[#4A6B5D]"
                        : doneCount > 0
                        ? "bg-[#FAF9F6] border-[#CFE0D6]"
                        : "bg-[#FAF9F6] border-[#E6E1D6] hover:bg-[#F4F1EA]"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs gap-1">
                      <span className="font-editorial font-semibold text-[#1F2937] truncate">
                        {b.name}
                      </span>
                      <span className="text-[10.5px] text-[#6B7280] shrink-0">
                        {doneCount}/{b.chapters}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#E6E1D6] overflow-hidden">
                      <div
                        className="h-full bg-[#4A6B5D] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
