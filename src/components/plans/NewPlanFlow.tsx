"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Loader2, Sparkles, X } from "lucide-react";
import {
  BIBLE_BOOKS,
  READING_PLAN_PRESETS,
  WEEKDAYS,
  type ReadingPlanPreset,
} from "@/lib/plans/reading-plans";

export interface NewPlanResult {
  kind: "preset" | "custom";
  presetId?: "nt-90" | "gospels-psalms";
  title: string;
  books: string[];
  chaptersPerDay: 1 | 2 | 3;
  restDays: number[];
}

interface NewPlanFlowProps {
  open: boolean;
  mode: "personal" | "circle";
  saving?: boolean;
  initialPresetId?: "nt-90" | "gospels-psalms";
  onClose: () => void;
  onComplete: (result: NewPlanResult) => Promise<void> | void;
}

export default function NewPlanFlow({
  open,
  mode,
  saving = false,
  initialPresetId = "nt-90",
  onClose,
  onComplete,
}: NewPlanFlowProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [tab, setTab] = useState<"presets" | "custom">("presets");
  const [selectedPresetId, setSelectedPresetId] = useState<
    "nt-90" | "gospels-psalms"
  >(initialPresetId);
  const [expandedPresetIds, setExpandedPresetIds] = useState<Set<string>>(
    () => new Set()
  );

  function togglePresetDescription(presetId: string) {
    setExpandedPresetIds((prev) => {
      const next = new Set(prev);
      if (next.has(presetId)) {
        next.delete(presetId);
      } else {
        next.add(presetId);
      }
      return next;
    });
  }

  const [customTitle, setCustomTitle] = useState("");
  const [testamentFilter, setTestamentFilter] = useState<"NT" | "OT">("NT");
  const [selectedBooks, setSelectedBooks] = useState<string[]>(["John"]);

  const [chaptersPerDay, setChaptersPerDay] = useState<1 | 2 | 3>(1);
  const [restDays, setRestDays] = useState<number[]>([]);

  const selectedPreset: ReadingPlanPreset = useMemo(
    () =>
      READING_PLAN_PRESETS.find((p) => p.id === selectedPresetId) ||
      READING_PLAN_PRESETS[0],
    [selectedPresetId]
  );

  const totalCustomChapters = useMemo(() => {
    return selectedBooks.reduce((sum, name) => {
      const found = BIBLE_BOOKS.find((b) => b.name === name);
      return sum + (found ? found.chapters : 0);
    }, 0);
  }, [selectedBooks]);

  const filteredBooks = useMemo(
    () => BIBLE_BOOKS.filter((b) => b.testament === testamentFilter),
    [testamentFilter]
  );

  if (!open) return null;

  function toggleBook(bookName: string) {
    setSelectedBooks((prev) =>
      prev.includes(bookName)
        ? prev.filter((b) => b !== bookName)
        : [...prev, bookName]
    );
  }

  function toggleRestDay(day: number) {
    setRestDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function handlePresetSelect(preset: ReadingPlanPreset) {
    setSelectedPresetId(preset.id);
    setChaptersPerDay(
      preset.dailyTargetCount === 3
        ? 3
        : preset.dailyTargetCount === 2
          ? 2
          : 1
    );
  }

  function resolvedCustomTitle(): string {
    if (customTitle.trim()) return customTitle.trim();
    if (selectedBooks.length === 1) return selectedBooks[0];
    if (selectedBooks.length <= 3) return selectedBooks.join(", ");
    return `${selectedBooks[0]} + ${selectedBooks.length - 1} more`;
  }

  const totalChapters =
    tab === "presets" ? selectedPreset.sequence.length : totalCustomChapters;
  const presetChaptersPerDay: 1 | 2 | 3 =
    selectedPreset.dailyTargetCount === 3
      ? 3
      : selectedPreset.dailyTargetCount === 2
        ? 2
        : 1;
  const effectiveChaptersPerDay =
    tab === "presets" ? presetChaptersPerDay : chaptersPerDay;
  const estDays = Math.max(1, Math.ceil(totalChapters / effectiveChaptersPerDay));
  const canProceedStep1 =
    tab === "presets" || (tab === "custom" && selectedBooks.length > 0);

  async function handleSubmit() {
    if (saving) return;
    if (tab === "presets") {
      await onComplete({
        kind: "preset",
        presetId: selectedPreset.id,
        title: selectedPreset.title,
        books: [],
        chaptersPerDay: presetChaptersPerDay,
        restDays: [],
      });
    } else {
      await onComplete({
        kind: "custom",
        title: resolvedCustomTitle(),
        books: selectedBooks,
        chaptersPerDay,
        restDays,
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "circle" ? "Set Circle Reading Plan" : "New Reading Plan"}
    >
      <div className="w-full sm:max-w-lg max-h-[90vh] flex flex-col bg-[#FAF9F6] dark:bg-[#141413] border border-[#E6E1D6] dark:border-[#2C2C28] rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E6E1D6] dark:border-[#2C2C28] bg-white dark:bg-[#1C1C1A]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A6B5D] dark:text-[#7C9A82]">
              {tab === "presets"
                ? `Step 1 of 1 · ${mode === "circle" ? "Circle Plan" : "Personal Plan"}`
                : `Step ${step} of 2 · ${mode === "circle" ? "Circle Plan" : "Personal Plan"}`}
            </p>
            <h2 className="font-editorial text-lg font-semibold text-[#1F2937] dark:text-[#F3F2EE]">
              {step === 1
                ? "Choose a reading plan"
                : tab === "presets"
                  ? "Preset pace & Sabbath rest"
                  : "Daily pace & Sabbath rest"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg text-[#6B7280] hover:text-[#1F2937] dark:text-[#A1A19A] dark:hover:text-[#F3F2EE] hover:bg-[#F4F1EA] dark:hover:bg-[#242422] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === 1 ? (
            <>
              {/* Presets | Custom toggle */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F4F1EA] dark:bg-[#1C1C1A] border border-[#E6E1D6] dark:border-[#2C2C28]">
                <button
                  type="button"
                  onClick={() => setTab("presets")}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    tab === "presets"
                      ? "bg-white dark:bg-[#262623] text-[#1F2937] dark:text-[#F3F2EE] shadow-xs"
                      : "text-[#6B7280] dark:text-[#A1A19A] hover:text-[#1F2937] dark:hover:text-[#F3F2EE]"
                  }`}
                >
                  Presets
                </button>
                <button
                  type="button"
                  onClick={() => setTab("custom")}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    tab === "custom"
                      ? "bg-white dark:bg-[#262623] text-[#1F2937] dark:text-[#F3F2EE] shadow-xs"
                      : "text-[#6B7280] dark:text-[#A1A19A] hover:text-[#1F2937] dark:hover:text-[#F3F2EE]"
                  }`}
                >
                  Custom
                </button>
              </div>

              {tab === "presets" ? (
                <div className="space-y-2.5">
                  {READING_PLAN_PRESETS.map((preset) => {
                    const isSelected = selectedPresetId === preset.id;
                    const isExpanded = expandedPresetIds.has(preset.id);
                    return (
                      <div
                        key={preset.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handlePresetSelect(preset)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handlePresetSelect(preset);
                          }
                        }}
                        className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-[#EBF1EE]/70 dark:bg-[#202923] border-[#4A6B5D] dark:border-[#63826A]"
                            : "bg-white dark:bg-[#1C1C1A] border-[#E6E1D6] dark:border-[#2C2C28] hover:border-[#4A6B5D]/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0 flex-1">
                            <h3 className="font-editorial text-base font-semibold text-[#1F2937] dark:text-[#F3F2EE]">
                              {preset.title}
                            </h3>
                            <p className="text-xs font-medium text-[#4A6B5D] dark:text-[#7C9A82]">
                              {preset.subtitle}
                            </p>
                          </div>
                          <span
                            className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                              isSelected
                                ? "bg-[#4A6B5D] dark:bg-[#63826A] border-[#4A6B5D] dark:border-[#63826A] text-white"
                                : "border-[#D6D0C4] dark:border-[#3A3A35]"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </span>
                        </div>

                        <div className="mt-2 pt-2 border-t border-[#E6E1D6]/60 dark:border-[#2C2C28]">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePresetDescription(preset.id);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#6B7280] dark:text-[#A1A19A] hover:text-[#1F2937] dark:hover:text-[#F3F2EE] transition-colors cursor-pointer"
                          >
                            <span>{isExpanded ? "Hide description" : "View description"}</span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                            />
                          </button>

                          {isExpanded && (
                            <p className="text-xs text-[#6B7280] dark:text-[#A1A19A] leading-relaxed pt-1.5">
                              {preset.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Optional title */}
                  <div>
                    <label
                      htmlFor="custom-plan-title"
                      className="block text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#A1A19A] mb-1.5"
                    >
                      Plan Name (Optional)
                    </label>
                    <input
                      id="custom-plan-title"
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="e.g. Epistles & Psalms"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E1D6] dark:border-[#2C2C28] bg-white dark:bg-[#1C1C1A] text-sm text-[#1F2937] dark:text-[#F3F2EE] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#4A6B5D]"
                    />
                  </div>

                  {/* Book chips */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex rounded-lg bg-[#F4F1EA] dark:bg-[#1C1C1A] border border-[#E6E1D6] dark:border-[#2C2C28] p-0.5">
                        {(["NT", "OT"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTestamentFilter(t)}
                            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                              testamentFilter === t
                                ? "bg-white dark:bg-[#262623] text-[#1F2937] dark:text-[#F3F2EE] shadow-xs"
                                : "text-[#6B7280] dark:text-[#A1A19A]"
                            }`}
                          >
                            {t === "NT" ? "New Testament" : "Old Testament"}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            const visibleNames = filteredBooks.map((b) => b.name);
                            const allSelected = visibleNames.every((n) =>
                              selectedBooks.includes(n)
                            );
                            if (allSelected) {
                              setSelectedBooks((prev) =>
                                prev.filter((n) => !visibleNames.includes(n))
                              );
                            } else {
                              setSelectedBooks((prev) =>
                                Array.from(new Set([...prev, ...visibleNames]))
                              );
                            }
                          }}
                          className="text-xs font-medium text-[#4A6B5D] dark:text-[#7C9A82] hover:underline cursor-pointer"
                        >
                          {filteredBooks.every((b) =>
                            selectedBooks.includes(b.name)
                          )
                            ? `Deselect ${testamentFilter}`
                            : `Select all ${testamentFilter}`}
                        </button>
                        {selectedBooks.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedBooks([])}
                            className="text-xs font-medium text-[#6B7280] dark:text-[#A1A19A] hover:text-[#1F2937] dark:hover:text-[#F3F2EE] cursor-pointer"
                          >
                            Clear ({selectedBooks.length})
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-60 overflow-y-auto pr-1">
                      {filteredBooks.map((book) => {
                        const active = selectedBooks.includes(book.name);
                        return (
                          <button
                            key={book.name}
                            type="button"
                            onClick={() => toggleBook(book.name)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer flex items-center justify-between gap-1.5 min-w-0 ${
                              active
                                ? "bg-[#4A6B5D] dark:bg-[#63826A] text-white border-[#4A6B5D] dark:border-[#63826A]"
                                : "bg-white dark:bg-[#1C1C1A] text-[#1F2937] dark:text-[#F3F2EE] border-[#E6E1D6] dark:border-[#2C2C28] hover:border-[#4A6B5D]/60"
                            }`}
                          >
                            <span className="truncate">{book.name}</span>
                            <span
                              className={`text-[10px] shrink-0 ${
                                active
                                  ? "text-white/80"
                                  : "text-[#6B7280] dark:text-[#A1A19A]"
                              }`}
                            >
                              {book.chapters}ch
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-xs text-[#6B7280] dark:text-[#A1A19A]">
                      {selectedBooks.length === 0
                        ? "Select at least one book to continue."
                        : `${selectedBooks.length} ${
                            selectedBooks.length === 1 ? "book" : "books"
                          } selected · ${totalCustomChapters} chapters`}
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-5">
              {/* Plan summary pill */}
              <div className="p-3.5 rounded-xl bg-white dark:bg-[#1C1C1A] border border-[#E6E1D6] dark:border-[#2C2C28] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#A1A19A]">
                    Selected Plan
                  </p>
                  <p className="font-editorial text-sm font-semibold text-[#1F2937] dark:text-[#F3F2EE] truncate">
                    {tab === "presets"
                      ? selectedPreset.title
                      : resolvedCustomTitle()}
                  </p>
                </div>
                <span className="text-xs font-medium text-[#4A6B5D] dark:text-[#7C9A82] shrink-0">
                  {totalChapters} ch.
                </span>
              </div>

              {/* Chapters per day: locked for fixed presets, selectable for custom */}
              {tab === "presets" ? (
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#A1A19A]">
                    Built-in preset pace
                  </span>
                  <div className="p-3.5 rounded-xl bg-[#F4F1EA] dark:bg-[#1C1C1A] border border-[#E6E1D6] dark:border-[#2C2C28] flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#1F2937] dark:text-[#F3F2EE]">
                      {presetChaptersPerDay}{" "}
                      {presetChaptersPerDay === 1 ? "chapter" : "chapters"} per day
                    </span>
                    <span className="text-xs text-[#6B7280] dark:text-[#A1A19A]">
                      ~{estDays} reading {estDays === 1 ? "day" : "days"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#A1A19A]">
                    Chapters per day
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {([1, 2, 3] as const).map((count) => {
                      const active = chaptersPerDay === count;
                      return (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setChaptersPerDay(count)}
                          className={`py-2.5 px-3 rounded-xl border text-sm font-semibold transition-colors cursor-pointer ${
                            active
                              ? "bg-[#4A6B5D] dark:bg-[#63826A] text-white border-[#4A6B5D] dark:border-[#63826A]"
                              : "bg-white dark:bg-[#1C1C1A] text-[#1F2937] dark:text-[#F3F2EE] border-[#E6E1D6] dark:border-[#2C2C28] hover:border-[#4A6B5D]/60"
                          }`}
                        >
                          {count} {count === 1 ? "chapter" : "chapters"}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-[#6B7280] dark:text-[#A1A19A]">
                    Unhurried pace: ~{estDays} reading{" "}
                    {estDays === 1 ? "day" : "days"}
                  </p>
                </div>
              )}

              {/* Sabbath rest day pills */}
              <div className="space-y-2">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#A1A19A]">
                  Sabbath rest day (optional)
                </span>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((w) => {
                    const active = restDays.includes(w.day);
                    return (
                      <button
                        key={w.day}
                        type="button"
                        onClick={() => toggleRestDay(w.day)}
                        aria-pressed={active}
                        className={`py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                          active
                            ? "bg-[#4A6B5D] dark:bg-[#63826A] text-white border-[#4A6B5D] dark:border-[#63826A]"
                            : "bg-white dark:bg-[#1C1C1A] text-[#6B7280] dark:text-[#A1A19A] border-[#E6E1D6] dark:border-[#2C2C28] hover:border-[#4A6B5D]/60"
                        }`}
                      >
                        {w.short}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-[#6B7280] dark:text-[#A1A19A]">
                  Rest days pause daily portions so you can reflect without falling behind.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-[#E6E1D6] dark:border-[#2C2C28] bg-white dark:bg-[#1C1C1A]">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#6B7280] dark:text-[#A1A19A] hover:text-[#1F2937] dark:hover:text-[#F3F2EE] cursor-pointer"
              >
                Cancel
              </button>
              {tab === "presets" ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSubmit}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {mode === "circle" ? "Save Circle Plan" : "Start Plan"}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canProceedStep1}
                  onClick={() => setStep(2)}
                  className="px-5 py-2.5 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] disabled:opacity-40 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Next: Pace & Rest →
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-[#6B7280] dark:text-[#A1A19A] hover:text-[#1F2937] dark:hover:text-[#F3F2EE] cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSubmit}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>
                  {mode === "circle" ? "Save Circle Plan" : "Start Plan"}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
