"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookMarked,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import { ThemeSettingsCluster } from "@/components/ui/QuietPageHeader";
import VerseNotesDrawer, {
  type EnrichedVerseNote,
} from "@/components/reader/VerseNotesDrawer";
import ReaderSelectorSheet, {
  type ReaderSelectorType,
} from "@/components/reader/ReaderSelectorSheet";
import {
  BIBLE_TRANSLATIONS,
  DEFAULT_TRANSLATION,
  TRANSLATION_STORAGE_KEY,
  fetchChapter,
  isValidTranslation,
  type BibleTranslationId,
  type BibleVerse,
} from "@/lib/bible/bible-api";
import { BIBLE_BOOKS } from "@/lib/plans/reading-plans";
import { usePinchFontSize } from "@/lib/hooks/usePinchFontSize";
import { createClient } from "@/lib/supabase/client";

interface CircleSummary {
  id: string;
  name: string;
}

function clampChapter(bookName: string, rawChapter: number): number {
  const meta = BIBLE_BOOKS.find((b) => b.name === bookName) || BIBLE_BOOKS[0];
  const parsed = Number.isFinite(rawChapter) ? Math.floor(rawChapter) : 1;
  return Math.max(1, Math.min(meta.chapters, parsed || 1));
}

type VerseSegment =
  | { kind: "single"; verse: BibleVerse }
  | {
      kind: "range";
      start: number;
      end: number;
      verses: BibleVerse[];
      rangeNotes: EnrichedVerseNote[];
    };

function buildVerseSegments(
  verses: BibleVerse[],
  notes: EnrichedVerseNote[]
): VerseSegment[] {
  const multiNotes = notes
    .filter((n) => n.verse_end > n.verse_start)
    .sort((a, b) => a.verse_start - b.verse_start || b.verse_end - a.verse_end);

  const mergedSpans: Array<{ start: number; end: number }> = [];
  for (const n of multiNotes) {
    const prev = mergedSpans[mergedSpans.length - 1];
    if (prev && n.verse_start <= prev.end) {
      prev.end = Math.max(prev.end, n.verse_end);
    } else {
      mergedSpans.push({ start: n.verse_start, end: n.verse_end });
    }
  }

  const segments: VerseSegment[] = [];
  let spanIdx = 0;
  let i = 0;

  while (i < verses.length) {
    const v = verses[i];
    while (spanIdx < mergedSpans.length && mergedSpans[spanIdx].end < v.verse) {
      spanIdx++;
    }
    const activeSpan = mergedSpans[spanIdx];
    if (activeSpan && v.verse >= activeSpan.start && v.verse <= activeSpan.end) {
      const spanVerses: BibleVerse[] = [];
      while (i < verses.length && verses[i].verse <= activeSpan.end) {
        spanVerses.push(verses[i]);
        i++;
      }
      const rangeNotes = multiNotes.filter(
        (n) => n.verse_start <= activeSpan.end && n.verse_end >= activeSpan.start
      );
      segments.push({
        kind: "range",
        start: activeSpan.start,
        end: activeSpan.end,
        verses: spanVerses,
        rangeNotes,
      });
    } else {
      segments.push({ kind: "single", verse: v });
      i++;
    }
  }

  return segments;
}

function ReaderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawBook = searchParams.get("book") || "John";
  const initialBook = BIBLE_BOOKS.some((b) => b.name === rawBook)
    ? rawBook
    : "John";
  const initialChapter = clampChapter(
    initialBook,
    Number(searchParams.get("chapter"))
  );

  const [book, setBook] = useState(initialBook);
  const [chapter, setChapter] = useState(initialChapter);
  const [translation, setTranslation] =
    useState<BibleTranslationId>(DEFAULT_TRANSLATION);
  const [translationReady, setTranslationReady] = useState(false);
  const [translationName, setTranslationName] = useState("Berean Standard Bible");
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [loadingText, setLoadingText] = useState(true);
  const [textError, setTextError] = useState<string | null>(null);

  // Restore saved translation preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TRANSLATION_STORAGE_KEY);
      if (isValidTranslation(saved)) {
        setTranslation(saved);
        const meta = BIBLE_TRANSLATIONS.find((t) => t.id === saved);
        if (meta) setTranslationName(meta.name);
      }
    } catch {
      // Ignore storage read errors
    } finally {
      setTranslationReady(true);
    }
  }, []);

  const handleTranslationChange = (next: BibleTranslationId) => {
    setTranslation(next);
    const meta = BIBLE_TRANSLATIONS.find((t) => t.id === next);
    if (meta) setTranslationName(meta.name);
    try {
      localStorage.setItem(TRANSLATION_STORAGE_KEY, next);
    } catch {
      // Ignore storage write errors
    }
  };

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

  // Selected verse for Drawer & active selector sheet
  const [selectedVerse, setSelectedVerse] = useState<BibleVerse | null>(null);
  const [openSelector, setOpenSelector] = useState<ReaderSelectorType | null>(
    null
  );
  const closeSelector = useCallback(() => setOpenSelector(null), []);
  const { containerRef: readerRef, scale: readerTextScale } =
    usePinchFontSize<HTMLElement>({
      storageKey: "bible-community-reader-text-scale",
    });

  // Sync URL query params if changed externally
  const bookRef = useRef(book);
  useEffect(() => {
    bookRef.current = book;
  }, [book]);

  useEffect(() => {
    const qBook = searchParams.get("book");
    const hasValidBook = Boolean(
      qBook && BIBLE_BOOKS.some((b) => b.name === qBook)
    );
    const resolvedBook = hasValidBook && qBook ? qBook : bookRef.current;
    if (hasValidBook && qBook) {
      setBook(qBook);
    }
    const rawChapterParam = searchParams.get("chapter");
    if (rawChapterParam !== null) {
      setChapter(clampChapter(resolvedBook, Number(rawChapterParam)));
    } else if (hasValidBook && qBook) {
      setChapter((prev) => clampChapter(qBook, prev));
    }
  }, [searchParams]);

  // Load Bible chapter text via helloao.org with bible-api.com fallback
  useEffect(() => {
    if (!translationReady) return;
    let cancelled = false;
    setLoadingText(true);
    setTextError(null);

    fetchChapter(book, chapter, translation)
      .then((res) => {
        if (!cancelled) {
          setVerses(res.verses);
          if (res.translation_name) {
            setTranslationName(res.translation_name);
          }
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
  }, [book, chapter, translation, translationReady]);

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

    const { data: rawNotes } = await supabase
      .from("verse_notes")
      .select(
        "id, circle_id, user_id, book, chapter, verse_start, verse_end, content, visibility, target_circle_ids, created_at"
      )
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
        visibility:
          n.visibility === "friends" || n.visibility === "circles"
            ? n.visibility
            : "private",
        target_circle_ids: Array.isArray(n.target_circle_ids)
          ? n.target_circle_ids
          : [],
        author_name: nameMap.get(n.user_id) || "Fellow Reader",
      }))
    );
  }, [userId, book, chapter]);

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

  return (
    <main className="flex-1 max-w-xl w-full mx-auto px-4 pt-3 pb-36 space-y-4">
      <div className="flex items-center justify-end">
        <ThemeSettingsCluster />
      </div>

      {/* Centered Compact Top Navigation Bar & Translation Selector */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="inline-flex items-center gap-1 bg-white border border-[#E6E1D6] rounded-full p-1.5 shadow-2xs">
          <button
            type="button"
            onClick={goPrevChapter}
            title="Previous Chapter"
            className="w-8 h-8 rounded-full bg-[#F4F1EA] hover:bg-[#EAE5DA] text-[#1F2937] flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setOpenSelector("book")}
            aria-label="Select Book"
            aria-haspopup="dialog"
            aria-expanded={openSelector === "book"}
            className="px-2.5 py-1.5 rounded-full hover:bg-[#F4F1EA] text-xs font-semibold text-[#1F2937] inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>{book}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          <span className="text-[#E6E1D6]">·</span>

          <button
            type="button"
            onClick={() => setOpenSelector("chapter")}
            aria-label="Select Chapter"
            aria-haspopup="dialog"
            aria-expanded={openSelector === "chapter"}
            className="px-2.5 py-1.5 rounded-full hover:bg-[#F4F1EA] text-xs font-semibold text-[#4A6B5D] inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>Ch. {chapter}</span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>

          <button
            type="button"
            onClick={goNextChapter}
            title="Next Chapter"
            className="w-8 h-8 rounded-full bg-[#F4F1EA] hover:bg-[#EAE5DA] text-[#1F2937] flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Centered Translation Selector Pill */}
        <button
          type="button"
          onClick={() => setOpenSelector("translation")}
          aria-label="Select Bible Translation"
          aria-haspopup="dialog"
          aria-expanded={openSelector === "translation"}
          className="inline-flex items-center gap-1.5 bg-white border border-[#E6E1D6] hover:bg-[#F4F1EA] rounded-full px-3.5 py-2 text-xs font-semibold text-[#4A6B5D] shadow-2xs transition-colors cursor-pointer"
        >
          <span>
            {BIBLE_TRANSLATIONS.find((t) => t.id === translation)?.shortLabel ||
              translation}
          </span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Chapter Title Banner */}
      <div className="text-center space-y-1">
        <h1 className="font-editorial text-3xl font-medium text-[#1F2937] tracking-tight">
          {book} {chapter}
        </h1>
        <p className="text-[11px] text-[#6B7280]">
          {translationName} · Tap any verse to reflect or share
        </p>
      </div>

      {/* Single-Column Scripture Reader */}
      <article
        ref={readerRef}
        className="bg-white border border-[#E6E1D6] rounded-2xl p-6 sm:p-8 shadow-2xs"
      >
        {loadingText ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-xs text-[#6B7280]">
            <Loader2 className="w-5 h-5 animate-spin text-[#4A6B5D]" />
            <span>
              Loading {book} {chapter}...
            </span>
          </div>
        ) : textError ? (
          <div className="p-6 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 text-center">
            {textError}
          </div>
        ) : (
          <div
            style={{
              fontSize: `${Math.round(17.5 * readerTextScale * 10) / 10}px`,
            }}
            className="space-y-3 font-editorial leading-relaxed text-[#1F2937]"
          >
            {buildVerseSegments(verses, notes).map((segment) => {
              if (segment.kind === "single") {
                const v = segment.verse;
                const verseNotes = notes.filter(
                  (n) => n.verse_start === v.verse && n.verse_end === v.verse
                );
                const hasNotes = verseNotes.length > 0;

                return (
                  <div
                    key={v.verse}
                    onClick={() => setSelectedVerse(v)}
                    className={`group rounded-xl px-3 py-1.5 -mx-3 transition-colors cursor-pointer ${
                      hasNotes
                        ? "bg-[#EBF1EE]/70 hover:bg-[#EBF1EE] border-l-2 border-[#4A6B5D]"
                        : "hover:bg-[#FAF9F6]"
                    }`}
                  >
                    <sup className="text-[11px] font-sans font-semibold text-[#4A6B5D] mr-2 select-none">
                      {v.verse}
                    </sup>
                    <span>{v.text}</span>
                    {hasNotes && (
                      <span className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-[#EBF1EE] text-[#4A6B5D] font-sans text-[10.5px] font-semibold align-middle">
                        <MessageSquare className="w-2.5 h-2.5" />
                        {verseNotes.length}
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={`range-${segment.start}-${segment.end}`}
                  className="rounded-xl px-3 py-1.5 -mx-3 bg-[#EBF1EE]/70 hover:bg-[#EBF1EE] border-l-2 border-[#4A6B5D] transition-colors space-y-2"
                >
                  {segment.verses.map((v, idx) => {
                    const singleNotes = notes.filter(
                      (n) => n.verse_start === v.verse && n.verse_end === v.verse
                    );
                    const isLastInRange = idx === segment.verses.length - 1;
                    return (
                      <div
                        key={v.verse}
                        onClick={() => setSelectedVerse(v)}
                        className="cursor-pointer"
                      >
                        <sup className="text-[11px] font-sans font-semibold text-[#4A6B5D] mr-2 select-none">
                          {v.verse}
                        </sup>
                        <span>{v.text}</span>
                        {singleNotes.length > 0 && (
                          <span className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-[#EBF1EE] text-[#4A6B5D] font-sans text-[10.5px] font-semibold align-middle">
                            <MessageSquare className="w-2.5 h-2.5" />
                            {singleNotes.length}
                          </span>
                        )}
                        {isLastInRange && segment.rangeNotes.length > 0 && (
                          <span className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-[#EBF1EE] text-[#4A6B5D] font-sans text-[10.5px] font-semibold align-middle">
                            <MessageSquare className="w-2.5 h-2.5" />
                            {segment.rangeNotes.length}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </article>

      {/* Centered Floating Bottom Bar (Mark Chapter Read / Physical Bible) */}
      <div className="fixed bottom-20 inset-x-0 z-20 px-4 flex justify-center pointer-events-none">
        <div className="pointer-events-auto inline-flex items-center gap-2 bg-[#FAF9F6]/95 backdrop-blur-md border border-[#E6E1D6] rounded-full p-1.5 shadow-lg">
          <button
            type="button"
            disabled={savingCompletion}
            onClick={() => handleComplete(false)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              completionState.completed && !completionState.physical
                ? "bg-[#4A6B5D] text-white"
                : "bg-white hover:bg-[#F4F1EA] text-[#1F2937]"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {completionState.completed && !completionState.physical
                ? "Chapter Read"
                : "Mark Chapter Read"}
            </span>
          </button>

          {/* <button
            type="button"
            disabled={savingCompletion}
            onClick={() => handleComplete(true)}
            title="Mark chapter as read using your physical Bible"
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              completionState.completed && completionState.physical
                ? "bg-[#B47B44] text-white"
                : "bg-[#FBF5EE] hover:bg-[#F6EAD9] text-[#B47B44]"
            }`}
          >
            <BookMarked className="w-3.5 h-3.5" />
            <span>
              {completionState.completed && completionState.physical
                ? "Read (Print)"
                : "Mark Read (Print)"}
            </span>
          </button> */}
        </div>
      </div>

      {/* Custom Dark-Mode Selector Drawer for Book / Chapter / Version */}
      <ReaderSelectorSheet
        openSelector={openSelector}
        book={book}
        chapter={chapter}
        totalChapters={currentBookMeta.chapters}
        translation={translation}
        onSelectBook={(nextBook) => navigateTo(nextBook, 1)}
        onSelectChapter={(nextChapter) => navigateTo(book, nextChapter)}
        onSelectTranslation={handleTranslationChange}
        onClose={closeSelector}
      />

      {/* Verse-Anchored Notes Drawer */}
      {selectedVerse && (
        <VerseNotesDrawer
          book={book}
          chapter={chapter}
          verse={selectedVerse.verse}
          maxVerse={verses[verses.length - 1]?.verse || selectedVerse.verse}
          verseText={selectedVerse.text}
          circles={circles}
          activeCircleId={activeCircleId}
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
      <Navbar variant="inner" />
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
