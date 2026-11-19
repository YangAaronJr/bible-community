"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BookOpenText, X } from "lucide-react";

export interface PrivateVerseNote {
  id: string;
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  content: string;
  created_at: string;
}

function formatVerseRef(note: PrivateVerseNote): string {
  if (note.verse_end > note.verse_start) {
    return `v. ${note.verse_start}–${note.verse_end}`;
  }
  return `v. ${note.verse_start}`;
}

function formatNoteDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ChapterNoteIndexCard({
  notes,
  onOpen,
}: {
  notes: PrivateVerseNote[];
  onOpen: () => void;
}) {
  if (notes.length === 0) return null;

  const first = notes[0];

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={`Read ${notes.length} ${
        notes.length === 1 ? "reflection" : "reflections"
      }`}
      className="w-[104px] sm:w-[122px] text-left rounded-lg bg-white dark:bg-[#1E1E1C] border border-[#E6E1D6] dark:border-[#2E2E2B] border-t-2 border-t-[#6C8879] dark:border-t-[#7C9A82] px-2 py-1.5 shadow-2xs hover:border-[#4A6B5D]/60 dark:hover:border-[#7C9A82]/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4A6B5D]/40"
    >
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className="text-[10px] font-medium text-[#4A6B5D] dark:text-[#7C9A82] truncate">
          {formatVerseRef(first)}
        </span>
        {notes.length > 1 && (
          <span className="text-[9px] text-[#6B7280] dark:text-[#A3A19A] shrink-0">
            +{notes.length - 1}
          </span>
        )}
      </div>
      <p className="text-[10px] leading-snug text-[#4B5563] dark:text-[#D1CFC7] line-clamp-2 break-words">
        {first.content}
      </p>
    </button>
  );
}

export function ChapterNotesModal({
  bookName,
  chapter,
  notes,
  onClose,
}: {
  bookName: string;
  chapter: number;
  notes: PrivateVerseNote[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (notes.length === 0) return null;

  const readerHref = `/reader?book=${encodeURIComponent(
    bookName
  )}&chapter=${chapter}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${bookName} ${chapter} private reflections`}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-[#FAF9F6] dark:bg-[#1E1E1C] border border-[#E6E1D6] dark:border-[#2E2E2B] shadow-lg overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#E6E1D6] dark:border-[#2E2E2B]">
          <div>
            <h2 className="font-serif text-lg font-medium text-[#1F2937] dark:text-[#F3F2EE]">
              {bookName} {chapter}
            </h2>
            <p className="text-[11px] text-[#6B7280] dark:text-[#A3A19A]">
              Your reflections
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reflections"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F4F1EA] dark:text-[#A3A19A] dark:hover:text-[#F3F2EE] dark:hover:bg-[#252522] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-3">
          {notes.map((note) => {
            const dateLabel = formatNoteDate(note.created_at);
            return (
              <article
                key={note.id}
                className="rounded-xl bg-white dark:bg-[#141413] border border-[#E6E1D6] dark:border-[#2E2E2B] px-3.5 py-3"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#4A6B5D] dark:text-[#7C9A82]">
                    <BookOpenText className="w-3.5 h-3.5 shrink-0" />
                    {formatVerseRef(note)}
                  </span>
                  {dateLabel && (
                    <span className="text-[11px] text-[#6B7280] dark:text-[#A3A19A]">
                      {dateLabel}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-[#1F2937] dark:text-[#F3F2EE] whitespace-pre-line break-words">
                  {note.content}
                </p>
              </article>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[#E6E1D6] dark:border-[#2E2E2B] bg-[#F4F1EA]/60 dark:bg-[#141413]/50">
          <Link
            href={readerHref}
            className="text-xs font-medium text-[#4A6B5D] dark:text-[#7C9A82] hover:underline"
          >
            Open in Reader →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-[#252522] border border-[#E6E1D6] dark:border-[#2E2E2B] text-[#1F2937] dark:text-[#F3F2EE] hover:bg-[#F4F1EA] dark:hover:bg-[#2E2E2B] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
