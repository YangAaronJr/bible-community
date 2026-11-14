"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookMarked,
  BookOpen,
  CheckCircle2,
  Feather,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import { createClient } from "@/lib/supabase/client";
import {
  BIBLE_BOOKS,
  READING_PLAN_PRESETS,
  chapterKey,
  type ReadingPlanPreset,
} from "@/lib/plans/reading-plans";

interface ProgressEntry {
  book: string;
  chapter: number;
  read_in_physical_bible: boolean;
}

interface CircleOption {
  id: string;
  name: string;
}

export default function TodayPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState<"nt-90" | "gospels-psalms">("nt-90");
  const [progressMap, setProgressMap] = useState<Map<string, ProgressEntry>>(
    new Map()
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Manual chapter selector
  const [manualBook, setManualBook] = useState("John");
  const [manualChapter, setManualChapter] = useState(1);

  // Reflection prompt
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [selectedCircleId, setSelectedCircleId] = useState<string>("");
  const [reflectionText, setReflectionText] = useState("");
  const [postingReflection, setPostingReflection] = useState(false);
  const [reflectionFeedback, setReflectionFeedback] = useState<string | null>(
    null
  );

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }
    setUserId(user.id);

    const savedPlan =
      typeof window !== "undefined"
        ? localStorage.getItem("selected_reading_plan")
        : null;
    if (savedPlan === "nt-90" || savedPlan === "gospels-psalms") {
      setPlanId(savedPlan);
    }

    const { data: progressRows } = await supabase
      .from("reading_progress")
      .select("book, chapter, read_in_physical_bible")
      .eq("user_id", user.id);

    const map = new Map<string, ProgressEntry>();
    for (const row of progressRows || []) {
      map.set(chapterKey(row.book, row.chapter), row);
    }
    setProgressMap(map);

    // Load user's circles for the reflection prompt
    const { data: memberships } = await supabase
      .from("circle_members")
      .select("circle_id")
      .eq("user_id", user.id);

    const circleIds = (memberships || []).map((m) => m.circle_id);
    if (circleIds.length > 0) {
      const { data: circleRows } = await supabase
        .from("circles")
        .select("id, name")
        .in("id", circleIds);
      const list = circleRows || [];
      setCircles(list);
      const savedCircle =
        typeof window !== "undefined"
          ? localStorage.getItem("active_circle_id")
          : null;
      const defaultCircle =
        list.find((c) => c.id === savedCircle) || list[0] || null;
      if (defaultCircle) setSelectedCircleId(defaultCircle.id);
    }

    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleSelectPlan(id: "nt-90" | "gospels-psalms") {
    setPlanId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("selected_reading_plan", id);
    }
  }

  async function toggleChapterCompletion(
    book: string,
    chapter: number,
    physicalBible: boolean
  ) {
    if (!userId) return;
    const key = chapterKey(book, chapter);
    setBusyKey(key);

    const supabase = createClient();
    const existing = progressMap.get(key);

    try {
      if (existing && existing.read_in_physical_bible === physicalBible) {
        // Uncheck if clicking the exact same completion state
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
        // Upsert completion
        await supabase.from("reading_progress").upsert(
          {
            user_id: userId,
            book,
            chapter,
            read_in_physical_bible: physicalBible,
            completed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,book,chapter" }
        );

        const next = new Map(progressMap);
        next.set(key, {
          book,
          chapter,
          read_in_physical_bible: physicalBible,
        });
        setProgressMap(next);
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function handlePostReflection(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !selectedCircleId || !reflectionText.trim()) return;
    setPostingReflection(true);
    setReflectionFeedback(null);

    const supabase = createClient();
    const { error } = await supabase.from("messages").insert({
      circle_id: selectedCircleId,
      sender_id: userId,
      recipient_id: null,
      parent_id: null,
      content: `Reflection — "What does this passage show about who God is?"\n\n${reflectionText.trim()}`,
    });

    setPostingReflection(false);
    if (!error) {
      setReflectionText("");
      setReflectionFeedback("Shared quietly with your Circle thread.");
      setTimeout(() => setReflectionFeedback(null), 4000);
    } else {
      setReflectionFeedback(error.message);
    }
  }

  const activePlan: ReadingPlanPreset =
    READING_PLAN_PRESETS.find((p) => p.id === planId) ||
    READING_PLAN_PRESETS[0];

  const completedInPlan = activePlan.sequence.filter((c) =>
    progressMap.has(chapterKey(c.book, c.chapter))
  ).length;

  // Find the next uncompleted chapters in the plan (plus up to 1 recently completed for context)
  const uncompletedList = activePlan.sequence.filter(
    (c) => !progressMap.has(chapterKey(c.book, c.chapter))
  );
  const todaysPortion = uncompletedList.slice(0, activePlan.dailyTargetCount + 1);

  const selectedBookMeta =
    BIBLE_BOOKS.find((b) => b.name === manualBook) || BIBLE_BOOKS[0];
  const manualKey = chapterKey(manualBook, manualChapter);
  const manualCompleted = progressMap.get(manualKey);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-20 sm:pb-12">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-[#4B6F5B] font-semibold">
            Today&apos;s Reading Sanctuary
          </p>
          <h1 className="text-2xl sm:text-3xl font-serif font-semibold text-[#1F2937]">
            Grace-Paced Scripture
          </h1>
          <p className="text-sm text-[#596579]">
            Pick up right where you left off. No streaks, no countdowns, and
            full support for your physical paper Bible.
          </p>
        </div>

        {/* Preset Reading Plan Switcher */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#596579]">
              Preset Reading Plans
            </h2>
            <span className="text-xs text-[#596579]">
              {completedInPlan} of {activePlan.sequence.length} chapters
              completed
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {READING_PLAN_PRESETS.map((plan) => {
              const selected = plan.id === planId;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => handleSelectPlan(plan.id)}
                  className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                    selected
                      ? "bg-white border-[#4B6F5B] ring-1 ring-[#4B6F5B] shadow-2xs"
                      : "bg-white/70 border-[#E5E0D8] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-serif font-semibold text-base text-[#1F2937]">
                      {plan.title}
                    </span>
                    {selected && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#E3EBE6] text-[#3D5A4A]">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#4B6F5B] font-medium mb-1.5">
                    {plan.subtitle}
                  </p>
                  <p className="text-xs text-[#596579] leading-relaxed">
                    {plan.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Today's Portion */}
        <section className="bg-white border border-[#E5E0D8] rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-serif font-semibold text-[#1F2937]">
                Next Up in {activePlan.title}
              </h2>
              <p className="text-xs text-[#596579]">
                Read directly in the app or check off after reading in your
                physical Bible.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="py-8 flex items-center justify-center text-sm text-[#596579]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading your reading progress...
            </div>
          ) : todaysPortion.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#F4F7F5] text-center space-y-2">
              <Sparkles className="w-6 h-6 text-[#4B6F5B] mx-auto" />
              <p className="text-sm font-medium text-[#1F2937]">
                You have completed every chapter in {activePlan.title}!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E5E0D8]">
              {todaysPortion.map((item) => {
                const key = chapterKey(item.book, item.chapter);
                const entry = progressMap.get(key);
                const isBusy = busyKey === key;

                return (
                  <div
                    key={key}
                    className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#F3EFEA] text-[#4B6F5B] font-serif font-semibold text-sm">
                        {item.chapter}
                      </span>
                      <div>
                        <p className="font-serif font-semibold text-base text-[#1F2937]">
                          {item.book} {item.chapter}
                        </p>
                        {entry && (
                          <span className="text-[11px] text-[#4B6F5B] font-medium">
                            {entry.read_in_physical_bible
                              ? "✓ Checked off (Physical Bible)"
                              : "✓ Completed in App"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/reader?book=${encodeURIComponent(
                          item.book
                        )}&chapter=${item.chapter}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[#4B6F5B] text-white hover:bg-[#3D5A4A] transition-colors"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Read in App</span>
                      </Link>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          toggleChapterCompletion(item.book, item.chapter, true)
                        }
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          entry?.read_in_physical_bible
                            ? "bg-[#E3EBE6] border-[#4B6F5B] text-[#3D5A4A]"
                            : "bg-[#FAF9F6] border-[#E5E0D8] text-[#1F2937] hover:bg-[#F3EFEA]"
                        }`}
                      >
                        <BookMarked className="w-3.5 h-3.5 text-[#4B6F5B]" />
                        <span>Checked Off (Physical Bible)</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Check Off Any Chapter Manually */}
        <section className="bg-white border border-[#E5E0D8] rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xs">
          <div>
            <h2 className="text-base font-serif font-semibold text-[#1F2937]">
              Check Off Any Chapter Manually
            </h2>
            <p className="text-xs text-[#596579]">
              Reading outside the preset plan? Select any book and chapter below.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <select
              value={manualBook}
              onChange={(e) => {
                setManualBook(e.target.value);
                setManualChapter(1);
              }}
              className="px-3 py-2 rounded-lg border border-[#E5E0D8] bg-[#FAF9F6] text-xs font-medium text-[#1F2937]"
            >
              {BIBLE_BOOKS.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} ({b.testament})
                </option>
              ))}
            </select>

            <select
              value={manualChapter}
              onChange={(e) => setManualChapter(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-[#E5E0D8] bg-[#FAF9F6] text-xs font-medium text-[#1F2937]"
            >
              {Array.from(
                { length: selectedBookMeta.chapters },
                (_, idx) => idx + 1
              ).map((ch) => (
                <option key={ch} value={ch}>
                  Chapter {ch}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Link
                href={`/reader?book=${encodeURIComponent(
                  manualBook
                )}&chapter=${manualChapter}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[#4B6F5B] text-white hover:bg-[#3D5A4A] transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Read in App</span>
              </Link>

              <button
                type="button"
                disabled={busyKey === manualKey}
                onClick={() =>
                  toggleChapterCompletion(manualBook, manualChapter, true)
                }
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  manualCompleted
                    ? "bg-[#E3EBE6] border-[#4B6F5B] text-[#3D5A4A]"
                    : "bg-[#FAF9F6] border-[#E5E0D8] text-[#1F2937] hover:bg-[#F3EFEA]"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-[#4B6F5B]" />
                <span>
                  {manualCompleted
                    ? "✓ Checked Off (Click to Undo)"
                    : "Checked Off (Physical Bible)"}
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* Quiet Optional Reflection Prompt */}
        <section className="bg-[#F4F7F5] border border-[#C5D7CC] rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3D5A4A]">
                <Feather className="w-3.5 h-3.5" />
                Optional Quiet Reflection
              </span>
              <h3 className="text-base font-serif font-semibold text-[#1F2937] italic">
                &ldquo;What does this passage show about who God is?&rdquo;
              </h3>
            </div>

            {circles.length > 1 && (
              <select
                value={selectedCircleId}
                onChange={(e) => setSelectedCircleId(e.target.value)}
                className="text-xs border border-[#C5D7CC] rounded-lg px-2.5 py-1.5 bg-white text-[#1F2937]"
              >
                {circles.map((c) => (
                  <option key={c.id} value={c.id}>
                    Post to: {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {circles.length === 0 ? (
            <p className="text-xs text-[#596579]">
              Join or create a Circle on the{" "}
              <Link href="/circle" className="text-[#4B6F5B] underline">
                Circle page
              </Link>{" "}
               whenever you&apos;d like to share reflections with friends.
            </p>
          ) : (
            <form onSubmit={handlePostReflection} className="space-y-3">
              <textarea
                rows={3}
                placeholder="Write a brief thought or prayer to share with your Circle (optional)..."
                value={reflectionText}
                onChange={(e) => setReflectionText(e.target.value)}
                className="w-full p-3 rounded-xl border border-[#C5D7CC] bg-white text-sm text-[#1F2937] focus:outline-none focus:border-[#4B6F5B]"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#3D5A4A]">
                  {reflectionFeedback || ""}
                </span>
                <button
                  type="submit"
                  disabled={postingReflection || !reflectionText.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4B6F5B] hover:bg-[#3D5A4A] disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Post to Circle Thread</span>
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
