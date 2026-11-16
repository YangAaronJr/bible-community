"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  CircleDot,
  Lock,
  MessageSquarePlus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type ReflectionVisibility = "private" | "friends" | "circles";

export interface EnrichedVerseNote {
  id: string;
  circle_id: string | null;
  user_id: string;
  author_name: string;
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  content: string;
  visibility: ReflectionVisibility;
  target_circle_ids: string[];
  created_at: string;
}

interface CircleOption {
  id: string;
  name: string;
}

interface VerseNotesDrawerProps {
  book: string;
  chapter: number;
  verse: number;
  maxVerse: number;
  verseText: string;
  circles: CircleOption[];
  activeCircleId: string | null;
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
  circles,
  activeCircleId,
  currentUserId,
  notes,
  onClose,
  onNoteChanged,
}: VerseNotesDrawerProps) {
  const [verseEnd, setVerseEnd] = useState<number>(verse);
  const [content, setContent] = useState("");
  const [destination, setDestination] =
    useState<ReflectionVisibility>("private");
  const [selectedCircleIds, setSelectedCircleIds] = useState<string[]>(() => {
    if (activeCircleId && circles.some((c) => c.id === activeCircleId)) {
      return [activeCircleId];
    }
    return circles.length > 0 ? [circles[0].id] : [];
  });
  const [alsoShareToFeed, setAlsoShareToFeed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const circleNameById = new Map(circles.map((c) => [c.id, c.name]));

  const matchingNotes = notes.filter(
    (n) => n.verse_start <= verse && n.verse_end >= verse
  );

  function handleSelectDestination(next: ReflectionVisibility) {
    setDestination(next);
    setError(null);
    if (next === "circles" && selectedCircleIds.length === 0 && circles.length > 0) {
      const fallback =
        activeCircleId && circles.some((c) => c.id === activeCircleId)
          ? activeCircleId
          : circles[0].id;
      setSelectedCircleIds([fallback]);
    }
  }

  function toggleCircleTarget(circleId: string) {
    setError(null);
    setSelectedCircleIds((prev) =>
      prev.includes(circleId)
        ? prev.filter((id) => id !== circleId)
        : [...prev, circleId]
    );
  }

  function formatVisibilityLabel(note: EnrichedVerseNote): string {
    if (note.visibility === "private") return "Only Me";
    if (note.visibility === "friends") return "Friends";
    const names = (note.target_circle_ids || [])
      .map((id) => circleNameById.get(id))
      .filter((n): n is string => Boolean(n));
    if (names.length > 0) return names.join(", ");
    if (note.circle_id && circleNameById.has(note.circle_id)) {
      return circleNameById.get(note.circle_id)!;
    }
    return "Circle";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || !content.trim()) return;

    if (destination === "circles" && selectedCircleIds.length === 0) {
      setError("Select at least one Circle to share this reflection with.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSavedToast(null);
    const supabase = createClient();

    const endVerse = Math.max(verse, Math.min(maxVerse, verseEnd));
    const trimmed = content.trim();
    const targetIds = destination === "circles" ? selectedCircleIds : [];

    try {
      const { error: insertError } = await supabase.from("verse_notes").insert({
        circle_id: targetIds[0] ?? null,
        user_id: currentUserId,
        book,
        chapter,
        verse_start: verse,
        verse_end: endVerse,
        content: trimmed,
        visibility: destination,
        target_circle_ids: targetIds,
      });

      if (insertError) throw insertError;

      if (destination === "circles" && alsoShareToFeed && targetIds.length > 0) {
        const refLabel =
          endVerse > verse
            ? `${book} ${chapter}:${verse}-${endVerse}`
            : `${book} ${chapter}:${verse}`;
        const chatBody = `📖 Reflection on ${refLabel}:\n"${verseText}"\n\n${trimmed}`;
        await Promise.all(
          targetIds.map((cid) =>
            supabase.from("messages").insert({
              circle_id: cid,
              sender_id: currentUserId,
              recipient_id: null,
              parent_id: null,
              content: chatBody,
            })
          )
        );
      }

      const destLabel =
        destination === "private"
          ? "Private (Only Me)"
          : destination === "friends"
            ? "All Friends"
            : targetIds
                .map((id) => circleNameById.get(id) || "Circle")
                .join(", ");

      setContent("");
      setSavedToast(`Reflection saved to ${destLabel}`);
      onNoteChanged();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not save reflection."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(noteId: string) {
    const supabase = createClient();
    await supabase.from("verse_notes").delete().eq("id", noteId);
    onNoteChanged();
  }

  const canSubmit =
    Boolean(currentUserId) &&
    Boolean(content.trim()) &&
    (destination !== "circles" || selectedCircleIds.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[1px]">
      <div className="w-full max-w-md bg-[#FAF9F6] h-full shadow-xl border-l border-[#E6E1D6] flex flex-col">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 bg-white border-b border-[#E6E1D6] flex items-center justify-between">
          <div>
            <span className="text-[10.5px] uppercase tracking-wider text-[#4A6B5D] font-semibold">
              Scripture Reflections
            </span>
            <h3 className="text-lg font-editorial font-semibold text-[#1F2937]">
              {book} {chapter}:{verse}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reflections drawer"
            className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F4F1EA] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Verse Quote */}
        <div className="px-5 py-3.5 bg-[#EBF1EE]/70 border-b border-[#E6E1D6]">
          <p className="text-sm font-editorial italic text-[#1F2937] leading-relaxed">
            &ldquo;{verseText}&rdquo;
          </p>
        </div>

        {/* Existing Visible Reflections */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {savedToast && (
            <div className="px-3.5 py-2 rounded-xl bg-[#4A6B5D] text-white text-xs font-medium flex items-center gap-2 shadow-2xs">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{savedToast}</span>
            </div>
          )}

          {matchingNotes.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-white border border-[#E6E1D6] text-xs text-[#6B7280]">
              No reflections on this verse yet. Jot a private thought or share
              with friends and circles below.
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
                  className="p-4 rounded-2xl bg-white border border-[#E6E1D6] space-y-2 shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-[#1F2937] truncate">
                        {note.author_name}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[#EBF1EE] text-[#4A6B5D] text-[10px] font-medium">
                        {rangeLabel}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[#F4F1EA] text-[#6B7280] text-[10px] font-medium truncate max-w-[140px]">
                        {formatVisibilityLabel(note)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[#6B7280] shrink-0">
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
                          title="Delete reflection"
                          className="text-[#6B7280] hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="font-editorial text-[15px] text-[#1F2937] whitespace-pre-wrap leading-relaxed">
                    {note.content}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Compose New Reflection with Destination Picker */}
        {!currentUserId ? (
          <div className="p-4 bg-white border-t border-[#E6E1D6] text-xs text-[#6B7280] text-center">
            <Link href="/login" className="font-semibold text-[#4A6B5D] underline">
              Sign in
            </Link>{" "}
            to save private or shared reflections.
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="p-4 bg-white border-t border-[#E6E1D6] space-y-3"
          >
            {error && (
              <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-300 p-2 rounded-lg">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between text-xs text-[#6B7280]">
              <span className="inline-flex items-center gap-1.5 font-medium text-[#1F2937]">
                <MessageSquarePlus className="w-3.5 h-3.5 text-[#4A6B5D]" />
                Share Reflection ({book} {chapter}:{verse}
                {verseEnd > verse ? `–${verseEnd}` : ""})
              </span>
              <label className="flex items-center gap-1.5">
                <span>Through v.</span>
                <select
                  value={verseEnd}
                  onChange={(e) => setVerseEnd(Number(e.target.value))}
                  className="border border-[#E6E1D6] rounded-lg px-1.5 py-0.5 bg-[#FAF9F6] text-[#1F2937]"
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
              placeholder="What stood out to you in this passage?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full p-3 rounded-2xl border border-[#E6E1D6] bg-[#FAF9F6] text-xs text-[#1F2937] leading-relaxed focus:outline-none focus:border-[#4A6B5D] resize-none"
            />

            {/* Destination Selector Pills */}
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] block">
                Choose Destination
              </span>
              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => handleSelectDestination("private")}
                  className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border transition-colors cursor-pointer ${
                    destination === "private"
                      ? "bg-[#EBF1EE] border-transparent text-[#4A6B5D] font-semibold"
                      : "bg-[#FAF9F6] border-[#E6E1D6] text-[#1F2937] hover:bg-[#F4F1EA]"
                  }`}
                >
                  <Lock className="w-3 h-3 shrink-0" />
                  <span className="truncate">Only Me</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectDestination("friends")}
                  className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border transition-colors cursor-pointer ${
                    destination === "friends"
                      ? "bg-[#EBF1EE] border-transparent text-[#4A6B5D] font-semibold"
                      : "bg-[#FAF9F6] border-[#E6E1D6] text-[#1F2937] hover:bg-[#F4F1EA]"
                  }`}
                >
                  <Users className="w-3 h-3 shrink-0" />
                  <span className="truncate">All Friends</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectDestination("circles")}
                  className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border transition-colors cursor-pointer ${
                    destination === "circles"
                      ? "bg-[#EBF1EE] border-transparent text-[#4A6B5D] font-semibold"
                      : "bg-[#FAF9F6] border-[#E6E1D6] text-[#1F2937] hover:bg-[#F4F1EA]"
                  }`}
                >
                  <CircleDot className="w-3 h-3 shrink-0" />
                  <span className="truncate">Circles</span>
                </button>
              </div>

              {/* Specific Circles Multi-Toggle */}
              {destination === "circles" && (
                <div className="p-2.5 rounded-xl bg-[#FAF9F6] border border-[#E6E1D6] space-y-2">
                  {circles.length === 0 ? (
                    <p className="text-[11px] text-[#6B7280]">
                      You haven&apos;t joined any Circles yet. Choose Private or
                      All Friends above, or join a Circle first.
                    </p>
                  ) : (
                    <>
                      <span className="text-[10px] font-medium text-[#6B7280] block">
                        Toggle one or more Circles:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {circles.map((c) => {
                          const selected = selectedCircleIds.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleCircleTarget(c.id)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border transition-colors cursor-pointer ${
                                selected
                                  ? "bg-[#4A6B5D] border-[#4A6B5D] text-white font-medium"
                                  : "bg-white border-[#E6E1D6] text-[#1F2937] hover:bg-[#F4F1EA]"
                              }`}
                            >
                              {selected && <Check className="w-3 h-3" />}
                              <span>{c.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              {destination === "circles" && selectedCircleIds.length > 0 ? (
                <label className="flex items-center gap-1.5 text-[11px] text-[#6B7280] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoShareToFeed}
                    onChange={(e) => setAlsoShareToFeed(e.target.checked)}
                    className="rounded border-[#E6E1D6] text-[#4A6B5D]"
                  />
                  <span>Also share to Circle chat</span>
                </label>
              ) : (
                <span className="text-[11px] text-[#6B7280]">
                  {destination === "private"
                    ? "Private (Only Me)"
                    : destination === "friends"
                      ? "Visible to friends for 3 days"
                      : "Select a Circle above"}
                </span>
              )}

              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {destination === "private"
                    ? "Save Private"
                    : "Share Reflection"}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
