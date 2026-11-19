"use client";

import { useState } from "react";
import { BookOpenText, ChevronDown, ChevronUp } from "lucide-react";

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

function NoteCard({ note }: { note: PrivateVerseNote }) {
  const dateLabel = formatNoteDate(note.created_at);

  return (
    <div className="rounded-xl bg-[#FAF9F6] dark:bg-[#141413] border border-[#E6E1D6] dark:border-[#2E2E2B] px-3 py-2.5 text-left">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4A6B5D] dark:text-[#7C9A82]">
          <BookOpenText className="w-3 h-3 shrink-0" />
          {formatVerseRef(note)}
        </span>
        {dateLabel && (
          <span className="text-[11px] text-[#6B7280] dark:text-[#A3A19A]">
            {dateLabel}
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-[#1F2937] dark:text-[#F3F2EE] whitespace-pre-line break-words">
        {note.content}
      </p>
    </div>
  );
}

export default function ChapterNotesInline({
  notes,
}: {
  notes: PrivateVerseNote[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (notes.length === 0) return null;

  const visibleNotes = expanded ? notes : notes.slice(0, 1);
  const hiddenCount = notes.length - 1;

  return (
    <div
      className="mt-2 space-y-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {visibleNotes.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4A6B5D] dark:text-[#7C9A82] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4A6B5D]/40 rounded px-1 py-0.5"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Show {hiddenCount} more {hiddenCount === 1 ? "reflection" : "reflections"}
            </>
          )}
        </button>
      )}
    </div>
  );
}
