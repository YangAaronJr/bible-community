"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import {
  BIBLE_TRANSLATIONS,
  type BibleTranslationId,
} from "@/lib/bible/bible-api";
import { BIBLE_BOOKS } from "@/lib/plans/reading-plans";

export type ReaderSelectorType = "book" | "chapter" | "translation";

interface ReaderSelectorSheetProps {
  openSelector: ReaderSelectorType | null;
  book: string;
  chapter: number;
  totalChapters: number;
  translation: BibleTranslationId;
  onSelectBook: (bookName: string) => void;
  onSelectChapter: (chapterNum: number) => void;
  onSelectTranslation: (translationId: BibleTranslationId) => void;
  onClose: () => void;
}

/**
 * Custom dark-mode-compatible bottom drawer / centered modal selector
 * replacing native <select> elements for Book, Chapter, and Translation.
 */
export default function ReaderSelectorSheet({
  openSelector,
  book,
  chapter,
  totalChapters,
  translation,
  onSelectBook,
  onSelectChapter,
  onSelectTranslation,
  onClose,
}: ReaderSelectorSheetProps) {
  const [bookQuery, setBookQuery] = useState("");
  const [testamentFilter, setTestamentFilter] = useState<"ALL" | "OT" | "NT">(
    "ALL"
  );
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!openSelector) return;
    setBookQuery("");
    setTestamentFilter("ALL");

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    // Scroll active book or chapter into view when sheet opens
    const raf = requestAnimationFrame(() => {
      activeItemRef.current?.scrollIntoView({ block: "center" });
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(raf);
    };
  }, [openSelector, onClose]);

  if (!openSelector) return null;

  const title =
    openSelector === "book"
      ? "Select Book"
      : openSelector === "chapter"
        ? `Select Chapter · ${book}`
        : "Bible Version";

  const normalizedQuery = bookQuery.trim().toLowerCase();
  const filteredBooks = BIBLE_BOOKS.filter((b) => {
    if (testamentFilter !== "ALL" && b.testament !== testamentFilter) {
      return false;
    }
    if (normalizedQuery && !b.name.toLowerCase().includes(normalizedQuery)) {
      return false;
    }
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-[#FAF9F6] dark:bg-[#1E1E1C]! border border-[#E6E1D6] rounded-t-3xl sm:rounded-2xl shadow-xl max-h-[82vh] flex flex-col overflow-hidden"
      >
        {/* Mobile Drawer Handle */}
        <div className="w-10 h-1 rounded-full bg-[#E6E1D6] mx-auto mt-2.5 sm:hidden shrink-0" />

        {/* Sheet Header */}
        <div className="px-5 py-3.5 border-b border-[#E6E1D6] flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2 className="font-editorial text-lg font-medium text-[#1F2937]">
              {title}
            </h2>
            {openSelector === "chapter" && (
              <p className="text-[11px] text-[#6B7280]">
                {totalChapters} {totalChapters === 1 ? "chapter" : "chapters"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close selector"
            className="w-9 h-9 rounded-full hover:bg-[#F4F1EA] text-[#6B7280] hover:text-[#1F2937] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Book Filter Controls */}
        {openSelector === "book" && (
          <div className="px-4 pt-3 pb-2 border-b border-[#E6E1D6] space-y-2.5 shrink-0">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={bookQuery}
                onChange={(e) => setBookQuery(e.target.value)}
                placeholder="Filter books..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#F4F1EA] border border-[#E6E1D6] text-xs text-[#1F2937] placeholder-[#6B7280] focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: "ALL", label: "All (66)" },
                  { id: "OT", label: "Old Testament" },
                  { id: "NT", label: "New Testament" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTestamentFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                    testamentFilter === tab.id
                      ? "bg-[#4A6B5D] text-white"
                      : "bg-[#F4F1EA] text-[#6B7280] hover:text-[#1F2937]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable Selection Body */}
        <div className="flex-1 overflow-y-auto p-4 pb-6">
          {openSelector === "book" && (
            <div className="grid grid-cols-2 gap-2">
              {filteredBooks.map((b) => {
                const isActive = b.name === book;
                return (
                  <button
                    key={b.name}
                    ref={isActive ? activeItemRef : undefined}
                    type="button"
                    onClick={() => {
                      onSelectBook(b.name);
                      onClose();
                    }}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isActive
                        ? "bg-[#EBF1EE] border-[#CFE0D6] text-[#4A6B5D] font-semibold"
                        : "bg-white dark:bg-[#252522]! border-[#E6E1D6] text-[#1F2937] hover:bg-[#F4F1EA]"
                    }`}
                  >
                    <span className="text-xs truncate">{b.name}</span>
                    <span className="text-[10px] text-[#6B7280] shrink-0">
                      {b.chapters}
                    </span>
                  </button>
                );
              })}
              {filteredBooks.length === 0 && (
                <p className="col-span-2 py-8 text-center text-xs text-[#6B7280]">
                  No books match &ldquo;{bookQuery}&rdquo;.
                </p>
              )}
            </div>
          )}

          {openSelector === "chapter" && (
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
              {Array.from({ length: totalChapters }, (_, i) => i + 1).map(
                (ch) => {
                  const isActive = ch === chapter;
                  return (
                    <button
                      key={ch}
                      ref={isActive ? activeItemRef : undefined}
                      type="button"
                      onClick={() => {
                        onSelectChapter(ch);
                        onClose();
                      }}
                      className={`min-h-[44px] rounded-xl text-xs font-medium flex items-center justify-center transition-colors cursor-pointer ${
                        isActive
                          ? "bg-[#4A6B5D] text-white font-semibold"
                          : "bg-white dark:bg-[#252522]! border border-[#E6E1D6] text-[#1F2937] hover:bg-[#F4F1EA]"
                      }`}
                    >
                      {ch}
                    </button>
                  );
                }
              )}
            </div>
          )}

          {openSelector === "translation" && (
            <div className="space-y-2">
              {BIBLE_TRANSLATIONS.map((t) => {
                const isActive = t.id === translation;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onSelectTranslation(t.id);
                      onClose();
                    }}
                    className={`w-full min-h-[52px] px-4 py-3 rounded-xl border flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                      isActive
                        ? "bg-[#EBF1EE] border-[#CFE0D6] text-[#4A6B5D]"
                        : "bg-white dark:bg-[#252522]! border-[#E6E1D6] text-[#1F2937] hover:bg-[#F4F1EA]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold">
                        {t.shortLabel}
                      </div>
                      <div className="text-[11px] text-[#6B7280] truncate">
                        {t.name}
                      </div>
                    </div>
                    {isActive && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
