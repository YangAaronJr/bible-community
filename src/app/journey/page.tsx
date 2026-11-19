"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import QuietPageHeader from "@/components/ui/QuietPageHeader";
import WaystoneTrail from "@/components/journey/WaystoneTrail";
import type { PrivateVerseNote } from "@/components/journey/ChapterNotesInline";
import { createClient } from "@/lib/supabase/client";

interface ProgressRow {
  book: string;
  chapter: number;
}

export default function JourneyPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [privateNotes, setPrivateNotes] = useState<PrivateVerseNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadJourney() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        router.push("/login");
        return;
      }

      const [{ data: rows }, { data: notes }] = await Promise.all([
        supabase
          .from("reading_progress")
          .select("book, chapter")
          .eq("user_id", user.id),
        supabase
          .from("verse_notes")
          .select("id, book, chapter, verse_start, verse_end, content, created_at")
          .eq("user_id", user.id)
          .eq("visibility", "private")
          .order("verse_start", { ascending: true })
          .order("created_at", { ascending: false }),
      ]);

      if (!active) return;

      setProgress(rows || []);
      setPrivateNotes(notes || []);
      setLoading(false);
    }

    loadJourney();
    return () => {
      active = false;
    };
  }, [router]);

  const completedByBook = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const row of progress) {
      if (!map.has(row.book)) {
        map.set(row.book, new Set());
      }
      map.get(row.book)!.add(row.chapter);
    }
    return map;
  }, [progress]);

  const notesByBookChapter = useMemo(() => {
    const map = new Map<string, PrivateVerseNote[]>();
    for (const note of privateNotes) {
      const key = `${note.book}:${note.chapter}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(note);
    }
    return map;
  }, [privateNotes]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] dark:bg-[#141413] text-[#1F2937] dark:text-[#F3F2EE] pb-24">
      <Navbar variant="inner" />

      <main className="flex-1 max-w-xl w-full mx-auto px-5 pt-4 pb-6 space-y-5">
        <QuietPageHeader
          title="Journey"
          subtitle="Running the race with endurance · Hebrews 12:1–2"
        />

        {loading ? (
          <div className="p-8 bg-white dark:bg-[#1E1E1C] border border-[#E6E1D6] dark:border-[#2E2E2B] rounded-2xl flex items-center justify-center text-xs text-[#6B7280] dark:text-[#A3A19A]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading trail...
          </div>
        ) : (
          <WaystoneTrail
            completedByBook={completedByBook}
            notesByBookChapter={notesByBookChapter}
          />
        )}
      </main>
    </div>
  );
}
