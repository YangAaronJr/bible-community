"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, Heart, Loader2, Send, Trash2 } from "lucide-react";
import { getInitials } from "@/components/ui/Navbar";
import { createClient } from "@/lib/supabase/client";
import type {
  CircleInfo,
  CircleMemberProfile,
} from "@/components/circle/CircleManager";

interface PrayerRequestRow {
  id: string;
  circle_id: string;
  user_id: string;
  content: string;
  is_answered: boolean;
  created_at: string;
}

interface PrayerResponseRow {
  prayer_id: string;
  user_id: string;
}

interface CirclePrayerSectionProps {
  circle: CircleInfo;
  members: CircleMemberProfile[];
  currentUserId: string;
  onSelectMember?: (member: CircleMemberProfile) => void;
}

function formatPrayerTime(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CirclePrayerSection({
  circle,
  members,
  currentUserId,
  onSelectMember,
}: CirclePrayerSectionProps) {
  const [requests, setRequests] = useState<PrayerRequestRow[]>([]);
  const [responsesByPrayer, setResponsesByPrayer] = useState<
    Map<string, Set<string>>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [busyPrayerId, setBusyPrayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const memberMap = new Map(members.map((m) => [m.user_id, m]));

  const loadPrayers = useCallback(async () => {
    const supabase = createClient();
    const { data: reqRows } = await supabase
      .from("prayer_requests")
      .select("id, circle_id, user_id, content, is_answered, created_at")
      .eq("circle_id", circle.id)
      .order("is_answered", { ascending: true })
      .order("created_at", { ascending: false });

    const list = reqRows || [];
    setRequests(list);

    if (list.length > 0) {
      const prayerIds = list.map((r) => r.id);
      const { data: respRows } = await supabase
        .from("prayer_responses")
        .select("prayer_id, user_id")
        .in("prayer_id", prayerIds);

      const map = new Map<string, Set<string>>();
      for (const row of (respRows || []) as PrayerResponseRow[]) {
        if (!map.has(row.prayer_id)) map.set(row.prayer_id, new Set());
        map.get(row.prayer_id)!.add(row.user_id);
      }
      setResponsesByPrayer(map);
    } else {
      setResponsesByPrayer(new Map());
    }

    setLoading(false);
  }, [circle.id]);

  useEffect(() => {
    setLoading(true);
    loadPrayers();
  }, [loadPrayers]);

  // Live Supabase Realtime for prayer_requests & prayer_responses
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`circle-prayers-${circle.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "prayer_requests",
          filter: `circle_id=eq.${circle.id}`,
        },
        () => {
          loadPrayers();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "prayer_responses",
        },
        () => {
          loadPrayers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [circle.id, loadPrayers]);

  async function handleCreatePrayer(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;
    setPosting(true);
    setError(null);

    const supabase = createClient();
    const { error: insertErr } = await supabase.from("prayer_requests").insert({
      circle_id: circle.id,
      user_id: currentUserId,
      content: newContent.trim(),
      is_answered: false,
    });

    setPosting(false);
    if (insertErr) {
      setError("Could not share prayer request. Please try again.");
      return;
    }
    setNewContent("");
    await loadPrayers();
  }

  async function handleTogglePraying(prayerId: string) {
    setBusyPrayerId(prayerId);
    setError(null);
    const supabase = createClient();
    const currentSet = responsesByPrayer.get(prayerId) || new Set<string>();
    const isPraying = currentSet.has(currentUserId);

    const { error: respErr } = isPraying
      ? await supabase
          .from("prayer_responses")
          .delete()
          .eq("prayer_id", prayerId)
          .eq("user_id", currentUserId)
      : await supabase.from("prayer_responses").insert({
          prayer_id: prayerId,
          user_id: currentUserId,
        });

    if (respErr) {
      setError("Could not update prayer response. Please try again.");
      setBusyPrayerId(null);
      return;
    }

    await loadPrayers();
    setBusyPrayerId(null);
  }

  async function handleToggleAnswered(req: PrayerRequestRow) {
    setError(null);
    const supabase = createClient();
    const { error: updateErr } = await supabase
      .from("prayer_requests")
      .update({ is_answered: !req.is_answered })
      .eq("id", req.id);
    if (updateErr) {
      setError("Could not update prayer status. Please try again.");
      return;
    }
    await loadPrayers();
  }

  async function handleDeletePrayer(id: string) {
    setError(null);
    const supabase = createClient();
    const { error: deleteErr } = await supabase
      .from("prayer_requests")
      .delete()
      .eq("id", id);
    if (deleteErr) {
      setError("Could not delete prayer request. Please try again.");
      return;
    }
    await loadPrayers();
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
          {error}
        </div>
      )}
      {/* Compose Prayer Request */}
      <form
        onSubmit={handleCreatePrayer}
        className="bg-white border border-[#E6E1D6] rounded-2xl p-4 space-y-3 shadow-2xs"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4A6B5D]">
            Share a Prayer Request
          </span>
          <span className="text-[11px] text-[#6B7280]">
            Private to {circle.name}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            required
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="How can your circle pray for you this week?"
            className="flex-1 bg-[#FAF9F6] border border-[#E6E1D6] rounded-xl px-3.5 py-2 text-xs text-[#1F2937] placeholder-[#6B7280] focus:outline-none focus:border-[#4A6B5D]"
          />
          <button
            type="submit"
            disabled={posting || !newContent.trim()}
            className="px-3.5 py-2 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            {posting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Share</span>
          </button>
        </div>
      </form>

      {/* Prayer Requests List */}
      {loading ? (
        <div className="p-8 bg-white border border-[#E6E1D6] rounded-2xl flex items-center justify-center text-xs text-[#6B7280]">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Loading circle prayers...
        </div>
      ) : requests.length === 0 ? (
        <div className="p-6 bg-white border border-[#E6E1D6] rounded-2xl text-center space-y-1">
          <p className="font-editorial text-base font-medium text-[#1F2937]">
            Carry One Another in Prayer
          </p>
          <p className="text-xs text-[#6B7280]">
            No prayer requests shared yet. Post a request above so your circle
            can pray with you.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const author = memberMap.get(req.user_id);
            const authorName = author?.display_name || "Fellow Reader";
            const firstName = authorName.split(" ")[0];
            const isMine = req.user_id === currentUserId;
            const responderIds = Array.from(
              responsesByPrayer.get(req.id) || []
            );
            const isPraying = responderIds.includes(currentUserId);
            const otherResponders = responderIds
              .filter((id) => id !== currentUserId)
              .map(
                (id) =>
                  memberMap.get(id)?.display_name.split(" ")[0] || "Friend"
              );

            const namesList = isPraying
              ? ["You", ...otherResponders]
              : otherResponders;
            const statusText =
              namesList.length > 0
                ? `${namesList.join(", ")} ${
                    isPraying || namesList.length > 1
                      ? "are praying"
                      : "is praying"
                  }`
                : "Be the first to pray";

            return (
              <div
                key={req.id}
                className={`rounded-2xl p-4 border transition-colors ${
                  req.is_answered
                    ? "bg-white border-[#E6E1D6]"
                    : "bg-[#F3F7F4] border-[#CFE0D6]"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => author && onSelectMember?.(author)}
                    className="flex items-center gap-2 text-left cursor-pointer"
                  >
                    <span className="w-7 h-7 rounded-full overflow-hidden bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center text-[10px] font-semibold shrink-0">
                      {author?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={author.avatar_url}
                          alt={authorName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        getInitials(authorName)
                      )}
                    </span>
                    <span className="text-xs font-semibold text-[#1F2937]">
                      {authorName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        req.is_answered
                          ? "bg-[#EBF1EE] text-[#4A6B5D]"
                          : "bg-[#4A6B5D] text-white"
                      }`}
                    >
                      {req.is_answered ? "Answered" : "Prayer Request"}
                    </span>
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] text-[#6B7280]">
                      {formatPrayerTime(req.created_at)}
                    </span>
                    {isMine && (
                      <button
                        type="button"
                        onClick={() => handleDeletePrayer(req.id)}
                        title="Delete prayer request"
                        className="text-[#6B7280] hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-[13.5px] leading-relaxed text-[#1F2937] mb-3 whitespace-pre-wrap">
                  {req.content}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[#DCE8E0]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyPrayerId === req.id}
                      onClick={() => handleTogglePraying(req.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isPraying
                          ? "bg-[#4A6B5D] text-white"
                          : "bg-white border border-[#CFE0D6] text-[#4A6B5D] hover:bg-[#EBF1EE]"
                      }`}
                    >
                      <Heart className="w-3.5 h-3.5" />
                      <span>
                        {isPraying ? "Praying for you" : `Pray for ${firstName}`}
                      </span>
                    </button>

                    {isMine && (
                      <button
                        type="button"
                        onClick={() => handleToggleAnswered(req)}
                        className="px-2.5 py-1.5 rounded-xl bg-white border border-[#E6E1D6] text-[11px] font-medium text-[#1F2937] hover:bg-[#F4F1EA] flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#4A6B5D]" />
                        <span>
                          {req.is_answered ? "Reopen" : "Mark Answered"}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Praying Members Avatars + Names (No vanity counters) */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {responderIds.length > 0 && (
                      <div className="flex -space-x-1.5 shrink-0">
                        {responderIds.slice(0, 4).map((uid) => {
                          const m = memberMap.get(uid);
                          const mName = m?.display_name || "Friend";
                          return (
                            <span
                              key={uid}
                              className="w-5 h-5 rounded-full overflow-hidden ring-1 ring-white bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center text-[8.5px] font-semibold"
                            >
                              {m?.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={m.avatar_url}
                                  alt={mName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                getInitials(mName)
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <span className="text-[11px] text-[#4A6B5D] font-medium truncate">
                      {statusText}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
