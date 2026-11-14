"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookMarked,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import VerseNotesDrawer, {
  type EnrichedVerseNote,
} from "@/components/reader/VerseNotesDrawer";
import { fetchChapterWEB, type BibleVerse } from "@/lib/bible/bible-api";
import { BIBLE_BOOKS } from "@/lib/plans/reading-plans";
import { createClient } from "@/lib/supabase/client";

interface CircleSummary {
  id: string;
  name: string;
}

function ReaderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialBook = searchParams.get("book") || "John";
  const initialChapter = Number(searchParams.get("chapter")) || 1;

  const [book, setBook] = useState(
    BIBLE_BOOKS.some((b) => b.name === initialBook) ? initialBook : "John"
  );
  const [chapter, setChapter] = useState(initialChapter);
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [loadingText, setLoadingText] = useState(true);
  const [textError, setTextError] = useState<string | null>(null);

  // User, Circles & Notes
  const [userId, setUserId] = useState<string | null>(null);
  const [circles, setCircles] = useState<CircleSummary[]>([]);
  const [activeCircleId, setActiveCircleId] = useState<string | null>(null);
  const [notes, setNotes] = useState<EnrichedVerseNote[]>([]);

  // Completion status
  const [completionState, setCompletionState] = useState<{
    completed: boolean;
    physical: boolean;
  }>({ completed: false, physical: false });
  const [savingCompletion, setSavingCompletion] = useState(false);

  // Selected verse for Drawer
  const [selectedVerse, setSelectedVerse] = useState<BibleVerse | null>(null);

  // Sync URL query params if changed externally
  useEffect(() => {
    const qBook = searchParams.get("book");
    const qChapter = Number(searchParams.get("chapter"));
    if (qBook && BIBLE_BOOKS.some((b) => b.name === qBook)) {
      setBook(qBook);
    }
    if (qChapter && qChapter > 0) {
      setChapter(qChapter);
    }
  }, [searchParams]);

  // Load Bible chapter text from bible-api.com (WEB translation)
  useEffect(() => {
    let cancelled = false;
    setLoadingText(true);
    setTextError(null);

    fetchChapterWEB(book, chapter)
      .then((res) => {
        if (!cancelled) {
          setVerses(res.verses);
          setLoadingText(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTextError(
            err instanceof Error ? err.message : "Failed to load chapter text."
          );
          setLoadingText(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [book, chapter]);

  // Load user & circles
  useEffect(() => {
    async function initUserAndCircles() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: memberships } = await supabase
        .from("circle_members")
        .select("circle_id")
        .eq("user_id", user.id);

      const ids = (memberships || []).map((m) => m.circle_id);
      if (ids.length > 0) {
        const { data: circleRows } = await supabase
          .from("circles")
          .select("id, name")
          .in("id", ids);
        const list = circleRows || [];
        setCircles(list);
        const saved =
          typeof window !== "undefined"
            ? localStorage.getItem("active_circle_id")
            : null;
        const chosen = list.find((c) => c.id === saved) || list[0] || null;
        if (chosen) setActiveCircleId(chosen.id);
      }
    }
    initUserAndCircles();
  }, []);

  // Load chapter completion state + circle verse notes
  const loadChapterMetadata = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();

    const { data: prog } = await supabase
      .from("reading_progress")
      .select("read_in_physical_bible")
      .eq("user_id", userId)
      .eq("book", book)
      .eq("chapter", chapter)
      .maybeSingle();

    setCompletionState({
      completed: Boolean(prog),
      physical: Boolean(prog?.read_in_physical_bible),
    });

    if (!activeCircleId) {
      setNotes([]);
      return;
    }

    const { data: rawNotes } = await supabase
      .from("verse_notes")
      .select(
        "id, circle_id, user_id, book, chapter, verse_start, verse_end, content, created_at"
      )
      .eq("circle_id", activeCircleId)
      .eq("book", book)
      .eq("chapter", chapter)
      .order("created_at", { ascending: true });

    if (!rawNotes || rawNotes.length === 0) {
      setNotes([]);
      return;
    }

    const authorIds = Array.from(new Set(rawNotes.map((n) => n.user_id)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", authorIds);

    const nameMap = new Map(
      (profiles || []).map((p) => [p.id, p.display_name])
    );

    setNotes(
      rawNotes.map((n) => ({
        ...n,
        author_name: nameMap.get(n.user_id) || "Fellow Reader",
      }))
    );
  }, [userId, activeCircleId, book, chapter]);

  useEffect(() => {
    loadChapterMetadata();
  }, [loadChapterMetadata]);

  function navigateTo(nextBook: string, nextChapter: number) {
    setBook(nextBook);
    setChapter(nextChapter);
    setSelectedVerse(null);
    router.replace(
      `/reader?book=${encodeURIComponent(nextBook)}&chapter=${nextChapter}`,
      { scroll: false }
    );
  }

  async function handleComplete(physicalBible: boolean) {
    if (!userId) {
      router.push("/login");
      return;
    }
    setSavingCompletion(true);
    const supabase = createClient();

    try {
      if (
        completionState.completed &&
        completionState.physical === physicalBible
      ) {
        await supabase
          .from("reading_progress")
          .delete()
          .eq("user_id", userId)
          .eq("book", book)
          .eq("chapter", chapter);
        setCompletionState({ completed: false, physical: false });
      } else {
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
        setCompletionState({ completed: true, physical: physicalBible });
      }
    } finally {
      setSavingCompletion(false);
    }
  }

  const currentBookMeta =
    BIBLE_BOOKS.find((b) => b.name === book) || BIBLE_BOOKS[0];
  const bookIndex = BIBLE_BOOKS.findIndex((b) => b.name === book);

  function goPrevChapter() {
    if (chapter > 1) {
      navigateTo(book, chapter - 1);
    } else if (bookIndex > 0) {
      const prevBook = BIBLE_BOOKS[bookIndex - 1];
      navigateTo(prevBook.name, prevBook.chapters);
    }
  }

  function goNextChapter() {
    if (chapter < currentBookMeta.chapters) {
      navigateTo(book, chapter + 1);
    } else if (bookIndex < BIBLE_BOOKS.length - 1) {
      const nextBook = BIBLE_BOOKS[bookIndex + 1];
      navigateTo(nextBook.name, 1);
    }
  }

  const activeCircleName =
    circles.find((c) => c.id === activeCircleId)?.name || null;

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 space-y-6">
      {/* Top Reader Controls */}
      <div className="bg-white border border-[#E5E0D8] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <select
            value={book}
            onChange={(e) => navigateTo(e.target.value, 1)}
            className="px-3 py-1.5 rounded-lg border border-[#E5E0D8] bg-[#FAF9F6] text-xs font-medium text-[#1F2937]"
          >
            {BIBLE_BOOKS.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            value={chapter}
            onChange={(e) => navigateTo(book, Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg border border-[#E5E0D8] bg-[#FAF9F6] text-xs font-medium text-[#1F2937]"
          >
            {Array.from(
              { length: currentBookMeta.chapters },
              (_, i) => i + 1
            ).map((ch) => (
              <option key={ch} value={ch}>
                Chapter {ch}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {circles.length > 1 && (
            <select
              value={activeCircleId || ""}
              onChange={(e) => {
                setActiveCircleId(e.target.value);
                if (typeof window !== "undefined") {
                  localStorage.setItem("active_circle_id", e.target.value);
                }
              }}
              className="px-2.5 py-1.5 rounded-lg border border-[#E5E0D8] bg-[#FAF9F6] text-xs text-[#596579]"
            >
              {circles.map((c) => (
                <option key={c.id} value={c.id}>
                  Circle: {c.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={goPrevChapter}
            title="Previous Chapter"
            className="p-1.5 rounded-lg border border-[#E5E0D8] bg-[#FAF9F6] hover:bg-[#F3EFEA] text-[#1F2937] cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goNextChapter}
            title="Next Chapter"
            className="p-1.5 rounded-lg border border-[#E5E0D8] bg-[#FAF9F6] hover:bg-[#F3EFEA] text-[#1F2937] cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chapter Title Banner */}
      <div className="text-center space-y-1 pt-2">
        <p className="text-[11px] uppercase tracking-widest text-[#4B6F5B] font-semibold">
          World English Bible (Public Domain)
        </p>
        <h1 className="text-3xl font-serif font-semibold text-[#1F2937]">
          {book} {chapter}
        </h1>
        <p className="text-xs text-[#596579]">
          Tap any verse to read or share Circle notes anchored to that verse.
        </p>
      </div>

      {/* Single-Column Scripture Reader */}
      <article className="bg-white border border-[#E5E0D8] rounded-2xl p-6 sm:p-10 shadow-2xs">
        {loadingText ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-sm text-[#596579]">
            <Loader2 className="w-5 h-5 animate-spin text-[#4B6F5B]" />
            <span>Loading {book} {chapter}...</span>
          </div>
        ) : textError ? (
          <div className="p-6 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 text-center">
            {textError}
          </div>
        ) : (
          <div className="space-y-3 font-serif text-lg leading-relaxed text-[#1F2937]">
            {verses.map((v) => {
              const verseNotes = notes.filter(
                (n) => n.verse_start <= v.verse && n.verse_end >= v.verse
              );
              const hasNotes = verseNotes.length > 0;

              return (
                <div
                  key={v.verse}
                  onClick={() => setSelectedVerse(v)}
                  className={`group rounded-xl px-3 py-2 -mx-3 transition-colors cursor-pointer ${
                    hasNotes
                      ? "bg-[#F4F7F5] hover:bg-[#E3EBE6]/70 border-l-2 border-[#4B6F5B]"
                      : "hover:bg-[#FAF9F6]"
                  }`}
                >
                  <sup className="text-xs font-sans font-semibold text-[#4B6F5B] mr-2 select-none">
                    {v.verse}
                  </sup>
                  <span>{v.text}</span>
                  {hasNotes && (
                    <span className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-[#E3EBE6] text-[#3D5A4A] font-sans text-[11px] font-medium align-middle">
                      <MessageSquare className="w-3 h-3" />
                      {verseNotes.length}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </article>

      {/* Bottom Completion & Chapter Navigation */}
      <div className="bg-white border border-[#E5E0D8] rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={savingCompletion}
            onClick={() => handleComplete(false)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              completionState.completed && !completionState.physical
                ? "bg-[#4B6F5B] text-white"
                : "bg-[#FAF9F6] border border-[#E5E0D8] text-[#1F2937] hover:bg-[#F3EFEA]"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {completionState.completed && !completionState.physical
                ? "✓ Completed in App"
                : "Mark Read in App"}
            </span>
          </button>

          <button
            type="button"
            disabled={savingCompletion}
            onClick={() => handleComplete(true)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              completionState.completed && completionState.physical
                ? "bg-[#E3EBE6] border-[#4B6F5B] text-[#3D5A4A]"
                : "bg-[#FAF9F6] border-[#E5E0D8] text-[#1F2937] hover:bg-[#F3EFEA]"
            }`}
          >
            <BookMarked className="w-4 h-4 text-[#4B6F5B]" />
            <span>
              {completionState.completed && completionState.physical
                ? "✓ Checked Off (Physical Bible)"
                : "Checked Off (Physical Bible)"}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrevChapter}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#E5E0D8] text-xs font-medium text-[#596579] hover:text-[#1F2937] cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>
          <button
            type="button"
            onClick={goNextChapter}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-[#1F2937] text-white text-xs font-medium hover:bg-[#374151] cursor-pointer"
          >
            <span>Next Chapter</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Verse-Anchored Notes Drawer */}
      {selectedVerse && (
        <VerseNotesDrawer
          book={book}
          chapter={chapter}
          verse={selectedVerse.verse}
          maxVerse={verses.length}
          verseText={selectedVerse.text}
          circleId={activeCircleId}
          circleName={activeCircleName}
          currentUserId={userId}
          notes={notes}
          onClose={() => setSelectedVerse(null)}
          onNoteChanged={loadChapterMetadata}
        />
      )}
    </main>
  );
}

export default function ReaderPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-20 sm:pb-12">
      <Navbar />
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-sm text-[#596579]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Opening Bible Reader...
          </div>
        }
      >
        <ReaderContent />
      </Suspense>
    </div>
  );
}
