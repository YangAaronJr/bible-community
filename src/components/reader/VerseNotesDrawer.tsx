"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquarePlus, Send, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface EnrichedVerseNote {
  id: string;
  circle_id: string;
  user_id: string;
  author_name: string;
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  content: string;
  created_at: string;
}

interface VerseNotesDrawerProps {
  book: string;
  chapter: number;
  verse: number;
  maxVerse: number;
  verseText: string;
  circleId: string | null;
  circleName: string | null;
  currentUserId: string | null;
  notes: EnrichedVerseNote[];
  onClose: () => void;
  onNoteChanged: () => void;
}

export default function VerseNotesDrawer({
  book,
  chapter,
  verse,
  maxVerse,
  verseText,
  circleId,
  circleName,
  currentUserId,
  notes,
  onClose,
  onNoteChanged,
}: VerseNotesDrawerProps) {
  const [verseEnd, setVerseEnd] = useState<number>(verse);
  const [content, setContent] = useState("");
  const [alsoShareToFeed, setAlsoShareToFeed] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchingNotes = notes.filter(
    (n) => n.verse_start <= verse && n.verse_end >= verse
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!circleId || !currentUserId || !content.trim()) return;

    setSubmitting(true);
    setError(null);
    const supabase = createClient();

    const endVerse = Math.max(verse, Math.min(maxVerse, verseEnd));
    const trimmed = content.trim();

    try {
      const { error: insertError } = await supabase.from("verse_notes").insert({
        circle_id: circleId,
        user_id: currentUserId,
        book,
        chapter,
        verse_start: verse,
        verse_end: endVerse,
        content: trimmed,
      });

      if (insertError) throw insertError;

      if (alsoShareToFeed) {
        const refLabel =
          endVerse > verse
            ? `${book} ${chapter}:${verse}-${endVerse}`
            : `${book} ${chapter}:${verse}`;
        await supabase.from("messages").insert({
          circle_id: circleId,
          sender_id: currentUserId,
          recipient_id: null,
          parent_id: null,
          content: `📖 Note on ${refLabel}:\n"${verseText}"\n\n${trimmed}`,
        });
      }

      setContent("");
      onNoteChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save note.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(noteId: string) {
    const supabase = createClient();
    await supabase.from("verse_notes").delete().eq("id", noteId);
    onNoteChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-[1px]">
      <div className="w-full max-w-md bg-[#FAF9F6] h-full shadow-xl border-l border-[#E5E0D8] flex flex-col">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 bg-white border-b border-[#E5E0D8] flex items-center justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-[#4B6F5B] font-semibold">
              {circleName ? `Circle Notes • ${circleName}` : "Verse Notes"}
            </span>
            <h3 className="text-lg font-serif font-semibold text-[#1F2937]">
              {book} {chapter}:{verse}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#596579] hover:text-[#1F2937] hover:bg-[#F3EFEA] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Verse Quote */}
        <div className="px-5 py-3.5 bg-[#F4F7F5] border-b border-[#C5D7CC]">
          <p className="text-xs font-serif italic text-[#1F2937] leading-relaxed">
            &ldquo;{verseText}&rdquo;
          </p>
        </div>

        {/* Existing Circle Notes List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {!circleId ? (
            <div className="p-4 rounded-xl bg-white border border-[#E5E0D8] text-xs text-[#596579] space-y-2">
              <p>
                Join or create a Circle to read and share verse-anchored notes
                with your small group.
              </p>
              <Link
                href="/circle"
                className="inline-block font-medium text-[#4B6F5B] underline"
              >
                Go to Fellowship Circle →
              </Link>
            </div>
          ) : matchingNotes.length === 0 ? (
            <div className="p-6 text-center rounded-xl bg-white border border-[#E5E0D8] text-xs text-[#596579]">
              No notes from your circle on this verse yet. Start a quiet
              reflection or question below.
            </div>
          ) : (
            matchingNotes.map((note) => {
              const rangeLabel =
                note.verse_end > note.verse_start
                  ? `vv. ${note.verse_start}–${note.verse_end}`
                  : `v. ${note.verse_start}`;
              return (
                <div
                  key={note.id}
                  className="p-4 rounded-xl bg-white border border-[#E5E0D8] space-y-1.5 shadow-2xs"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#1F2937]">
                        {note.author_name}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[#E3EBE6] text-[#3D5A4A] text-[10px] font-medium">
                        {rangeLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[#596579]">
                      <span>
                        {new Date(note.created_at).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" }
                        )}
                      </span>
                      {note.user_id === currentUserId && (
                        <button
                          type="button"
                          onClick={() => handleDelete(note.id)}
                          title="Delete note"
                          className="text-[#596579] hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-[#1F2937] whitespace-pre-wrap leading-relaxed">
                    {note.content}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Compose New Verse Note */}
        {circleId && currentUserId && (
          <form
            onSubmit={handleSubmit}
            className="p-4 bg-white border-t border-[#E5E0D8] space-y-3"
          >
            {error && (
              <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between text-xs text-[#596579]">
              <span className="inline-flex items-center gap-1 font-medium text-[#1F2937]">
                <MessageSquarePlus className="w-3.5 h-3.5 text-[#4B6F5B]" />
                Add Note ({book} {chapter}:{verse}
                {verseEnd > verse ? `–${verseEnd}` : ""})
              </span>
              <label className="flex items-center gap-1.5">
                <span>Through verse:</span>
                <select
                  value={verseEnd}
                  onChange={(e) => setVerseEnd(Number(e.target.value))}
                  className="border border-[#E5E0D8] rounded-md px-1.5 py-0.5 bg-[#FAF9F6] text-[#1F2937]"
                >
                  {Array.from(
                    { length: maxVerse - verse + 1 },
                    (_, i) => verse + i
                  ).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <textarea
              rows={3}
              required
              placeholder="Write a question, observation, or prayer anchored to this verse..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-[#E5E0D8] bg-[#FAF9F6] text-xs text-[#1F2937] focus:outline-none focus:border-[#4B6F5B]"
            />

            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-[#596579] cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoShareToFeed}
                  onChange={(e) => setAlsoShareToFeed(e.target.checked)}
                  className="rounded border-[#E5E0D8] text-[#4B6F5B]"
                />
                <span>Also share to Circle feed</span>
              </label>

              <button
                type="submit"
                disabled={submitting || !content.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#4B6F5B] hover:bg-[#3D5A4A] disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Post Note</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
