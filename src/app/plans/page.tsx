"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import QuietPageHeader from "@/components/ui/QuietPageHeader";
import NewPlanFlow, { type NewPlanResult } from "@/components/plans/NewPlanFlow";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/types/database";
import {
  READING_PLAN_PRESETS,
  WEEKDAYS,
  chapterKey,
  parseSharedPlan,
  resolveTrackSequence,
  type ChapterRef,
  type CustomScheduleSlot,
} from "@/lib/plans/reading-plans";

interface CustomScheduleRow {
  id: string;
  title: string;
  rest_days: number[];
  schedule_items: CustomScheduleSlot[];
  is_active: boolean;
}

interface CirclePlanRow {
  id: string;
  name: string;
  shared_plan_id: string | null;
}

function getScheduleSequence(items: CustomScheduleSlot[]): ChapterRef[] {
  const seen = new Set<string>();
  const seq: ChapterRef[] = [];
  for (const item of items) {
    for (const ch of resolveTrackSequence(item.track)) {
      const k = chapterKey(ch.book, ch.chapter);
      if (!seen.has(k)) {
        seen.add(k);
        seq.push(ch);
      }
    }
  }
  return seq;
}

function countCompleted(
  sequence: ChapterRef[],
  completedKeys: Set<string>
): number {
  let count = 0;
  for (const ch of sequence) {
    if (completedKeys.has(chapterKey(ch.book, ch.chapter))) {
      count++;
    }
  }
  return count;
}

