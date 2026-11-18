"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Check,
  ChevronLeft,
  Clock,
  HandHeart,
  Loader2,
  MessageSquare,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { getInitials } from "@/components/ui/Navbar";
import { triggerRingPush } from "@/lib/notifications/push-client";
import { createClient } from "@/lib/supabase/client";

interface MemberProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
}

interface SharedCircle {
  id: string;
  name: string;
  memberRole: "member" | "leader";
}

interface ActivePrayer {
  id: string;
  circle_id: string;
  circle_name: string;
  content: string;
  created_at: string;
  isPraying: boolean;
  prayingCount: number;
}

interface RecentReflection {
  id: string;
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  content: string;
  visibility: "private" | "friends" | "circles";
  created_at: string;
}

function formatReflectionWhen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const timeStr = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (diffDays <= 0) return `Today · ${timeStr}`;
  if (diffDays === 1) return `Yesterday · ${timeStr}`;
  return `${diffDays} days ago`;
}

function formatPassage(r: RecentReflection): string {
  return r.verse_end > r.verse_start
    ? `${r.book} ${r.chapter}:${r.verse_start}–${r.verse_end}`
    : `${r.book} ${r.chapter}:${r.verse_start}`;
}

export default function MemberProfileView({
  memberId,
  initialUserId,
}: {
  memberId: string;
  initialUserId?: string;
}) {
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState<string | null>(
    initialUserId ?? null
  );
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [friendship, setFriendship] = useState<FriendshipRow | null>(null);
  const [sharedCircles, setSharedCircles] = useState<SharedCircle[]>([]);
  const [prayers, setPrayers] = useState<ActivePrayer[]>([]);
  const [reflections, setReflections] = useState<RecentReflection[]>([]);
  const [isRung, setIsRung] = useState(false);

  const [loading, setLoading] = useState(true);
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [confirmRemoveFriend, setConfirmRemoveFriend] = useState(false);
  const [ringLoading, setRingLoading] = useState(false);
  const [prayingBusyId, setPrayingBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadMemberProfile = useCallback(async () => {
    const supabase = createClient();
    let uid = initialUserId ?? null;
    if (!uid) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      uid = user?.id ?? null;
    }

    if (!uid) {
      setLoading(false);
      return;
    }
    setCurrentUserId(uid);

    const since72h = new Date(
      Date.now() - 72 * 60 * 60 * 1000
    ).toISOString();
    const since10m = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const [
      { data: memberProfile },
      { data: friendshipRow },
      { data: sharedMemberRows },
      { data: activePrayers },
      { data: recentNotes },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("id", memberId)
        .maybeSingle(),
      uid !== memberId
        ? supabase
            .from("friendships")
            .select("id, requester_id, addressee_id, status")
            .or(
              `and(requester_id.eq.${uid},addressee_id.eq.${memberId}),and(requester_id.eq.${memberId},addressee_id.eq.${uid})`
            )
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("circle_members")
        .select("circle_id, role")
        .eq("user_id", memberId),
      supabase
        .from("prayer_requests")
        .select("id, circle_id, content, created_at")
        .eq("user_id", memberId)
        .eq("is_answered", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("verse_notes")
        .select(
          "id, book, chapter, verse_start, verse_end, content, visibility, created_at"
        )
        .eq("user_id", memberId)
        .gte("created_at", since72h)
        .order("created_at", { ascending: false }),
    ]);

    const isAcceptedFriend = friendshipRow?.status === "accepted";
    const ringCircleContext = isAcceptedFriend
      ? null
      : (sharedMemberRows?.[0]?.circle_id ?? null);

    let hasRecentRing = false;
    if (uid !== memberId && (isAcceptedFriend || ringCircleContext)) {
      const ringQuery = supabase
        .from("rings")
        .select("id")
        .eq("sender_id", uid)
        .eq("recipient_id", memberId)
        .gte("created_at", since10m)
        .limit(1);

      const { data: recentRings } = ringCircleContext
        ? await ringQuery.eq("circle_id", ringCircleContext)
        : await ringQuery.is("circle_id", null);

      hasRecentRing = Boolean(recentRings && recentRings.length > 0);
    }

    setProfile(memberProfile || null);
    setFriendship(friendshipRow || null);
    setIsRung(hasRecentRing);

    // Hydrate shared circle names (RLS on circle_members scopes to shared circles)
    const circleIds = Array.from(
      new Set((sharedMemberRows || []).map((m) => m.circle_id))
    );
    const circleNameMap = new Map<string, string>();
    if (circleIds.length > 0) {
      const { data: circleRows } = await supabase
        .from("circles")
        .select("id, name")
        .in("id", circleIds);
      for (const c of circleRows || []) {
        circleNameMap.set(c.id, c.name);
      }
    }

    setSharedCircles(
      (sharedMemberRows || []).map((m) => ({
        id: m.circle_id,
        name: circleNameMap.get(m.circle_id) || "Shared Circle",
        memberRole: m.role,
      }))
    );

    // Hydrate prayer responses
    const prayerList = activePrayers || [];
    if (prayerList.length > 0) {
      const prayerIds = prayerList.map((p) => p.id);
      const { data: respRows } = await supabase
        .from("prayer_responses")
        .select("prayer_id, user_id")
        .in("prayer_id", prayerIds);

      const prayingSetByPrayer = new Map<string, Set<string>>();
      for (const r of respRows || []) {
        if (!prayingSetByPrayer.has(r.prayer_id)) {
          prayingSetByPrayer.set(r.prayer_id, new Set());
        }
        prayingSetByPrayer.get(r.prayer_id)!.add(r.user_id);
      }

      setPrayers(
        prayerList.map((p) => {
          const set = prayingSetByPrayer.get(p.id) || new Set<string>();
          return {
            id: p.id,
            circle_id: p.circle_id,
            circle_name: circleNameMap.get(p.circle_id) || "Shared Circle",
            content: p.content,
            created_at: p.created_at,
            isPraying: set.has(uid),
            prayingCount: set.size,
          };
        })
      );
    } else {
      setPrayers([]);
    }

    setReflections(
      (recentNotes || []).map((n) => ({
        ...n,
        visibility:
          n.visibility === "friends" || n.visibility === "circles"
            ? n.visibility
            : "private",
      }))
    );

    setLoading(false);
  }, [memberId, initialUserId]);

  useEffect(() => {
    loadMemberProfile();
  }, [loadMemberProfile]);

  async function handleAddFriend() {
    if (!currentUserId || currentUserId === memberId) return;
    setFriendActionLoading(true);
    setFeedback(null);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from("friendships")
        .insert({
          requester_id: currentUserId,
          addressee_id: memberId,
          status: "pending",
        })
        .select("id, requester_id, addressee_id, status")
        .single();

      if (error) throw error;
      setFriendship(data);
      setFeedback({
        type: "success",
        text: `Friend request sent to ${profile?.display_name || "member"}.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error ? err.message : "Could not send friend request.",
      });
    } finally {
      setFriendActionLoading(false);
    }
  }

  async function handleAcceptFriend() {
    if (!friendship) return;
    setFriendActionLoading(true);
    setFeedback(null);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", friendship.id)
        .select("id, requester_id, addressee_id, status")
        .single();

      if (error) throw error;
      setFriendship(data);
      setFeedback({
        type: "success",
        text: `You and ${profile?.display_name || "this member"} are now friends.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Could not accept friend request.",
      });
    } finally {
      setFriendActionLoading(false);
    }
  }

  async function handleRemoveFriend() {
    if (!friendship) return;
    setFriendActionLoading(true);
    setFeedback(null);
    const supabase = createClient();

    try {
      const removedId = friendship.id;
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("id", removedId);

      if (error) throw error;

      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem(`dm_last_read_${removedId}`);
        } catch {
          // Ignore storage write errors
        }
      }

      setFriendship(null);
      setConfirmRemoveFriend(false);
      setFeedback({
        type: "success",
        text: `Removed ${profile?.display_name || "member"} from friends.`,
      });
      await loadMemberProfile();
      router.refresh();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error ? err.message : "Could not remove friend.",
      });
    } finally {
      setFriendActionLoading(false);
    }
  }

  async function handleSendRing() {
    if (!currentUserId || currentUserId === memberId) return;
    const isAcceptedFriend = friendship?.status === "accepted";
    const ringCircleId = isAcceptedFriend
      ? null
      : (sharedCircles[0]?.id ?? null);

    if (!isAcceptedFriend && !ringCircleId) {
      setFeedback({
        type: "error",
        text: "Add as a friend or join a shared Circle to send a gentle Ring.",
      });
      return;
    }

    setRingLoading(true);
    setFeedback(null);
    const supabase = createClient();
    const ringMessage = "Praying for your time in the Word today";

    try {
      const { error } = await supabase.from("rings").insert({
        circle_id: ringCircleId,
        sender_id: currentUserId,
        recipient_id: memberId,
        message: ringMessage,
      });

      if (error) throw error;

      triggerRingPush({
        circleId: ringCircleId,
        recipientId: memberId,
        message: ringMessage,
      });

      setIsRung(true);
      setFeedback({
        type: "success",
        text: `Quiet Ring sent to ${profile?.display_name || "member"}.`,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "A Ring was already sent within the last 10 minutes.";
      if (msg.toLowerCase().includes("10 minutes")) {
        setIsRung(true);
      }
      setFeedback({ type: "error", text: msg });
    } finally {
      setRingLoading(false);
    }
  }

  async function handleTogglePraying(prayer: ActivePrayer) {
    if (!currentUserId) return;
    setPrayingBusyId(prayer.id);
    const supabase = createClient();

    try {
      if (prayer.isPraying) {
        await supabase
          .from("prayer_responses")
          .delete()
          .eq("prayer_id", prayer.id)
          .eq("user_id", currentUserId);
      } else {
        await supabase.from("prayer_responses").insert({
          prayer_id: prayer.id,
          user_id: currentUserId,
        });
      }
      await loadMemberProfile();
    } finally {
      setPrayingBusyId(null);
    }
  }

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/social");
    }
  }

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center text-xs text-[#6B7280]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading profile...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bg-white border border-[#E6E1D6] rounded-2xl p-8 text-center space-y-3">
        <p className="font-editorial text-lg text-[#1F2937]">
          Member not found
        </p>
        <Link
          href="/social"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#4A6B5D] text-white text-xs font-medium"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Back to Social</span>
        </Link>
      </div>
    );
  }

  const isSelf = currentUserId === profile.id;
  const isFriend = friendship?.status === "accepted";
  const isOutgoingPending =
    friendship?.status === "pending" &&
    friendship.requester_id === currentUserId;
  const isIncomingPending =
    friendship?.status === "pending" &&
    friendship.addressee_id === currentUserId;
  const isCircleLeader = sharedCircles.some((c) => c.memberRole === "leader");

  let subtitle = "Fellow Reader";
  if (isSelf) {
    subtitle = "Your Profile";
  } else if (isFriend && sharedCircles.length > 0) {
    subtitle = isCircleLeader
      ? "Mutual Friend & Circle Leader"
      : "Mutual Friend & Circle Member";
  } else if (isFriend) {
    subtitle = "Mutual Friend";
  } else if (sharedCircles.length > 0) {
    subtitle = isCircleLeader
      ? "Circle Leader (Not yet a 1-on-1 friend)"
      : "Circle Member (Not yet a 1-on-1 friend)";
  }

  const canRing = isFriend || sharedCircles.length > 0;

  return (
    <div className="space-y-5">
      {/* Top Bar */}
      <div className="flex items-center justify-between py-1 border-b border-[#E6E1D6] pb-3">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#4A6B5D] hover:opacity-80 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <span className="font-editorial text-base font-semibold text-[#1F2937]">
          Member Profile
        </span>
        <div className="w-12" />
      </div>

      {feedback && (
        <div
          className={`px-4 py-2.5 rounded-2xl text-xs font-medium border ${
            feedback.type === "success"
              ? "bg-[#EBF1EE] border-[#CFE0D6] text-[#3D5A4E]"
              : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 pt-1">
        <div className="shrink-0 p-0.5 rounded-full ring-2 ring-[#4A6B5D] bg-white">
          <div className="w-[68px] h-[68px] rounded-full overflow-hidden bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center font-semibold text-lg select-none">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.display_name}
                className="w-full h-full object-cover"
              />
            ) : (
              getInitials(profile.display_name)
            )}
          </div>
        </div>
        <div className="min-w-0 space-y-0.5">
          <h1 className="font-editorial text-2xl font-semibold text-[#1F2937] truncate">
            {profile.display_name}
          </h1>
          <p className="text-xs text-[#6B7280]">{subtitle}</p>
          {sharedCircles.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {sharedCircles.map((c) => (
                <Link
                  key={c.id}
                  href={`/circles/${c.id}`}
                  className="px-2 py-0.5 rounded-full bg-[#F4F1EA] border border-[#E6E1D6] text-[10px] font-medium text-[#6B7280] hover:text-[#1F2937]"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Primary Action Bar */}
      {isSelf ? (
        <div className="flex items-center gap-2.5">
          <Link
            href="/reader"
            className="flex-1 py-2.5 px-4 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-semibold text-center shadow-2xs"
          >
            Open Reader
          </Link>
          <Link
            href="/settings"
            className="px-4 py-2.5 rounded-xl bg-[#F4F1EA] border border-[#E6E1D6] text-xs font-semibold text-[#1F2937]"
          >
            Settings
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            {isFriend && friendship ? (
              <Link
                href={`/dm/${friendship.id}`}
                onClick={() => {
                  try {
                    localStorage.setItem(
                      `dm_last_read_${friendship.id}`,
                      new Date().toISOString()
                    );
                  } catch {
                    // Ignore storage write errors
                  }
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Message</span>
              </Link>
            ) : isOutgoingPending ? (
              <button
                type="button"
                disabled
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#F4F1EA] border border-[#E6E1D6] text-xs font-semibold text-[#6B7280] flex items-center justify-center gap-1.5 cursor-default"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Request Sent</span>
              </button>
            ) : isIncomingPending ? (
              <button
                type="button"
                disabled={friendActionLoading}
                onClick={handleAcceptFriend}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {friendActionLoading ? "Accepting..." : "Accept Friend"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={friendActionLoading}
                onClick={handleAddFriend}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-semibold text-[#1F2937] flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                <UserPlus className="w-3.5 h-3.5 text-[#4A6B5D]" />
                <span>
                  {friendActionLoading ? "Sending..." : "+ Add Friend"}
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={ringLoading || !canRing}
              onClick={handleSendRing}
              title={
                canRing
                  ? "Send a gentle Ring (10-minute cooldown)"
                  : "Share a Circle or become friends to send a Ring"
              }
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                isRung
                  ? "bg-[#F4F1EA] border border-[#E6E1D6] text-[#6B7280]"
                  : "bg-[#FBF5EE] border border-[#E7D3BC] text-[#B47B44] hover:bg-[#F6EAD9]"
              }`}
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>{isRung ? "Rung · 10m" : "Ring"}</span>
            </button>
          </div>

          {isFriend && friendship && (
            confirmRemoveFriend ? (
              <div className="bg-white border border-[#E6E1D6] rounded-2xl p-3.5 flex items-center justify-between gap-3">
                <span className="text-xs text-[#6B7280]">
                  Remove <strong className="text-[#1F2937]">{profile.display_name}</strong> as a friend?
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={friendActionLoading}
                    onClick={() => setConfirmRemoveFriend(false)}
                    className="px-3 py-1.5 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-medium text-[#1F2937] transition-colors cursor-pointer disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={friendActionLoading}
                    onClick={handleRemoveFriend}
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {friendActionLoading ? "Removing..." : "Confirm"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmRemoveFriend(true)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#6B7280] hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                  <span>Remove Friend</span>
                </button>
              </div>
            )
          )}
        </div>
      )}

      {/* Active Prayer Need(s) from Shared Circles */}
      {prayers.length > 0 && (
        <section className="space-y-2.5">
          {prayers.map((prayer) => (
            <div
              key={prayer.id}
              className="bg-[#F4F1EA] border border-[#E6E1D6] rounded-2xl p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#B47B44]">
                  Active Prayer Request
                </span>
                <span className="text-[10.5px] text-[#6B7280]">
                  {prayer.circle_name}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-[#1F2937] whitespace-pre-wrap">
                {prayer.content}
              </p>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={prayingBusyId === prayer.id}
                  onClick={() => handleTogglePraying(prayer)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                    prayer.isPraying
                      ? "bg-[#4A6B5D] text-white"
                      : "bg-white border border-[#E6E1D6] text-[#1F2937] hover:bg-[#EBF1EE]"
                  }`}
                >
                  <HandHeart className="w-3.5 h-3.5" />
                  <span>
                    {prayer.isPraying ? "Praying ✓" : "Praying for you"}
                  </span>
                </button>
                {prayer.prayingCount > 0 && (
                  <span className="text-[11px] text-[#6B7280]">
                    {prayer.prayingCount} praying
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Reflections (Past 3 Days) */}
      <section className="space-y-3 pt-1">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">
            Reflections (Past 3 Days)
          </span>
          <span className="text-[10.5px] text-[#6B7280]">
            Fresh &amp; unhurried
          </span>
        </div>

        {reflections.length === 0 ? (
          <div className="bg-[#F4F1EA] border border-[#E6E1D6] rounded-2xl p-6 text-center">
            <p className="text-xs text-[#6B7280] italic">
              No reflections shared in the past 3 days.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reflections.map((r) => (
              <div
                key={r.id}
                className="bg-white border border-[#E6E1D6] rounded-2xl p-4 space-y-2 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="px-2.5 py-0.5 rounded-lg bg-[#EBF1EE] text-[#4A6B5D] font-medium">
                    {formatPassage(r)}
                  </span>
                  <span className="text-[#6B7280]">
                    {formatReflectionWhen(r.created_at)}
                  </span>
                </div>
                <p className="font-editorial text-base leading-relaxed text-[#1F2937] whitespace-pre-wrap">
                  {r.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
