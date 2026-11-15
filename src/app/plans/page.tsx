"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookMarked, BookOpen, Check, Loader2 } from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import { createClient } from "@/lib/supabase/client";
import {
  BIBLE_BOOKS,
  READING_PLAN_PRESETS,
  chapterKey,
} from "@/lib/plans/reading-plans";

export default function PlansPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState<"nt-90" | "gospels-psalms">("nt-90");
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());

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

    const { data: rows } = await supabase
      .from("reading_progress")
      .select("book, chapter")
      .eq("user_id", user.id);

    const set = new Set<string>();
    for (const r of rows || []) {
      set.add(chapterKey(r.book, r.chapter));
    }
    setCompletedKeys(set);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  function selectPlan(id: "nt-90" | "gospels-psalms") {
    setPlanId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("selected_reading_plan", id);
    }
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

  const selectedBookMeta =
    BIBLE_BOOKS.find((b) => b.name === manualBook) || BIBLE_BOOKS[0];
  const isManualDone = completedKeys.has(chapterKey(manualBook, manualChapter));

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-24">
      <Navbar />

      <main className="flex-1 max-w-xl w-full mx-auto px-5 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-editorial text-[28px] leading-none font-medium text-[#1F2937] tracking-tight">
              Reading Plans
            </h1>
            <p className="text-xs text-[#6B7280] mt-1">
              Grace-paced plans · Pick up right where you left off
            </p>
          </div>
          <Link
            href="/"
            className="px-3 py-1.5 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-medium text-[#1F2937]"
          >
            Done
          </Link>
        </div>

        {loading ? (
          <div className="p-8 bg-white border border-[#E6E1D6] rounded-2xl flex items-center justify-center text-xs text-[#6B7280]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading plans...
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {READING_PLAN_PRESETS.map((plan) => {
                const selected = plan.id === planId;
                const doneCount = plan.sequence.filter((c) =>
                  completedKeys.has(chapterKey(c.book, c.chapter))
                ).length;

                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => selectPlan(plan.id)}
                    className={`w-full text-left p-5 rounded-2xl border transition-all cursor-pointer ${
                      selected
                        ? "bg-white border-[#4A6B5D] ring-1 ring-[#4A6B5D] shadow-2xs"
                        : "bg-white border-[#E6E1D6] hover:bg-[#FCFBF8]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-editorial text-lg font-semibold text-[#1F2937]">
                        {plan.title}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          selected
                            ? "bg-[#4A6B5D] text-white"
                            : "bg-[#F4F1EA] text-[#6B7280]"
                        }`}
                      >
                        {selected ? "Active Plan" : "Select"}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-[#4A6B5D] mb-1.5">
                      {plan.subtitle} · {doneCount}/{plan.sequence.length}{" "}
                      chapters
                    </p>
                    <p className="text-xs text-[#6B7280] leading-relaxed">
                      {plan.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Manual Chapter Selector */}
            <section className="bg-white border border-[#E6E1D6] rounded-2xl p-5 space-y-3">
              <div>
                <h2 className="font-editorial text-base font-semibold text-[#1F2937]">
                  Jump to Any Book &amp; Chapter
                </h2>
                <p className="text-xs text-[#6B7280]">
                  Open in the Reader or check off from your physical Bible
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
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

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <Link
                  href={`/reader?book=${encodeURIComponent(
                    manualBook
                  )}&chapter=${manualChapter}`}
                  className="py-2.5 px-3 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Read in App</span>
                </Link>

                <button
                  type="button"
                  disabled={busy}
                  onClick={toggleManualChapter}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isManualDone
                      ? "bg-[#EBF1EE] border-[#4A6B5D] text-[#3D5A4E]"
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