export default function PlansPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState<"nt-90" | "gospels-psalms">("nt-90");
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());
  const [customSchedules, setCustomSchedules] = useState<CustomScheduleRow[]>(
    []
  );
  const [circlePlans, setCirclePlans] = useState<CirclePlanRow[]>([]);

  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingCircleId, setSyncingCircleId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2800);
  }, []);

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

    const [{ data: rows }, { data: schedRows }, { data: memberRows }] =
      await Promise.all([
        supabase
          .from("reading_progress")
          .select("book, chapter")
          .eq("user_id", user.id),
        supabase
          .from("custom_schedules")
          .select("id, title, rest_days, schedule_items, is_active")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("circle_members")
          .select("circles ( id, name, shared_plan_id )")
          .eq("user_id", user.id),
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

    const circles: CirclePlanRow[] = [];
    for (const m of memberRows || []) {
      const c = (
        m as unknown as {
          circles: CirclePlanRow | null;
        }
      ).circles;
      if (c && c.shared_plan_id) {
        circles.push(c);
      }
    }
    setCirclePlans(circles);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadPlans();
    });
    return () => {
      active = false;
    };
  }, [loadPlans]);

  const activeCustom = customSchedules.find((s) => s.is_active) || null;
  const activePreset =
    READING_PLAN_PRESETS.find((p) => p.id === planId) ||
    READING_PLAN_PRESETS[0];

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
    setSwitchOpen(false);
    showToast("Reading plan updated.");
  }

  async function handleNewPlanComplete(result: NewPlanResult) {
    if (!userId) return;
    setSaving(true);
    try {
      if (result.kind === "preset" && result.presetId) {
        await selectPresetPlan(result.presetId);
        setNewPlanOpen(false);
        return;
      }

      const supabase = createClient();
      await supabase
        .from("custom_schedules")
        .update({ is_active: false })
        .eq("user_id", userId);

      const items: CustomScheduleSlot[] = [
        {
          timeOfDay: "Morning",
          track: result.books.join(", "),
          chaptersPerDay: result.chaptersPerDay,
        },
      ];

      const { error } = await supabase.from("custom_schedules").insert({
        user_id: userId,
        title: result.title,
        rest_days: result.restDays,
        schedule_items: items as unknown as Json,
        is_active: true,
      });

      if (!error) {
        setNewPlanOpen(false);
        setSwitchOpen(false);
        await loadPlans();
        showToast(`"${result.title}" activated.`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActiveRestDay(day: number) {
    if (!activeCustom) return;
    const nextRest = activeCustom.rest_days.includes(day)
      ? activeCustom.rest_days.filter((d) => d !== day)
      : [...activeCustom.rest_days, day];

    setCustomSchedules((prev) =>
      prev.map((s) =>
        s.id === activeCustom.id ? { ...s, rest_days: nextRest } : s
      )
    );
    const supabase = createClient();
    await supabase
      .from("custom_schedules")
      .update({ rest_days: nextRest })
      .eq("id", activeCustom.id);
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
    setSwitchOpen(false);
    await loadPlans();
    showToast("Reading plan switched.");
  }

  async function handleLeaveCustomSchedule(id: string) {
    if (!userId) return;
    const supabase = createClient();
    await supabase
      .from("custom_schedules")
      .update({ is_active: false })
      .eq("id", id);
    await loadPlans();
    showToast("Switched back to preset plan.");
  }

  async function handleDeleteSchedule(id: string) {
    const supabase = createClient();
    await supabase.from("custom_schedules").delete().eq("id", id);
    await loadPlans();
  }

  async function handleSyncCirclePlan(circle: CirclePlanRow) {
    if (!userId || !circle.shared_plan_id) return;
    const parsed = parseSharedPlan(circle.shared_plan_id);
    if (!parsed) return;

    setSyncingCircleId(circle.id);
    try {
      if (parsed.kind === "preset") {
        await selectPresetPlan(parsed.preset.id);
      } else {
        const supabase = createClient();
        await supabase
          .from("custom_schedules")
          .update({ is_active: false })
          .eq("user_id", userId);

        const items: CustomScheduleSlot[] = [
          {
            timeOfDay: "Morning",
            track: parsed.custom.books.join(", "),
            chaptersPerDay: parsed.custom.chaptersPerDay,
          },
        ];

        await supabase.from("custom_schedules").insert({
          user_id: userId,
          title: parsed.custom.title,
          rest_days: parsed.custom.restDays,
          schedule_items: items as unknown as Json,
          is_active: true,
        });
        await loadPlans();
        showToast(`Synced to "${parsed.custom.title}".`);
      }
    } finally {
      setSyncingCircleId(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] dark:bg-[#141413]">
        <Loader2 className="w-6 h-6 animate-spin text-[#4A6B5D] dark:text-[#7C9A82]" />
      </div>
    );
  }

  const activeSequence = activeCustom
    ? getScheduleSequence(activeCustom.schedule_items)
    : activePreset.sequence;
  const activeDone = countCompleted(activeSequence, completedKeys);
  const activeTotal = activeSequence.length;
  const activePct =
    activeTotal > 0 ? Math.round((activeDone / activeTotal) * 100) : 0;
  const activeDailyCount = activeCustom
    ? activeCustom.schedule_items.reduce(
        (sum, s) => sum + (s.chaptersPerDay || 1),
        0
      )
    : activePreset.dailyTargetCount;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] dark:bg-[#141413] text-[#1F2937] dark:text-[#F3F2EE] pb-24">
      <Navbar />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 pt-6 space-y-6">
        <QuietPageHeader
          title="Reading Plans"
          subtitle="Unhurried rhythm in the Word"
          rightSlot={
            <button
              type="button"
              onClick={() => setNewPlanOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Plan</span>
            </button>
          }
        />

        {feedback && (
          <div className="px-4 py-2.5 rounded-xl bg-[#EBF1EE] dark:bg-[#202923] border border-[#CFE0D6] dark:border-[#3A4D40] text-xs font-medium text-[#3D5A4E] dark:text-[#A3C4AE]">
            {feedback}
          </div>
        )}

        {/* Active Personal Plan */}
        <section className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#A1A19A]">
            Active Personal Plan
          </h2>

          <div className="bg-white dark:bg-[#1C1C1A] border border-[#E6E1D6] dark:border-[#2C2C28] rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#4A6B5D] dark:text-[#7C9A82] shrink-0" />
                  <h3 className="font-editorial text-lg font-semibold text-[#1F2937] dark:text-[#F3F2EE] truncate">
                    {activeCustom ? activeCustom.title : activePreset.title}
                  </h3>
                </div>
                <p className="text-xs text-[#6B7280] dark:text-[#A1A19A]">
                  {activeDailyCount}{" "}
                  {activeDailyCount === 1 ? "chapter" : "chapters"}/day ·{" "}
                  {activeDone}/{activeTotal} chapters ({activePct}%)
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setSwitchOpen((v) => !v)}
                  className="px-3 py-1.5 rounded-lg border border-[#E6E1D6] dark:border-[#2C2C28] bg-[#FAF9F6] dark:bg-[#141413] text-xs font-medium text-[#1F2937] dark:text-[#F3F2EE] hover:border-[#4A6B5D] transition-colors cursor-pointer"
                >
                  {switchOpen ? "Close" : "Switch"}
                </button>
                {activeCustom && (
                  <button
                    type="button"
                    onClick={() => handleLeaveCustomSchedule(activeCustom.id)}
                    className="px-3 py-1.5 rounded-lg border border-[#E6E1D6] dark:border-[#2C2C28] text-xs font-medium text-[#6B7280] dark:text-[#A1A19A] hover:text-[#1F2937] dark:hover:text-[#F3F2EE] transition-colors cursor-pointer"
                  >
                    Leave
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full rounded-full bg-[#F4F1EA] dark:bg-[#262623] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#4A6B5D] dark:bg-[#63826A] transition-all duration-300"
                style={{ width: `${activePct}%` }}
              />
            </div>

            {/* Sabbath Rest Days */}
            <div className="pt-1 space-y-2">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#A1A19A]">
                Sabbath Rest Days
              </span>
              {activeCustom ? (
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((w) => {
                    const isRest = activeCustom.rest_days.includes(w.day);
                    return (
                      <button
                        key={w.day}
                        type="button"
                        onClick={() => handleToggleActiveRestDay(w.day)}
                        aria-pressed={isRest}
                        className={`py-1.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                          isRest
                            ? "bg-[#4A6B5D] dark:bg-[#63826A] text-white border-[#4A6B5D] dark:border-[#63826A]"
                            : "bg-[#FAF9F6] dark:bg-[#141413] text-[#6B7280] dark:text-[#A1A19A] border-[#E6E1D6] dark:border-[#2C2C28] hover:border-[#4A6B5D]/60"
                        }`}
                      >
                        {w.short}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-[#6B7280] dark:text-[#A1A19A]">
                  No rest days on preset plans. Create a custom plan via{" "}
                  <button
                    type="button"
                    onClick={() => setNewPlanOpen(true)}
                    className="underline text-[#4A6B5D] dark:text-[#7C9A82] cursor-pointer"
                  >
                    + New Plan
                  </button>{" "}
                  to set Sabbath rest days.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Compact Switcher Drawer (only when toggled) */}
        {switchOpen && (
          <section className="bg-white dark:bg-[#1C1C1A] border border-[#E6E1D6] dark:border-[#2C2C28] rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#A1A19A]">
              Switch Personal Plan
            </h3>

            <div className="space-y-2">
              {READING_PLAN_PRESETS.map((preset) => {
                const isCurrent = !activeCustom && planId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => selectPresetPlan(preset.id)}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      isCurrent
                        ? "bg-[#EBF1EE]/70 dark:bg-[#202923] border-[#4A6B5D] dark:border-[#63826A]"
                        : "bg-[#FAF9F6] dark:bg-[#141413] border-[#E6E1D6] dark:border-[#2C2C28] hover:border-[#4A6B5D]/60"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1F2937] dark:text-[#F3F2EE] truncate">
                        {preset.title}
                      </p>
                      <p className="text-[11px] text-[#6B7280] dark:text-[#A1A19A]">
                        Preset · {preset.dailyTargetCount} ch/day
                      </p>
                    </div>
                    {isCurrent && (
                      <Check className="w-4 h-4 text-[#4A6B5D] dark:text-[#7C9A82] shrink-0" />
                    )}
                  </button>
                );
              })}

              {customSchedules.map((sched) => (
                <div
                  key={sched.id}
                  className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border ${
                    sched.is_active
                      ? "bg-[#EBF1EE]/70 dark:bg-[#202923] border-[#4A6B5D] dark:border-[#63826A]"
                      : "bg-[#FAF9F6] dark:bg-[#141413] border-[#E6E1D6] dark:border-[#2C2C28]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleActivateSchedule(sched.id)}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <p className="text-sm font-medium text-[#1F2937] dark:text-[#F3F2EE] truncate">
                      {sched.title}
                    </p>
                    <p className="text-[11px] text-[#6B7280] dark:text-[#A1A19A]">
                      Custom ·{" "}
                      {sched.schedule_items.reduce(
                        (sum, s) => sum + (s.chaptersPerDay || 1),
                        0
                      )}{" "}
                      ch/day
                    </p>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {sched.is_active && (
                      <Check className="w-4 h-4 text-[#4A6B5D] dark:text-[#7C9A82]" />
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteSchedule(sched.id)}
                      aria-label={`Delete ${sched.title}`}
                      className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active Circle Plans */}
        <section className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#A1A19A]">
            Circle Plans
          </h2>

          {circlePlans.length === 0 ? (
            <div className="bg-white dark:bg-[#1C1C1A] border border-[#E6E1D6] dark:border-[#2C2C28] rounded-2xl p-5 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-[#1F2937] dark:text-[#F3F2EE]">
                  No active Circle plan
                </p>
                <p className="text-xs text-[#6B7280] dark:text-[#A1A19A]">
                  Set a shared reading plan inside any Circle&apos;s settings.
                </p>
              </div>
              <Link
                href="/circles"
                className="px-3 py-1.5 rounded-lg border border-[#E6E1D6] dark:border-[#2C2C28] text-xs font-medium text-[#4A6B5D] dark:text-[#7C9A82] hover:bg-[#EBF1EE] dark:hover:bg-[#202923] transition-colors shrink-0"
              >
                Circles
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {circlePlans.map((circle) => {
                const parsed = parseSharedPlan(circle.shared_plan_id);
                if (!parsed) return null;

                const title =
                  parsed.kind === "preset"
                    ? parsed.preset.title
                    : parsed.custom.title;
                const seq =
                  parsed.kind === "preset"
                    ? parsed.preset.sequence
                    : resolveTrackSequence(parsed.custom.books.join(", "));
                const done = countCompleted(seq, completedKeys);
                const pct =
                  seq.length > 0 ? Math.round((done / seq.length) * 100) : 0;
                const daily =
                  parsed.kind === "preset"
                    ? parsed.preset.dailyTargetCount
                    : parsed.custom.chaptersPerDay;
                const restLabels =
                  parsed.kind === "custom" && parsed.custom.restDays.length > 0
                    ? parsed.custom.restDays
                        .map(
                          (d) => WEEKDAYS.find((w) => w.day === d)?.short || ""
                        )
                        .filter(Boolean)
                        .join(", ")
                    : null;

                return (
                  <div
                    key={circle.id}
                    className="bg-white dark:bg-[#1C1C1A] border border-[#E6E1D6] dark:border-[#2C2C28] rounded-2xl p-5 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#4A6B5D] dark:text-[#7C9A82]">
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{circle.name}</span>
                        </div>
                        <h3 className="font-editorial text-base font-semibold text-[#1F2937] dark:text-[#F3F2EE] truncate">
                          {title}
                        </h3>
                        <p className="text-xs text-[#6B7280] dark:text-[#A1A19A]">
                          {daily} {daily === 1 ? "chapter" : "chapters"}/day ·{" "}
                          {done}/{seq.length} chapters ({pct}%)
                          {restLabels ? ` · Rest: ${restLabels}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={syncingCircleId === circle.id}
                          onClick={() => handleSyncCirclePlan(circle)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white text-xs font-medium transition-colors cursor-pointer"
                        >
                          {syncingCircleId === circle.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          <span>Use Plan</span>
                        </button>
                        <Link
                          href={`/circles/${circle.id}`}
                          className="px-3 py-1.5 rounded-lg border border-[#E6E1D6] dark:border-[#2C2C28] text-xs font-medium text-[#6B7280] dark:text-[#A1A19A] hover:text-[#1F2937] dark:hover:text-[#F3F2EE] transition-colors"
                        >
                          Open
                        </Link>
                      </div>
                    </div>

                    <div className="h-1.5 w-full rounded-full bg-[#F4F1EA] dark:bg-[#262623] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#4A6B5D] dark:bg-[#63826A] transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <NewPlanFlow
        open={newPlanOpen}
        mode="personal"
        saving={saving}
        initialPresetId={planId}
        onClose={() => setNewPlanOpen(false)}
        onComplete={handleNewPlanComplete}
      />
    </div>
  );
}
