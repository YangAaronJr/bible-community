"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookMarked,
  BookOpen,
  Compass,
  Loader2,
  Lock,
  Settings,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import { createClient } from "@/lib/supabase/client";
import { BIBLE_BOOKS } from "@/lib/plans/reading-plans";

interface ProgressRow {
  book: string;
  chapter: number;
  read_in_physical_bible: boolean;
  completed_at: string;
}

export default function JourneyPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressRow[]>([]);
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

    const { data: rows } = await supabase
      .from("reading_progress")
      .select("book, chapter, read_in_physical_bible, completed_at")
      .eq("user_id", user.id)
      .order("completed_at", { ascending: false });

    setProgress(rows || []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadJourney();
  }, [loadJourney]);

  // Compute private chapter & book totals (strictly no streaks or reset timers)
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

  const filteredBooks = BIBLE_BOOKS.filter((b) =>
    testamentFilter === "ALL" ? true : b.testament === testamentFilter
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-24">
      <Navbar />

      <main className="flex-1 max-w-xl w-full mx-auto px-5 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#4A6B5D] font-semibold">
              <Lock className="w-3 h-3" />
              Strictly Private to You
            </span>
            <h1 className="font-editorial text-[28px] leading-none font-medium text-[#1F2937] tracking-tight">
              Journey
            </h1>
            <p className="text-xs text-[#6B7280]">
              Your quiet record in Scripture · Zero streaks or public metrics
            </p>
          </div>

          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-medium text-[#1F2937] transition-colors shrink-0"
          >
            <Settings className="w-3.5 h-3.5 text-[#4A6B5D]" />
            <span>Settings</span>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
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
