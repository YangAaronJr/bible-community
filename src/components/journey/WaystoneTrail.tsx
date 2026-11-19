"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Compass } from "lucide-react";
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

interface TrailPoint {
  id: string;
  label: string;
  sublabel?: string;
  state: "complete" | "active" | "untouched";
}

const SVG_WIDTH = 320;
const CENTER_X = 160;
const CURVE_OFFSET = 32;
const STEP_Y = 88;
const TOP_PAD = 32;
const BOTTOM_PAD = 36;

function getTouchDistance(touches: React.TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function getNodeCoords(index: number): { x: number; y: number } {
  const x = index % 2 === 0 ? CENTER_X - CURVE_OFFSET : CENTER_X + CURVE_OFFSET;
  const y = TOP_PAD + index * STEP_Y;
  return { x, y };
}

function SCurveTrail({
  points,
  onSelect,
}: {
  points: TrailPoint[];
  onSelect: (id: string) => void;
}) {
  const totalHeight =
    TOP_PAD + Math.max(0, points.length - 1) * STEP_Y + BOTTOM_PAD;

  return (
    <div
      className="relative mx-auto w-full max-w-[340px]"
      style={{ height: totalHeight }}
    >
      {/* Winding SVG path */}
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${totalHeight}`}
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      >
        {points.slice(0, -1).map((point, idx) => {
          const from = getNodeCoords(idx);
          const to = getNodeCoords(idx + 1);
          const midY1 = from.y + STEP_Y * 0.5;
          const midY2 = to.y - STEP_Y * 0.5;
          const d = `M ${from.x} ${from.y} C ${from.x} ${midY1}, ${to.x} ${midY2}, ${to.x} ${to.y}`;

          const next = points[idx + 1];
          const isTrodden =
            point.state !== "untouched" && next.state !== "untouched";
          const isLeadingToActive =
            point.state !== "untouched" && next.state === "active";

          return (
            <path
              key={`${point.id}-${next.id}`}
              d={d}
              fill="none"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={
                isTrodden || isLeadingToActive ? undefined : "5 7"
              }
              className={
                isTrodden || isLeadingToActive
                  ? "stroke-[#8FA89B] dark:stroke-[#63826A]"
                  : "stroke-[#D8D2C5] dark:stroke-[#3A3935]"
              }
            />
          );
        })}
      </svg>

      {/* Waystone nodes + minimal labels */}
      {points.map((point, idx) => {
        const { x, y } = getNodeCoords(idx);
        const leftPct = (x / SVG_WIDTH) * 100;
        const labelOnRight = idx % 2 === 0;

        return (
          <div
            key={point.id}
            data-waystone-id={point.id}
            style={{ top: y, left: `${leftPct}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
          >
            <button
              type="button"
              onClick={() => onSelect(point.id)}
              className="group relative flex items-center justify-center focus:outline-none"
              aria-label={
                point.sublabel
                  ? `${point.label} — ${point.sublabel}`
                  : point.label
              }
            >
              {/* Soft sage halo for active node */}
              {point.state === "active" && (
                <span
                  aria-hidden="true"
                  className="absolute w-11 h-11 rounded-full bg-[#4A6B5D]/20 dark:bg-[#7C9A82]/25 blur-[2px] transition-transform group-hover:scale-110"
                />
              )}

              {/* Stone circle */}
              <span
                className={`relative z-10 w-7 h-7 rounded-full transition-transform group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-[#4A6B5D]/50 ${
                  point.state === "complete"
                    ? "bg-[#6C8879] dark:bg-[#7C9A82] border-2 border-[#6C8879] dark:border-[#7C9A82]"
                    : point.state === "active"
                    ? "bg-[#6C8879] dark:bg-[#7C9A82] ring-4 ring-[#EBF1EE] dark:ring-[#212B25]"
                    : "bg-[#EDE8DF] dark:bg-[#252522] border-2 border-[#C8BFB0] dark:border-[#4A4842]"
                }`}
              />

              {/* Minimalist label */}
              <span
                className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-serif text-[16px] leading-tight transition-colors ${
                  labelOnRight
                    ? "left-10 text-left"
                    : "right-10 text-right"
                } ${
                  point.state === "untouched"
                    ? "text-[#9A9284] dark:text-[#6E6B63] group-hover:text-[#6B7280] dark:group-hover:text-[#A3A19A]"
                    : "text-[#1F2937] dark:text-[#F3F2EE] group-hover:text-[#4A6B5D] dark:group-hover:text-[#7C9A82]"
                }`}
              >
                {point.label}
                {point.sublabel && (
                  <span className="font-sans text-[13px] text-[#6B7280] dark:text-[#A3A19A] ml-1.5">
                    — {point.sublabel}
                  </span>
                )}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
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

  // Build Level 1 movement points
  const movementPoints: TrailPoint[] = CANONICAL_MOVEMENTS.map((movement) => {
    const stats = getMovementProgress(movement, completedByBook);
    const isComplete =
      stats.totalChapters > 0 && stats.readChapters >= stats.totalChapters;
    const isActive = stats.readChapters > 0 && !isComplete;

    let sublabel: string | undefined;
    if (isActive) {
      const latestBook = [...movement.books]
        .reverse()
        .find((b) => (completedByBook.get(b.name)?.size ?? 0) > 0);
      if (latestBook) {
        const chapters = Array.from(
          completedByBook.get(latestBook.name) ?? []
        );
        const maxCh = chapters.length > 0 ? Math.max(...chapters) : 1;
        sublabel = `${latestBook.name} ${maxCh}`;
      }
    }

    return {
      id: movement.id,
      label: movement.name === "Wisdom & Poetry" ? "Wisdom" : movement.name,
      sublabel,
      state: isComplete ? "complete" : isActive ? "active" : "untouched",
    };
  });

  // Build Level 2 book points
  const bookPoints: TrailPoint[] = activeMovement
    ? activeMovement.books.map((book) => {
        const readSet = completedByBook.get(book.name);
        const readCount = readSet?.size ?? 0;
        const isComplete = readCount >= book.chapters;
        const isActive = readCount > 0 && !isComplete;

        return {
          id: book.name,
          label: book.name,
          sublabel: isActive ? `ch. ${Math.max(...Array.from(readSet!))}` : undefined,
          state: isComplete ? "complete" : isActive ? "active" : "untouched",
        };
      })
    : [];

  return (
    <div
      ref={trailRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="select-none"
    >
      {/* Centered Breadcrumb Pills */}
      <nav
        aria-label="Waystone trail depth"
        className="flex items-center justify-center gap-1.5 flex-wrap mb-4"
      >
        <button
          type="button"
          onClick={() => {
            setSelectedMovementId(null);
            setSelectedBookName(null);
          }}
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
            zoomLevel === 1
              ? "bg-[#4A6B5D] text-white border-[#4A6B5D] dark:bg-[#7C9A82] dark:text-[#141413] dark:border-[#7C9A82]"
              : "bg-[#F4F1EA] text-[#1F2937] border-[#E6E1D6] hover:bg-[#EAE5DA] dark:bg-[#252522] dark:text-[#F3F2EE] dark:border-[#2E2E2B]"
          }`}
        >
          <Compass className="w-3 h-3" />
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
              {activeMovement.name === "Wisdom & Poetry"
                ? "Wisdom"
                : activeMovement.name}
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
      </nav>

      {/* LEVEL 1: Movements S-Curve */}
      {zoomLevel === 1 && (
        <SCurveTrail
          points={movementPoints}
          onSelect={(id) => handleZoomIn(id)}
        />
      )}

      {/* LEVEL 2: Books S-Curve */}
      {zoomLevel === 2 && (
        <SCurveTrail
          points={bookPoints}
          onSelect={(id) => handleZoomIn(id)}
        />
      )}

      {/* LEVEL 3: Chapters & Private Notes */}
      {zoomLevel === 3 && activeBook && (
        <ol className="mx-auto max-w-[340px] pt-2 space-y-0">
          {Array.from({ length: activeBook.chapters }, (_, i) => i + 1).map(
            (chapter, idx) => {
              const isRead =
                completedByBook.get(activeBook.name)?.has(chapter) ?? false;
              const notes =
                notesByBookChapter.get(`${activeBook.name}:${chapter}`) ?? [];
              const readerHref = `/reader?book=${encodeURIComponent(
                activeBook.name
              )}&chapter=${chapter}`;
              const isEven = idx % 2 === 0;
              const isLast = chapter === activeBook.chapters;

              return (
                <li key={chapter} className="flex flex-col items-center">
                  {/* Chapter waystone + label */}
                  <div
                    className={`relative flex items-center justify-center w-full py-1 ${
                      isEven ? "-translate-x-7" : "translate-x-7"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => router.push(readerHref)}
                      className="group relative flex items-center justify-center focus:outline-none"
                      aria-label={`${activeBook.name} chapter ${chapter}`}
                    >
                      <span
                        className={`w-6 h-6 rounded-full transition-transform group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-[#4A6B5D]/50 ${
                          isRead
                            ? "bg-[#6C8879] dark:bg-[#7C9A82]"
                            : "bg-[#EDE8DF] dark:bg-[#252522] border-2 border-[#C8BFB0] dark:border-[#4A4842]"
                        }`}
                      />
                      <span
                        className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-serif text-[15px] transition-colors ${
                          isEven ? "left-9 text-left" : "right-9 text-right"
                        } ${
                          isRead
                            ? "text-[#1F2937] dark:text-[#F3F2EE] group-hover:text-[#4A6B5D] dark:group-hover:text-[#7C9A82]"
                            : "text-[#9A9284] dark:text-[#6E6B63] group-hover:text-[#1F2937] dark:group-hover:text-[#F3F2EE]"
                        }`}
                      >
                        {activeBook.name} {chapter}
                      </span>
                    </button>
                  </div>

                  {/* Inline private reflections (if any) */}
                  {notes.length > 0 && (
                    <div className="w-full max-w-[300px] my-2">
                      <ChapterNotesInline notes={notes} />
                    </div>
                  )}

                  {/* Organic curved connector to next chapter */}
                  {!isLast && (
                    <svg
                      viewBox="0 0 80 36"
                      className="w-20 h-9 pointer-events-none"
                      aria-hidden="true"
                    >
                      <path
                        d={
                          isEven
                            ? "M 12 0 C 12 18, 68 18, 68 36"
                            : "M 68 0 C 68 18, 12 18, 12 36"
                        }
                        fill="none"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeDasharray={isRead ? undefined : "4 6"}
                        className={
                          isRead
                            ? "stroke-[#8FA89B] dark:stroke-[#63826A]"
                            : "stroke-[#D8D2C5] dark:stroke-[#3A3935]"
                        }
                      />
                    </svg>
                  )}
                </li>
              );
            }
          )}
        </ol>
      )}
    </div>
  );
}
