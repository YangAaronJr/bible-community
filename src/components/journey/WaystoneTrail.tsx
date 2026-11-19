"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Compass } from "lucide-react";
import ChapterNotesInline, {
  type PrivateVerseNote,
} from "@/components/journey/ChapterNotesInline";
import {
  CANONICAL_MOVEMENTS,
  getMovementProgress,
  type CanonicalMovement,
} from "@/components/journey/movements";
import type { BibleBook } from "@/lib/plans/reading-plans";

interface WaystoneTrailProps {
  completedByBook: Map<string, Set<number>>;
  notesByBookChapter: Map<string, PrivateVerseNote[]>;
}

function getTouchDistance(touches: React.TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

export default function WaystoneTrail({
  completedByBook,
  notesByBookChapter,
}: WaystoneTrailProps) {
  const router = useRouter();
  const trailRef = useRef<HTMLDivElement | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const lastZoomAtRef = useRef<number>(0);

  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(
    null
  );
  const [selectedBookName, setSelectedBookName] = useState<string | null>(null);

  const activeMovement: CanonicalMovement | null = selectedMovementId
    ? CANONICAL_MOVEMENTS.find((m) => m.id === selectedMovementId) ?? null
    : null;

  const activeBook: BibleBook | null =
    activeMovement && selectedBookName
      ? activeMovement.books.find((b) => b.name === selectedBookName) ?? null
      : null;

  const zoomLevel = activeBook ? 3 : activeMovement ? 2 : 1;

  const scrollToTopSmooth = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const findCenteredNodeId = useCallback((): string | null => {
    const container = trailRef.current;
    if (!container) return null;
    const nodes = container.querySelectorAll<HTMLElement>("[data-waystone-id]");
    if (nodes.length === 0) return null;

    const viewportCenter = window.innerHeight / 2;
    let bestId: string | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      const nodeCenter = rect.top + rect.height / 2;
      const dist = Math.abs(nodeCenter - viewportCenter);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = node.dataset.waystoneId ?? null;
      }
    });

    return bestId;
  }, []);

  const handleZoomIn = useCallback(
    (targetId?: string | null) => {
      const id = targetId ?? findCenteredNodeId();
      if (!id) return;

      if (zoomLevel === 1) {
        if (CANONICAL_MOVEMENTS.some((m) => m.id === id)) {
          setSelectedMovementId(id);
          setSelectedBookName(null);
          scrollToTopSmooth();
        }
      } else if (zoomLevel === 2 && activeMovement) {
        if (activeMovement.books.some((b) => b.name === id)) {
          setSelectedBookName(id);
          scrollToTopSmooth();
        }
      }
    },
    [activeMovement, findCenteredNodeId, scrollToTopSmooth, zoomLevel]
  );

  const handleZoomOut = useCallback(() => {
    if (zoomLevel === 3) {
      setSelectedBookName(null);
      scrollToTopSmooth();
    } else if (zoomLevel === 2) {
      setSelectedMovementId(null);
      setSelectedBookName(null);
      scrollToTopSmooth();
    }
  }, [scrollToTopSmooth, zoomLevel]);

  // Ctrl/Cmd + wheel zoom on desktop (normal vertical scroll remains untouched)
  useEffect(() => {
    const el = trailRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const now = Date.now();
      if (now - lastZoomAtRef.current < 380) return;

      if (e.deltaY < -4) {
        lastZoomAtRef.current = now;
        handleZoomIn();
      } else if (e.deltaY > 4) {
        lastZoomAtRef.current = now;
        handleZoomOut();
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [handleZoomIn, handleZoomOut]);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      pinchStartDistRef.current = getTouchDistance(e.touches);
    }
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2 || pinchStartDistRef.current === null) return;

    const now = Date.now();
    if (now - lastZoomAtRef.current < 420) return;

    const currentDist = getTouchDistance(e.touches);
    const delta = currentDist - pinchStartDistRef.current;

    if (Math.abs(delta) >= 36) {
      lastZoomAtRef.current = now;
      pinchStartDistRef.current = null;
      if (delta > 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    }
  };

  const onTouchEnd = () => {
    pinchStartDistRef.current = null;
  };

  return (
    <div
      ref={trailRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="select-none"
    >
      {/* Clickable Breadcrumb Pills */}
      <nav
        aria-label="Waystone trail depth"
        className="flex items-center justify-between gap-2 mb-6 flex-wrap"
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setSelectedMovementId(null);
              setSelectedBookName(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
              zoomLevel === 1
                ? "bg-[#4A6B5D] text-white border-[#4A6B5D] dark:bg-[#7C9A82] dark:text-[#141413] dark:border-[#7C9A82]"
                : "bg-[#F4F1EA] text-[#1F2937] border-[#E6E1D6] hover:bg-[#EAE5DA] dark:bg-[#252522] dark:text-[#F3F2EE] dark:border-[#2E2E2B]"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            All
          </button>

          {activeMovement && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-[#6B7280] dark:text-[#A3A19A]" />
              <button
                type="button"
                onClick={() => setSelectedBookName(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                  zoomLevel === 2
                    ? "bg-[#4A6B5D] text-white border-[#4A6B5D] dark:bg-[#7C9A82] dark:text-[#141413] dark:border-[#7C9A82]"
                    : "bg-[#F4F1EA] text-[#1F2937] border-[#E6E1D6] hover:bg-[#EAE5DA] dark:bg-[#252522] dark:text-[#F3F2EE] dark:border-[#2E2E2B]"
                }`}
              >
                {activeMovement.name}
              </button>
            </>
          )}

          {activeBook && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-[#6B7280] dark:text-[#A3A19A]" />
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#4A6B5D] text-white border border-[#4A6B5D] dark:bg-[#7C9A82] dark:text-[#141413] dark:border-[#7C9A82]">
                {activeBook.name}
              </span>
            </>
          )}
        </div>

        <span className="text-[11px] text-[#6B7280] dark:text-[#A3A19A] hidden sm:inline">
          Tap a stone or Ctrl+Scroll to zoom
        </span>
      </nav>

      {/* Winding Vertical Sage Trail */}
      <div className="relative pl-7 sm:pl-9">
        {/* Continuous vertical sage path */}
        <div
          aria-hidden="true"
          className="absolute left-[11px] sm:left-[15px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-[#CFE0D6] via-[#4A6B5D]/45 to-[#CFE0D6] dark:from-[#324439] dark:via-[#7C9A82]/45 dark:to-[#324439]"
        />

        {/* LEVEL 1: Canonical Movements */}
        {zoomLevel === 1 && (
          <ol className="space-y-4">
            {CANONICAL_MOVEMENTS.map((movement, idx) => {
              const stats = getMovementProgress(movement, completedByBook);
              const hasProgress = stats.readChapters > 0;
              const isComplete =
                stats.totalChapters > 0 &&
                stats.readChapters >= stats.totalChapters;
              const windOffset = idx % 2 === 1 ? "ml-2 sm:ml-4" : "mr-2 sm:mr-4";

              return (
                <li
                  key={movement.id}
                  data-waystone-id={movement.id}
                  className="relative"
                >
                  {/* Waystone node marker */}
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[22px] sm:-left-[26px] top-5 w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                      isComplete
                        ? "bg-[#4A6B5D] border-[#4A6B5D] dark:bg-[#7C9A82] dark:border-[#7C9A82]"
                        : hasProgress
                        ? "bg-[#EBF1EE] border-[#4A6B5D] dark:bg-[#212B25] dark:border-[#7C9A82]"
                        : "bg-[#FAF9F6] border-[#CFE0D6] dark:bg-[#141413] dark:border-[#324439]"
                    }`}
                  />

                  <button
                    type="button"
                    onClick={() => handleZoomIn(movement.id)}
                    className={`w-full text-left rounded-2xl bg-white dark:bg-[#1E1E1C] border px-4 py-3.5 transition-all hover:border-[#4A6B5D]/60 dark:hover:border-[#7C9A82]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4A6B5D]/40 ${
                      hasProgress
                        ? "border-[#4A6B5D]/35 dark:border-[#7C9A82]/35"
                        : "border-[#E6E1D6] dark:border-[#2E2E2B]"
                    } ${windOffset}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-serif text-base font-medium text-[#1F2937] dark:text-[#F3F2EE]">
                          {movement.name}
                        </h2>
                        <p className="text-xs text-[#4A6B5D] dark:text-[#7C9A82] mt-0.5">
                          {movement.rangeLabel}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#6B7280] dark:text-[#A3A19A] mt-1 shrink-0" />
                    </div>

                    <p className="text-xs text-[#6B7280] dark:text-[#A3A19A] mt-1.5">
                      {movement.description}
                    </p>

                    {hasProgress && (
                      <div className="mt-3">
                        <div className="h-1 w-full rounded-full bg-[#F4F1EA] dark:bg-[#252522] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#4A6B5D] dark:bg-[#7C9A82] transition-all"
                            style={{ width: `${stats.pct}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-[#6B7280] dark:text-[#A3A19A] mt-1.5">
                          {stats.readChapters} of {stats.totalChapters} chapters
                          read
                        </p>
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {/* LEVEL 2: Books in Movement */}
        {zoomLevel === 2 && activeMovement && (
          <ol className="space-y-3">
            {activeMovement.books.map((book, idx) => {
              const readCount = completedByBook.get(book.name)?.size ?? 0;
              const isActive = readCount > 0 && readCount < book.chapters;
              const isComplete = readCount >= book.chapters;
              const hasProgress = readCount > 0;
              const pct = Math.min(
                100,
                Math.round((readCount / book.chapters) * 100)
              );
              const windOffset = idx % 2 === 1 ? "ml-2 sm:ml-4" : "mr-2 sm:mr-4";

              return (
                <li
                  key={book.name}
                  data-waystone-id={book.name}
                  className="relative"
                >
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[22px] sm:-left-[26px] top-4 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isComplete
                        ? "bg-[#4A6B5D] border-[#4A6B5D] text-white dark:bg-[#7C9A82] dark:border-[#7C9A82] dark:text-[#141413]"
                        : isActive
                        ? "bg-[#EBF1EE] border-[#4A6B5D] dark:bg-[#212B25] dark:border-[#7C9A82]"
                        : "bg-[#FAF9F6] border-[#CFE0D6] dark:bg-[#141413] dark:border-[#324439]"
                    }`}
                  >
                    {isComplete && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleZoomIn(book.name)}
                    className={`w-full text-left rounded-2xl bg-white dark:bg-[#1E1E1C] border px-4 py-3 transition-all hover:border-[#4A6B5D]/60 dark:hover:border-[#7C9A82]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4A6B5D]/40 ${
                      isActive || isComplete
                        ? "border-[#4A6B5D]/40 dark:border-[#7C9A82]/40"
                        : "border-[#E6E1D6] dark:border-[#2E2E2B]"
                    } ${windOffset}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="font-serif text-[15px] font-medium text-[#1F2937] dark:text-[#F3F2EE]">
                          {book.name}
                        </h3>
                        {hasProgress ? (
                          <p className="text-xs text-[#4A6B5D] dark:text-[#7C9A82] mt-0.5">
                            {isComplete
                              ? `All ${book.chapters} chapters read`
                              : `${readCount} of ${book.chapters} chapters`}
                          </p>
                        ) : (
                          <p className="text-xs text-[#6B7280] dark:text-[#A3A19A] mt-0.5">
                            {book.chapters}{" "}
                            {book.chapters === 1 ? "chapter" : "chapters"}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#6B7280] dark:text-[#A3A19A] shrink-0" />
                    </div>

                    {isActive && (
                      <div className="mt-2.5 h-1 w-full rounded-full bg-[#F4F1EA] dark:bg-[#252522] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#4A6B5D] dark:bg-[#7C9A82]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {/* LEVEL 3: Chapters & Private Notes */}
        {zoomLevel === 3 && activeBook && (
          <ol className="space-y-2.5">
            {Array.from({ length: activeBook.chapters }, (_, i) => i + 1).map(
              (chapter) => {
                const isRead =
                  completedByBook.get(activeBook.name)?.has(chapter) ?? false;
                const notes =
                  notesByBookChapter.get(`${activeBook.name}:${chapter}`) ?? [];
                const readerHref = `/reader?book=${encodeURIComponent(
                  activeBook.name
                )}&chapter=${chapter}`;

                return (
                  <li key={chapter} className="relative">
                    <span
                      aria-hidden="true"
                      className={`absolute -left-[22px] sm:-left-[26px] top-4 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isRead
                          ? "bg-[#4A6B5D] border-[#4A6B5D] text-white dark:bg-[#7C9A82] dark:border-[#7C9A82] dark:text-[#141413]"
                          : "bg-[#FAF9F6] border-[#CFE0D6] dark:bg-[#141413] dark:border-[#324439]"
                      }`}
                    >
                      {isRead && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </span>

                    <div
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(readerHref)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(readerHref);
                        }
                      }}
                      className={`cursor-pointer rounded-2xl bg-white dark:bg-[#1E1E1C] border px-4 py-3 transition-colors hover:border-[#4A6B5D]/60 dark:hover:border-[#7C9A82]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4A6B5D]/40 ${
                        isRead
                          ? "border-[#4A6B5D]/35 dark:border-[#7C9A82]/35"
                          : "border-[#E6E1D6] dark:border-[#2E2E2B]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-serif text-sm font-medium text-[#1F2937] dark:text-[#F3F2EE]">
                          {activeBook.name} {chapter}
                        </span>
                        <span className="text-[11px] text-[#4A6B5D] dark:text-[#7C9A82]">
                          Read →
                        </span>
                      </div>

                      <ChapterNotesInline notes={notes} />
                    </div>
                  </li>
                );
              }
            )}
          </ol>
        )}
      </div>
    </div>
  );
}
