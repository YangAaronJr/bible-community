"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookMarked,
  BookOpen,
  Check,
  Compass,
  Loader2,
  Lock,
  Save,
  User,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import CircleManager from "@/components/circle/CircleManager";
import { createClient } from "@/lib/supabase/client";
import { BIBLE_BOOKS } from "@/lib/plans/reading-plans";

interface ProgressRow {
  book: string;
  chapter: number;
  read_in_physical_bible: boolean;
  completed_at: string;
}

export default function JourneyPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [testamentFilter, setTestamentFilter] = useState<"ALL" | "NT" | "OT">(
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

    setUserId(user.id);
    setEmail(user.email || "");

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    setDisplayName(
      profile?.display_name ||
        (user.user_metadata?.display_name as string) ||
        user.email?.split("@")[0] ||
        "Fellow Reader"
    );

    const { data: rows } = await supabase
      .from("reading_progress")
      .select("book, chapter, read_in_physical_bible, completed_at")
      .eq("user_id", user.id)
      .order("completed_at", { ascending: false });

    setProgress(rows || []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadJourney();
  }, [loadJourney]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !displayName.trim()) return;
    setSavingProfile(true);
    setProfileSaved(false);

    const supabase = createClient();
    await supabase.from("profiles").upsert(
      {
        id: userId,
        display_name: displayName.trim(),
      },
      { onConflict: "id" }
    );

    setSavingProfile(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  }

  // Compute private chapter & book totals (strictly no streaks or reset timers)
  const completedSetByBook = new Map<string, Set<number>>();
  let physicalCount = 0;

  for (const row of progress) {
    if (!completedSetByBook.has(row.book)) {
      completedSetByBook.set(row.book, new Set());
    }
    completedSetByBook.get(row.book)!.add(row.chapter);
    if (row.read_in_physical_bible) physicalCount++;
  }

  const totalChaptersCompleted = progress.length;
  const totalBooksCompleted = BIBLE_BOOKS.filter((b) => {
    const set = completedSetByBook.get(b.name);
    return set && set.size >= b.chapters;
  }).length;

  const filteredBooks = BIBLE_BOOKS.filter((b) =>
    testamentFilter === "ALL" ? true : b.testament === testamentFilter
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-20 sm:pb-12">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#4B6F5B] font-semibold">
            <Lock className="w-3.5 h-3.5" />
            Strictly Private to You
          </span>
          <h1 className="text-2xl sm:text-3xl font-serif font-semibold text-[#1F2937]">
            Journey &amp; Settings
          </h1>
          <p className="text-sm text-[#596579]">
            A quiet record of your time in Scripture. Never shared with others,
            and free of streaks or reset penalties.
          </p>
        </div>

        {/* Private Progress Totals */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-[#E5E0D8] rounded-2xl p-5 space-y-1 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-[#596579]">
              <span>Chapters Completed</span>
              <BookOpen className="w-4 h-4 text-[#4B6F5B]" />
            </div>
            <p className="text-3xl font-serif font-semibold text-[#1F2937]">
              {totalChaptersCompleted}
            </p>
            <p className="text-[11px] text-[#596579]">
              Of 1,189 chapters in Scripture
            </p>
          </div>

          <div className="bg-white border border-[#E5E0D8] rounded-2xl p-5 space-y-1 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-[#596579]">
              <span>Books Completed</span>
              <Compass className="w-4 h-4 text-[#4B6F5B]" />
            </div>
            <p className="text-3xl font-serif font-semibold text-[#1F2937]">
              {totalBooksCompleted}
            </p>
            <p className="text-[11px] text-[#596579]">
              Of 66 canonical books
            </p>
          </div>

          <div className="bg-white border border-[#E5E0D8] rounded-2xl p-5 space-y-1 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-[#596579]">
              <span>Read in Physical Bible</span>
              <BookMarked className="w-4 h-4 text-[#4B6F5B]" />
            </div>
            <p className="text-3xl font-serif font-semibold text-[#1F2937]">
              {physicalCount}
            </p>
            <p className="text-[11px] text-[#596579]">
              Chapters checked off from paper pages
            </p>
          </div>
        </section>

        {/* Book-by-Book Private Progress */}
        <section className="bg-white border border-[#E5E0D8] rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-serif font-semibold text-[#1F2937]">
                Scripture Progress by Book
              </h2>
              <p className="text-xs text-[#596579]">
                Click any book to open it in the Bible Reader.
              </p>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-[#F3EFEA] text-xs font-medium">
              {(["ALL", "NT", "OT"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTestamentFilter(tab)}
                  className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                    testamentFilter === tab
                      ? "bg-white text-[#1F2937] shadow-2xs"
                      : "text-[#596579] hover:text-[#1F2937]"
                  }`}
                >
                  {tab === "ALL"
                    ? "All (66)"
                    : tab === "NT"
                    ? "New Testament (27)"
                    : "Old Testament (39)"}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-10 flex items-center justify-center text-sm text-[#596579]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading your reading journey...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-96 overflow-y-auto pr-1">
              {filteredBooks.map((b) => {
                const doneCount = completedSetByBook.get(b.name)?.size || 0;
                const isBookComplete = doneCount >= b.chapters;
                const pct = Math.min(
                  100,
                  Math.round((doneCount / b.chapters) * 100)
                );

                return (
                  <Link
                    key={b.name}
                    href={`/reader?book=${encodeURIComponent(b.name)}&chapter=1`}
                    className={`p-3 rounded-xl border transition-colors flex flex-col justify-between gap-2 ${
                      isBookComplete
                        ? "bg-[#F4F7F5] border-[#4B6F5B]"
                        : doneCount > 0
                        ? "bg-[#FAF9F6] border-[#C5D7CC]"
                        : "bg-[#FAF9F6] border-[#E5E0D8] hover:bg-[#F3EFEA]/60"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-serif font-semibold text-[#1F2937]">
                        {b.name}
                      </span>
                      <span className="text-[11px] text-[#596579]">
                        {doneCount} / {b.chapters}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#E5E0D8] overflow-hidden">
                      <div
                        className="h-full bg-[#4B6F5B] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Profile & Display Name Settings */}
        <section className="bg-white border border-[#E5E0D8] rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xs">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#4B6F5B]" />
            <h2 className="text-lg font-serif font-semibold text-[#1F2937]">
              Profile Settings
            </h2>
          </div>

          <form
            onSubmit={handleSaveProfile}
            className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
          >
            <div className="flex-1">
              <label className="block text-xs font-medium text-[#1F2937] mb-1">
                Display Name (shown only to members of your invite-only Circles)
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg border border-[#E5E0D8] bg-[#FAF9F6] text-xs text-[#1F2937] focus:outline-none focus:border-[#4B6F5B]"
              />
            </div>

            <div className="sm:w-56">
              <label className="block text-xs font-medium text-[#596579] mb-1">
                Account Email
              </label>
              <input
                type="text"
                disabled
                value={email}
                className="w-full px-3.5 py-2 rounded-lg border border-[#E5E0D8] bg-[#F3EFEA] text-xs text-[#596579]"
              />
            </div>

            <button
              type="submit"
              disabled={savingProfile || !displayName.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#4B6F5B] hover:bg-[#3D5A4A] text-white text-xs font-medium transition-colors cursor-pointer"
            >
              {profileSaved ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Name</span>
                </>
              )}
            </button>
          </form>
        </section>

        {/* Circle Management, Optional Leader Badge & Invite Code Sharing */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#596579]">
            Circle Settings &amp; Invite Codes
          </h2>
          <CircleManager />
        </section>
      </main>
    </div>
  );
}
