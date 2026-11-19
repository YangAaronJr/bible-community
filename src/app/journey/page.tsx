"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import QuietPageHeader from "@/components/ui/QuietPageHeader";
import { createClient } from "@/lib/supabase/client";
import { BIBLE_BOOKS, WEEKDAYS } from "@/lib/plans/reading-plans";

interface ProgressRow {
  book: string;
  chapter: number;
}

const BOOK_CODES: Record<string, string> = {
  Genesis: "GEN",
  Exodus: "EXO",
  Leviticus: "LEV",
  Numbers: "NUM",
  Deuteronomy: "DEU",
  Joshua: "JOS",
  Judges: "JDG",
  Ruth: "RUT",
  "1 Samuel": "1SA",
  "2 Samuel": "2SA",
  "1 Kings": "1KI",
  "2 Kings": "2KI",
  "1 Chronicles": "1CH",
  "2 Chronicles": "2CH",
  Ezra: "EZR",
  Nehemiah: "NEH",
  Esther: "EST",
  Job: "JOB",
  Psalms: "PSA",
  Proverbs: "PRO",
  Ecclesiastes: "ECC",
  "Song of Solomon": "SNG",
  Isaiah: "ISA",
  Jeremiah: "JER",
  Lamentations: "LAM",
  Ezekiel: "EZK",
  Daniel: "DAN",
  Hosea: "HOS",
  Joel: "JOL",
  Amos: "AMO",
  Obadiah: "OBA",
  Jonah: "JON",
  Micah: "MIC",
  Nahum: "NAM",
  Habakkuk: "HAB",
  Zephaniah: "ZEP",
  Haggai: "HAG",
  Zechariah: "ZEC",
  Malachi: "MAL",
  Matthew: "MAT",
  Mark: "MRK",
  Luke: "LUK",
  John: "JHN",
  Acts: "ACT",
  Romans: "ROM",
  "1 Corinthians": "1CO",
  "2 Corinthians": "2CO",
  Galatians: "GAL",
  Ephesians: "EPH",
  Philippians: "PHP",
  Colossians: "COL",
  "1 Thessalonians": "1TH",
  "2 Thessalonians": "2TH",
  "1 Timothy": "1TI",
  "2 Timothy": "2TI",
  Titus: "TIT",
  Philemon: "PHM",
  Hebrews: "HEB",
  James: "JAS",
  "1 Peter": "1PE",
  "2 Peter": "2PE",
  "1 John": "1JN",
  "2 John": "2JN",
  "3 John": "3JN",
  Jude: "JUD",
  Revelation: "REV",
};

