"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  Loader2,
  Moon,
  Sun,
  Trash2,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/types/database";
import {
  BIBLE_BOOKS,
  READING_PLAN_PRESETS,
  SCHEDULE_TRACK_OPTIONS,
  WEEKDAYS,
  chapterKey,
  type CustomScheduleSlot,
} from "@/lib/plans/reading-plans";

interface CustomScheduleRow {
  id: string;
  title: string;
  rest_days: number[];
  schedule_items: CustomScheduleSlot[];
  is_active: boolean;
}

export default function PlansPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState<"nt-90" | "gospels-psalms">("nt-90");
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());
  const [customSchedules, setCustomSchedules] = useState<CustomScheduleRow[]>(
    []
  );

  // Custom Schedule Builder state
  const [scheduleTitle, setScheduleTitle] = useState(
    "Morning OT & Evening NT"
  );
  const [morningTrack, setMorningTrack] = useState("OT");
  const [morningCount, setMorningCount] = useState(1);
  const [enableEvening, setEnableEvening] = useState(true);
  const [eveningTrack, setEveningTrack] = useState("NT");
  const [eveningCount, setEveningCount] = useState(1);
  const [restDays, setRestDays] = useState<number[]>([]);
  const [savingCustom, setSavingCustom] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Manual chapter jumper
  const [manualBook, setManualBook] = useState("John");
  const [manualChapter, setManualChapter] = useState(1);
  const [busy, setBusy] = useState(false);

  const loadPlans = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }
    setUserId(user.id);

    const saved =
      typeof window !== "undefined"
        ? localStorage.getItem("selected_reading_plan")
        : null;
    if (saved === "nt-90" || saved === "gospels-psalms") {
      setPlanId(saved);
    }

    const [{ data: rows }, { data: schedRows }] = await Promise.all([
      supabase
        .from("reading_progress")
        .select("book, chapter")
        .eq("user_id", user.id),
      supabase
        .from("custom_schedules")
        .select("id, title, rest_days, schedule_items, is_active")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    const set = new Set<string>();
    for (const r of rows || []) {
      set.add(chapterKey(r.book, r.chapter));
    }
    setCompletedKeys(set);

    setCustomSchedules(
      (schedRows || []).map((s) => ({
        id: s.id,
        title: s.title,
        rest_days: s.rest_days ?? [],
        schedule_items: Array.isArray(s.schedule_items)
          ? (s.schedule_items as unknown as CustomScheduleSlot[])
          : [],
        is_active: s.is_active,
      }))
    );
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  async function selectPresetPlan(id: "nt-90" | "gospels-psalms") {
    setPlanId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("selected_reading_plan", id);
    }
    if (userId) {
      const supabase = createClient();
      await supabase
        .from("custom_schedules")
        .update({ is_active: false })
        .eq("user_id", userId);
      await loadPlans();
    }
    setExpandedPlanId(null);
    setFeedback("Reading plan updated.");
    setTimeout(() => setFeedback(null), 2500);
  }

  function toggleRestDay(day: number) {
    setRestDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleSaveCustomSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !scheduleTitle.trim()) return;
    setSavingCustom(true);
    setFeedback(null);

    const items: CustomScheduleSlot[] = [
      {
        timeOfDay: "Morning",
        track: morningTrack,
        chaptersPerDay: morningCount,
      },
    ];
    if (enableEvening) {
      items.push({
        timeOfDay: "Evening",
        track: eveningTrack,
        chaptersPerDay: eveningCount,
      });
    }

    const supabase = createClient();
    await supabase
      .from("custom_schedules")
      .update({ is_active: false })
      .eq("user_id", userId);

    const { error } = await supabase.from("custom_schedules").insert({
      user_id: userId,
      title: scheduleTitle.trim(),
      rest_days: restDays,
      schedule_items: items as unknown as Json,
      is_active: true,
    });

    setSavingCustom(false);
    if (!error) {
      setCustomOpen(false);
      setFeedback("Custom schedule activated.");
      await loadPlans();
      setTimeout(() => setFeedback(null), 3000);
    }
  }

  async function handleActivateSchedule(id: string) {
    if (!userId) return;
    const supabase = createClient();
    await supabase
      .from("custom_schedules")
      .update({ is_active: false })
      .eq("user_id", userId);
    await supabase
      .from("custom_schedules")
      .update({ is_active: true })
      .eq("id", id);
    await loadPlans();
  }

  async function handleDeleteSchedule(id: string) {
    const supabase = createClient();
    await supabase.from("custom_schedules").delete().eq("id", id);
    await loadPlans();
  }

  async function toggleManualChapter() {
    if (!userId) return;
    setBusy(true);
    const key = chapterKey(manualBook, manualChapter);
    const supabase = createClient();

    try {
      if (completedKeys.has(key)) {
        await supabase
          .from("reading_progress")
          .delete()
          .eq("user_id", userId)
          .eq("book", manualBook)
          .eq("chapter", manualChapter);
        const next = new Set(completedKeys);
        next.delete(key);
        setCompletedKeys(next);
      } else {
        await supabase.from("reading_progress").upsert(
          {
            user_id: userId,
            book: manualBook,
            chapter: manualChapter,
            read_in_physical_bible: true,
            completed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,book,chapter" }
        );
        const next = new Set(completedKeys);
        next.add(key);
        setCompletedKeys(next);
      }
    } finally {
      setBusy(false);
    }
  }

  const activeCustom = customSchedules.find((s) => s.is_active) || null;
  const selectedBookMeta =
    BIBLE_BOOKS.find((b) => b.name === manualBook) || BIBLE_BOOKS[0];
  const isManualDone = completedKeys.has(chapterKey(manualBook, manualChapter));

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-24">
      <Navbar />

      <main className="flex-1 max-w-xl w-full mx-auto px-5 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="font-editorial text-[26px] leading-none font-medium text-[#1F2937] tracking-tight">
            Reading Plans
          </h1>
          <Link
            href="/"
            className="px-3.5 py-1.5 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-medium text-[#1F2937] transition-colors"
          >
            Done
          </Link>
        </div>

        {feedback && (
          <div className="px-4 py-2.5 rounded-2xl bg-[#EBF1EE] border border-[#CFE0D6] text-xs font-medium text-[#3D5A4E]">
            {feedback}
          </div>
        )}

        {loading ? (
          <div className="p-8 bg-white border border-[#E6E1D6] rounded-2xl flex items-center justify-center text-xs text-[#6B7280]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading plans...
          </div>
        ) : (
          <>
            {/* 1. Minimalist Preset Plans (title-only rows, expand in place) */}
            <section className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] px-1">
                Preset Plans
              </span>
              <div className="bg-white border border-[#E6E1D6] rounded-2xl overflow-hidden divide-y divide-[#E6E1D6]">
                {READING_PLAN_PRESETS.map((plan) => {
                  const selected = !activeCustom && plan.id === planId;
                  const isExpanded = expandedPlanId === plan.id;
                  const doneCount = plan.sequence.filter((c) =>
                    completedKeys.has(chapterKey(c.book, c.chapter))
                  ).length;

                  return (
                    <div key={plan.id} className="transition-colors">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedPlanId(isExpanded ? null : plan.id)
                        }
                        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#FCFBF8] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-editorial text-[17px] font-medium text-[#1F2937] truncate">
                            {plan.title}
                          </span>
                          {selected && (
                            <Check
                              className="w-4 h-4 text-[#4A6B5D] shrink-0"
                              aria-label="Active plan"
                            />
                          )}
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-[#6B7280] shrink-0 transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      <div
                        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                          isExpanded
                            ? "grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0"
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="px-4 pb-4 pt-0.5 space-y-3">
                            <p className="text-xs text-[#6B7280] leading-relaxed">
                              {plan.description}
                            </p>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[11px] font-medium text-[#4A6B5D]">
                                {doneCount}/{plan.sequence.length} chapters
                              </span>
                              <button
                                type="button"
                                disabled={selected}
                                onClick={() => selectPresetPlan(plan.id)}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                                  selected
                                    ? "bg-[#EBF1EE] text-[#3D5A4E] border border-[#CFE0D6] cursor-default"
                                    : "bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white cursor-pointer"
                                }`}
                              >
                                {selected ? "Selected" : "Select Plan"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 2. Saved Custom Schedules */}
            {customSchedules.length > 0 && (
              <section className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] px-1">
                  Custom Schedules
                </span>
                <div className="bg-white border border-[#E6E1D6] rounded-2xl overflow-hidden divide-y divide-[#E6E1D6]">
                  {customSchedules.map((sched) => {
                    const restLabels = sched.rest_days
                      .map((d) => WEEKDAYS.find((w) => w.day === d)?.short)
                      .filter(Boolean)
                      .join(", ");

                    return (
                      <div
                        key={sched.id}
                        className="px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-editorial text-base font-medium text-[#1F2937] truncate">
                              {sched.title}
                            </span>
                            {sched.is_active && (
                              <Check
                                className="w-4 h-4 text-[#4A6B5D] shrink-0"
                                aria-label="Active schedule"
                              />
                            )}
                          </div>
                          <p className="text-[11px] text-[#6B7280] truncate mt-0.5">
                            {sched.schedule_items
                              .map(
                                (it) =>
                                  `${it.timeOfDay}: ${it.track} (${it.chaptersPerDay})`
                              )
                              .join(" · ")}
                            {restLabels ? ` · Rest: ${restLabels}` : ""}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {!sched.is_active && (
                            <button
                              type="button"
                              onClick={() => handleActivateSchedule(sched.id)}
                              className="px-3 py-1 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-medium text-[#1F2937] cursor-pointer"
                            >
                              Select
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteSchedule(sched.id)}
                            className="p-1.5 text-[#6B7280] hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                            title="Delete schedule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 3. Collapsible Custom Schedule Builder (closed by default) */}
            <section className="bg-white border border-[#E6E1D6] rounded-2xl overflow-hidden">
              <button
                type="button"
                aria-expanded={customOpen}
                onClick={() => setCustomOpen((prev) => !prev)}
                className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#FCFBF8] transition-colors cursor-pointer"
              >
                <span className="text-sm font-medium text-[#4A6B5D]">
                  + Custom Schedule
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-[#6B7280] shrink-0 transition-transform duration-200 ${
                    customOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              <div
                className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                  customOpen
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <form
                    onSubmit={handleSaveCustomSchedule}
                    className="px-4 pb-4 pt-2 border-t border-[#E6E1D6] space-y-3.5"
                  >
                    <div>
                      <label className="block text-xs font-medium text-[#1F2937] mb-1">
                        Schedule Name
                      </label>
                      <input
                        type="text"
                        required
                        value={scheduleTitle}
                        onChange={(e) => setScheduleTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E6E1D6] bg-[#FAF9F6] text-xs text-[#1F2937] focus:outline-none focus:border-[#4A6B5D]"
                      />
                    </div>

                    <div className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E6E1D6] space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-[#1F2937]">
                        <Sun className="w-3.5 h-3.5 text-[#B47B44]" />
                        <span>Morning</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={morningTrack}
                          onChange={(e) => setMorningTrack(e.target.value)}
                          className="col-span-2 px-2.5 py-2 rounded-xl border border-[#E6E1D6] bg-white text-xs text-[#1F2937]"
                        >
                          {SCHEDULE_TRACK_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={morningCount}
                          onChange={(e) =>
                            setMorningCount(Number(e.target.value))
                          }
                          className="px-2.5 py-2 rounded-xl border border-[#E6E1D6] bg-white text-xs text-[#1F2937]"
                        >
                          {[1, 2, 3].map((n) => (
                            <option key={n} value={n}>
                              {n} ch
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E6E1D6] space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[#1F2937]">
                          <Moon className="w-3.5 h-3.5 text-[#4A6B5D]" />
                          <span>Evening</span>
                        </div>
                        <label className="flex items-center gap-1.5 text-[11px] text-[#6B7280] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enableEvening}
                            onChange={(e) => setEnableEvening(e.target.checked)}
                            className="rounded border-[#E6E1D6] accent-[#4A6B5D]"
                          />
                          <span>Include</span>
                        </label>
                      </div>

                      {enableEvening && (
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            value={eveningTrack}
                            onChange={(e) => setEveningTrack(e.target.value)}
                            className="col-span-2 px-2.5 py-2 rounded-xl border border-[#E6E1D6] bg-white text-xs text-[#1F2937]"
                          >
                            {SCHEDULE_TRACK_OPTIONS.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={eveningCount}
                            onChange={(e) =>
                              setEveningCount(Number(e.target.value))
                            }
                            className="px-2.5 py-2 rounded-xl border border-[#E6E1D6] bg-white text-xs text-[#1F2937]"
                          >
                            {[1, 2, 3].map((n) => (
                              <option key={n} value={n}>
                                {n} ch
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-[#1F2937]">
                        Sabbath Rest Days
                      </label>
                      <div className="grid grid-cols-7 gap-1.5">
                        {WEEKDAYS.map((w) => {
                          const selected = restDays.includes(w.day);
                          return (
                            <button
                              key={w.day}
                              type="button"
                              onClick={() => toggleRestDay(w.day)}
                              className={`py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                                selected
                                  ? "bg-[#4A6B5D] border-[#4A6B5D] dark:bg-[#63826A] dark:border-[#63826A] text-white"
                                  : "bg-[#FAF9F6] border-[#E6E1D6] text-[#6B7280] hover:text-[#1F2937]"
                              }`}
                            >
                              {w.short}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={savingCustom || !scheduleTitle.trim()}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {savingCustom ? "Saving..." : "Save & Activate"}
                    </button>
                  </form>
                </div>
              </div>
            </section>

            {/* 4. Compact Chapter Jumper */}
            <section className="bg-white border border-[#E6E1D6] rounded-2xl p-4 space-y-3">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                Jump to Chapter
              </span>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={manualBook}
                  onChange={(e) => {
                    setManualBook(e.target.value);
                    setManualChapter(1);
                  }}
                  className="px-3 py-2 rounded-xl border border-[#E6E1D6] bg-[#FAF9F6] text-xs font-medium text-[#1F2937]"
                >
                  {BIBLE_BOOKS.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>

                <select
                  value={manualChapter}
                  onChange={(e) => setManualChapter(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl border border-[#E6E1D6] bg-[#FAF9F6] text-xs font-medium text-[#1F2937]"
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
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Link
                  href={`/reader?book=${encodeURIComponent(
                    manualBook
                  )}&chapter=${manualChapter}`}
                  className="py-2 px-3 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Read</span>
                </Link>

                <button
                  type="button"
                  disabled={busy}
                  onClick={toggleManualChapter}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isManualDone
                      ? "bg-[#EBF1EE] border-[#CFE0D6] text-[#3D5A4E]"
                      : "bg-[#FAF9F6] border-[#E6E1D6] text-[#1F2937] hover:bg-[#F4F1EA]"
                  }`}
                >
                  {isManualDone ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Completed</span>
                    </>
                  ) : (
                    <>
                      <BookMarked className="w-3.5 h-3.5 text-[#B47B44]" />
                      <span>Physical Bible</span>
                    </>
                  )}
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