export default function JourneyPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [restDays, setRestDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [testamentFilter, setTestamentFilter] = useState<"ALL" | "OT" | "NT">(
    "ALL"
  );

  const loadJourney = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const [{ data: rows }, { data: activeSched }] = await Promise.all([
      supabase
        .from("reading_progress")
        .select("book, chapter")
        .eq("user_id", user.id),
      supabase
        .from("custom_schedules")
        .select("rest_days")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
    ]);

    setProgress(rows || []);
    setRestDays(activeSched?.rest_days ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadJourney();
  }, [loadJourney]);

  // Cumulative private progress — never resets
  const completedByBook = new Map<string, Set<number>>();
  for (const row of progress) {
    if (!completedByBook.has(row.book)) {
      completedByBook.set(row.book, new Set());
    }
    completedByBook.get(row.book)!.add(row.chapter);
  }

  const totalChapters = progress.length;
  const completedBooksCount = BIBLE_BOOKS.filter((b) => {
    const set = completedByBook.get(b.name);
    return set && set.size >= b.chapters;
  }).length;

  const sabbathDayLabel =
    restDays
      .map((d) => WEEKDAYS.find((w) => w.day === d)?.short)
      .filter(Boolean)
      .join(" · ") || "None";

  const filteredBooks = BIBLE_BOOKS.filter((b) =>
    testamentFilter === "ALL" ? true : b.testament === testamentFilter
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-24">
      <Navbar variant="inner" />

      <main className="flex-1 max-w-xl w-full mx-auto px-5 pt-4 pb-5 space-y-5">
        <QuietPageHeader title="Journey" />
        {loading ? (
          <div className="p-8 bg-white border border-[#E6E1D6] rounded-2xl flex items-center justify-center text-xs text-[#6B7280]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading mosaic...
          </div>
        ) : (
          <>
            {/* Compact Top Counters: Books, Chapters, Sabbath Day */}
            <section className="bg-white border border-[#E6E1D6] rounded-2xl p-4 grid grid-cols-3 divide-x divide-[#E6E1D6] shadow-2xs">
              <div className="pr-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Books
                </p>
                <p className="font-editorial text-2xl font-semibold text-[#1F2937] mt-0.5">
                  {completedBooksCount}
                  <span className="text-sm font-normal text-[#6B7280]">
                    {" "}
                    / 66
                  </span>
                </p>
              </div>

              <div className="px-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Chapters
                </p>
                <p className="font-editorial text-2xl font-semibold text-[#1F2937] mt-0.5">
                  {totalChapters}
                </p>
              </div>

              <Link href="/plans" className="pl-3 group">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Sabbath Day
                </p>
                <p className="font-editorial text-2xl font-semibold text-[#4A6B5D] group-hover:underline mt-0.5 truncate">
                  {sabbathDayLabel}
                </p>
              </Link>
            </section>

            {/* Visual Scripture Mosaic */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Visual Scripture Mosaic
                </span>

                <div className="inline-flex p-0.5 rounded-xl bg-[#F4F1EA] border border-[#E6E1D6] text-[10.5px] font-medium">
                  {(["ALL", "OT", "NT"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setTestamentFilter(tab)}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        testamentFilter === tab
                          ? "bg-white text-[#1F2937] shadow-2xs"
                          : "text-[#6B7280] hover:text-[#1F2937]"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {filteredBooks.map((book) => {
                  const readSet = completedByBook.get(book.name);
                  const readCount = readSet ? readSet.size : 0;
                  const pct = Math.min(
                    100,
                    Math.round((readCount / book.chapters) * 100)
                  );
                  const isComplete = readCount >= book.chapters;
                  const isActive = readCount > 0 && !isComplete;
                  const code =
                    BOOK_CODES[book.name] ||
                    book.name.replace(/\s+/g, "").slice(0, 3).toUpperCase();

                  let nextChapter = 1;
                  if (readSet && readCount < book.chapters) {
                    for (let ch = 1; ch <= book.chapters; ch++) {
                      if (!readSet.has(ch)) {
                        nextChapter = ch;
                        break;
                      }
                    }
                  }

                  return (
                    <Link
                      key={book.name}
                      href={`/reader?book=${encodeURIComponent(book.name)}&chapter=${nextChapter}`}
                      title={`${book.name}: ${readCount}/${book.chapters} chapters`}
                      className={`relative overflow-hidden rounded-2xl p-3 text-center transition-all hover:scale-[1.02] ${
                        isComplete
                          ? "bg-[#4A6B5D] text-white shadow-2xs"
                          : isActive
                            ? "bg-[#EBF1EE] text-[#4A6B5D] border border-[#CFE0D6] font-semibold"
                            : "bg-[#F4F1EA] text-[#6B7280] opacity-80 hover:opacity-100"
                      }`}
                    >
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 bottom-0 h-1 bg-[#4A6B5D]/20"
                        >
                          <span
                            className="block h-full bg-[#4A6B5D]"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                      )}
                      <p className="text-xs font-bold tracking-tight">{code}</p>
                      <p className="text-[9px] mt-0.5 opacity-90">
                        {isComplete
                          ? "Complete"
                          : isActive
                            ? `${readCount}/${book.chapters}`
                            : "0 ch"}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
