"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  UserPlus,
  X,
} from "lucide-react";
import { getInitials } from "@/components/ui/Navbar";
import { createClient } from "@/lib/supabase/client";

interface AcceptedFriend {
  friendshipId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  hasUnreadDm: boolean;
}

interface PendingRequest {
  friendshipId: string;
  otherUserId: string;
  displayName: string;
  avatarUrl: string | null;
  direction: "incoming" | "outgoing";
}

interface SocialCircle {
  id: string;
  name: string;
  avatarUrl: string | null;
}

type ActiveDrawer = "add-friend" | "create-circle" | "join-circle" | null;

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function AvatarCircle({
  name,
  avatarUrl,
  editorial = false,
}: {
  name: string;
  avatarUrl: string | null;
  editorial?: boolean;
}) {
  return (
    <div
      className={`w-[52px] h-[52px] rounded-full overflow-hidden ring-1 ring-[#E6E1D6] bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center font-semibold shrink-0 select-none ${
        editorial ? "font-editorial text-lg" : "text-sm"
      }`}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}

export default function SocialHub() {
  const [userId, setUserId] = useState<string | null>(null);
  const [myFriendCode, setMyFriendCode] = useState<string | null>(null);
  const [friends, setFriends] = useState<AcceptedFriend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [circles, setCircles] = useState<SocialCircle[]>([]);
  const [loading, setLoading] = useState(true);

  const [drawer, setDrawer] = useState<ActiveDrawer>(null);
  const [friendCodeInput, setFriendCodeInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  const [newCircleName, setNewCircleName] = useState("");
  const [creatorIsLeader, setCreatorIsLeader] = useState(false);
  const [circleInviteInput, setCircleInviteInput] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadSocialData = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);

    const [{ data: myProfile }, { data: friendshipRows }, { data: memberships }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("friend_code")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("friendships")
          .select("id, requester_id, addressee_id, status")
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
          .order("created_at", { ascending: false }),
        supabase
          .from("circle_members")
          .select("circle_id")
          .eq("user_id", user.id),
      ]);

    setMyFriendCode(myProfile?.friend_code || null);

    // Collect all friend user IDs to hydrate profiles
    const friendRows = friendshipRows || [];
    const peerIds = Array.from(
      new Set(
        friendRows.map((f) =>
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        )
      )
    );

    const profileMap = new Map<
      string,
      { display_name: string; avatar_url: string | null }
    >();
    if (peerIds.length > 0) {
      const { data: peerProfiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", peerIds);
      for (const p of peerProfiles || []) {
        profileMap.set(p.id, {
          display_name: p.display_name,
          avatar_url: p.avatar_url,
        });
      }
    }

    const acceptedRows = friendRows.filter((f) => f.status === "accepted");
    const acceptedIds = acceptedRows.map((f) => f.id);

    // Check unread 1-on-1 DMs per friendship
    const latestIncomingByFriendship = new Map<string, string>();
    if (acceptedIds.length > 0) {
      const { data: dmRows } = await supabase
        .from("messages")
        .select("friendship_id, created_at")
        .in("friendship_id", acceptedIds)
        .neq("sender_id", user.id)
        .order("created_at", { ascending: false })
        .limit(60);

      for (const m of dmRows || []) {
        if (m.friendship_id && !latestIncomingByFriendship.has(m.friendship_id)) {
          latestIncomingByFriendship.set(m.friendship_id, m.created_at);
        }
      }
    }

    setFriends(
      acceptedRows.map((f) => {
        const peerId =
          f.requester_id === user.id ? f.addressee_id : f.requester_id;
        const prof = profileMap.get(peerId);
        const latestAt = latestIncomingByFriendship.get(f.id);
        let hasUnreadDm = false;
        if (latestAt && typeof window !== "undefined") {
          const lastRead = localStorage.getItem(`dm_last_read_${f.id}`);
          hasUnreadDm =
            !lastRead || new Date(latestAt) > new Date(lastRead);
        }
        return {
          friendshipId: f.id,
          userId: peerId,
          displayName: prof?.display_name || "Fellow Reader",
          avatarUrl: prof?.avatar_url || null,
          hasUnreadDm,
        };
      })
    );

    setPendingRequests(
      friendRows
        .filter((f) => f.status === "pending")
        .map((f) => {
          const isIncoming = f.addressee_id === user.id;
          const otherId = isIncoming ? f.requester_id : f.addressee_id;
          const prof = profileMap.get(otherId);
          return {
            friendshipId: f.id,
            otherUserId: otherId,
            displayName: prof?.display_name || "Fellow Reader",
            avatarUrl: prof?.avatar_url || null,
            direction: isIncoming ? "incoming" : "outgoing",
          };
        })
    );

    // Load user's Circles
    const circleIds = (memberships || []).map((m) => m.circle_id);
    if (circleIds.length > 0) {
      const { data: circleRows } = await supabase
        .from("circles")
        .select("id, name, avatar_url")
        .in("id", circleIds)
        .order("created_at", { ascending: true });

      setCircles(
        (circleRows || []).map((c) => ({
          id: c.id,
          name: c.name,
          avatarUrl: c.avatar_url,
        }))
      );
    } else {
      setCircles([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadSocialData();
  }, [loadSocialData]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`social-hub-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => loadSocialData()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as { friendship_id?: string | null };
          if (row.friendship_id) loadSocialData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadSocialData]);

  async function handleCopyFriendCode() {
    if (!myFriendCode) return;
    try {
      await navigator.clipboard.writeText(myFriendCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  }

  async function handleSendFriendRequest(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = friendCodeInput.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setFeedback(null);

    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc(
        "send_friend_request_by_code",
        { code: trimmed }
      );
      if (error) throw error;

      const res = data as {
        display_name: string;
        status: "pending" | "accepted";
        direction: "outgoing" | "incoming";
        already_exists: boolean;
      };

      setFriendCodeInput("");
      if (res.already_exists && res.status === "accepted") {
        setFeedback({
          type: "success",
          text: `You are already friends with ${res.display_name}.`,
        });
      } else if (res.already_exists && res.direction === "incoming") {
        setFeedback({
          type: "success",
          text: `${res.display_name} already sent you a request — accept below!`,
        });
      } else if (res.already_exists) {
        setFeedback({
          type: "success",
          text: `Friend request to ${res.display_name} is already pending.`,
        });
      } else {
        setFeedback({
          type: "success",
          text: `Friend request sent to ${res.display_name}!`,
        });
      }
      await loadSocialData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Could not send friend request.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRespondRequest(
    friendshipId: string,
    accept: boolean
  ) {
    setActionId(friendshipId);
    setFeedback(null);
    const supabase = createClient();
    try {
      if (accept) {
        const { error } = await supabase
          .from("friendships")
          .update({ status: "accepted" })
          .eq("id", friendshipId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("friendships")
          .delete()
          .eq("id", friendshipId);
        if (error) throw error;
      }
      await loadSocialData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Could not update friend request.",
      });
    } finally {
      setActionId(null);
    }
  }

  async function handleCreateCircle(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !newCircleName.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const supabase = createClient();
    const code = generateInviteCode();

    try {
      const { data: created, error: createError } = await supabase
        .from("circles")
        .insert({
          name: newCircleName.trim(),
          invite_code: code,
          created_by: userId,
          max_members: 12,
        })
        .select("id, name, invite_code")
        .single();

      if (createError) throw createError;

      const { error: memberError } = await supabase
        .from("circle_members")
        .insert({
          circle_id: created.id,
          user_id: userId,
          role: creatorIsLeader ? "leader" : "member",
        });

      if (memberError) throw memberError;

      setNewCircleName("");
      setCreatorIsLeader(false);
      setDrawer(null);
      setFeedback({
        type: "success",
        text: `Created "${created.name}" · Code: ${created.invite_code}`,
      });
      await loadSocialData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Could not create circle.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinCircle(e: React.FormEvent) {
    e.preventDefault();
    if (!circleInviteInput.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc("join_circle_by_code", {
        code: circleInviteInput.trim().toUpperCase(),
      });
      if (error) throw error;

      const result = data as {
        circle_id: string;
        name: string;
        already_member?: boolean;
      };

      setCircleInviteInput("");
      setDrawer(null);
      setFeedback({
        type: "success",
        text: result.already_member
          ? `Already in "${result.name}".`
          : `Joined "${result.name}".`,
      });
      await loadSocialData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to join circle.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const incomingRequests = pendingRequests.filter(
    (r) => r.direction === "incoming"
  );
  const outgoingRequests = pendingRequests.filter(
    (r) => r.direction === "outgoing"
  );

  return (
    <div className="space-y-6 py-2">
      {feedback && !drawer && (
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

      {loading ? (
        <div className="p-8 bg-white border border-[#E6E1D6] rounded-2xl flex items-center justify-center text-xs text-[#6B7280]">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Loading fellowship...
        </div>
      ) : (
        <>
          {/* TOP SECTION: Friends (1-on-1 DMs) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Friends (1-on-1 DMs)
                </span>
                {incomingRequests.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFeedback(null);
                      setDrawer("add-friend");
                    }}
                    className="px-2 py-0.5 rounded-full bg-[#EBF1EE] text-[#4A6B5D] text-[10px] font-semibold cursor-pointer"
                  >
                    {incomingRequests.length} request
                    {incomingRequests.length === 1 ? "" : "s"}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setFeedback(null);
                  setDrawer("add-friend");
                }}
                className="inline-flex items-center gap-1 text-xs text-[#4A6B5D] font-semibold hover:opacity-80 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Add Friend</span>
              </button>
            </div>

            {friends.length === 0 ? (
              <div className="bg-white border border-[#E6E1D6] rounded-2xl p-6 text-center space-y-3">
                <p className="text-xs text-[#6B7280] leading-relaxed">
                  {incomingRequests.length > 0
                    ? `You have ${incomingRequests.length} pending friend request${incomingRequests.length === 1 ? "" : "s"} waiting.`
                    : "Connect 1-on-1 with trusted friends using their Friend Code."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFeedback(null);
                    setDrawer("add-friend");
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>
                    {incomingRequests.length > 0
                      ? "Review Requests"
                      : "Add a Friend"}
                  </span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {friends.map((friend) => (
                  <Link
                    key={friend.friendshipId}
                    href={`/members/${friend.userId}`}
                    className="bg-white border border-[#E6E1D6] rounded-2xl p-3 flex flex-col items-center text-center hover:border-[#4A6B5D] transition-all relative group shadow-2xs"
                  >
                    <div className="relative mb-2">
                      <AvatarCircle
                        name={friend.displayName}
                        avatarUrl={friend.avatarUrl}
                      />
                      {friend.hasUnreadDm && (
                        <span
                          aria-label="Unread direct message"
                          className="absolute top-0 right-0 w-3 h-3 rounded-full bg-[#4A6B5D] ring-2 ring-white dark:ring-[#1E1E1C]"
                        />
                      )}
                    </div>
                    <span className="text-xs font-semibold text-[#1F2937] truncate w-full">
                      {friend.displayName}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* BOTTOM SECTION: Circles / Groups */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">
                Circles / Groups
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setFeedback(null);
                    setDrawer("join-circle");
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#6B7280] hover:text-[#1F2937] cursor-pointer"
                >
                  <KeyRound className="w-3 h-3 text-[#4A6B5D]" />
                  <span>Join by Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFeedback(null);
                    setDrawer("create-circle");
                  }}
                  className="inline-flex items-center gap-1 text-xs text-[#4A6B5D] font-semibold hover:opacity-80 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Circle</span>
                </button>
              </div>
            </div>

            {circles.length === 0 ? (
              <div className="bg-white border border-[#E6E1D6] rounded-2xl p-6 text-center space-y-3">
                <p className="text-xs text-[#6B7280]">
                  Start an invite-only reading circle or enter a group invite
                  code.
                </p>
                <div className="flex items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDrawer("join-circle")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-medium text-[#1F2937] cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-[#4A6B5D]" />
                    <span>Join by Code</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawer("create-circle")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Circle</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {circles.map((circle) => (
                  <Link
                    key={circle.id}
                    href={`/circles/${circle.id}`}
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        localStorage.setItem("active_circle_id", circle.id);
                      }
                    }}
                    className="bg-white border border-[#E6E1D6] rounded-2xl p-3 flex flex-col items-center text-center hover:border-[#4A6B5D] transition-all shadow-2xs"
                  >
                    <div className="mb-2">
                      <AvatarCircle
                        name={circle.name}
                        avatarUrl={circle.avatarUrl}
                        editorial
                      />
                    </div>
                    <span className="text-xs font-semibold text-[#1F2937] truncate w-full">
                      {circle.name}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Drawers / Modals */}
      {drawer && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
          onClick={() => setDrawer(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto bg-white border-t sm:border border-[#E6E1D6] rounded-t-3xl sm:rounded-3xl p-5 pb-7 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-editorial text-xl font-medium text-[#1F2937]">
                {drawer === "add-friend"
                  ? "Add Friend"
                  : drawer === "create-circle"
                    ? "New Circle"
                    : "Join by Code"}
              </h2>
              <button
                type="button"
                onClick={() => setDrawer(null)}
                aria-label="Close drawer"
                className="p-1.5 rounded-full bg-[#F4F1EA] text-[#6B7280] hover:text-[#1F2937] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {feedback && (
              <div
                className={`px-3.5 py-2 rounded-xl text-xs border ${
                  feedback.type === "success"
                    ? "bg-[#EBF1EE] border-[#CFE0D6] text-[#3D5A4E]"
                    : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300"
                }`}
              >
                {feedback.text}
              </div>
            )}

            {drawer === "add-friend" ? (
              <div className="space-y-4">
                {/* User's own Friend Code */}
                <div className="p-3.5 rounded-2xl bg-[#FAF9F6] border border-[#E6E1D6] flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] block">
                      Your Friend Code
                    </span>
                    <span className="font-mono text-base font-bold tracking-widest text-[#1F2937]">
                      {myFriendCode || "—"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyFriendCode}
                    disabled={!myFriendCode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E6E1D6] hover:bg-[#F4F1EA] text-xs font-medium text-[#1F2937] cursor-pointer disabled:opacity-50"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#4A6B5D]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#4A6B5D]" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Send request by code or display name */}
                <form onSubmit={handleSendFriendRequest} className="space-y-2.5">
                  <label className="block text-xs font-medium text-[#1F2937]">
                    Enter Friend Code or Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={friendCodeInput}
                    onChange={(e) => setFriendCodeInput(e.target.value)}
                    placeholder="e.g. A1B2C3 or Hannah"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E1D6] bg-[#FAF9F6] text-xs text-[#1F2937] focus:outline-none focus:border-[#4A6B5D]"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !friendCodeInput.trim()}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {submitting ? "Sending..." : "Send Friend Request"}
                  </button>
                </form>

                {/* Incoming Requests */}
                {incomingRequests.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[#E6E1D6]">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] block">
                      Incoming Requests
                    </span>
                    <div className="space-y-2">
                      {incomingRequests.map((req) => (
                        <div
                          key={req.friendshipId}
                          className="p-2.5 rounded-xl bg-[#FAF9F6] border border-[#E6E1D6] flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-full overflow-hidden bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center text-xs font-semibold shrink-0">
                              {req.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={req.avatarUrl}
                                  alt={req.displayName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                getInitials(req.displayName)
                              )}
                            </div>
                            <span className="text-xs font-semibold text-[#1F2937] truncate">
                              {req.displayName}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={actionId === req.friendshipId}
                              onClick={() =>
                                handleRespondRequest(req.friendshipId, false)
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E6E1D6] text-[11px] font-medium text-[#6B7280] hover:text-[#1F2937] cursor-pointer"
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              disabled={actionId === req.friendshipId}
                              onClick={() =>
                                handleRespondRequest(req.friendshipId, true)
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-[#4A6B5D] text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Accept
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Outgoing Requests */}
                {outgoingRequests.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[#E6E1D6]">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] block">
                      Sent Requests
                    </span>
                    <div className="space-y-1.5">
                      {outgoingRequests.map((req) => (
                        <div
                          key={req.friendshipId}
                          className="px-3 py-2 rounded-xl bg-[#FAF9F6] border border-[#E6E1D6] flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-[#1F2937] truncate">
                            {req.displayName}
                          </span>
                          <button
                            type="button"
                            disabled={actionId === req.friendshipId}
                            onClick={() =>
                              handleRespondRequest(req.friendshipId, false)
                            }
                            className="text-[11px] text-[#6B7280] hover:text-red-600 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : drawer === "create-circle" ? (
              <form onSubmit={handleCreateCircle} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#1F2937]">
                    Circle Name
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newCircleName}
                    onChange={(e) => setNewCircleName(e.target.value)}
                    placeholder="e.g., Grace & Psalms"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E1D6] bg-[#FAF9F6] text-xs text-[#1F2937] focus:outline-none focus:border-[#4A6B5D]"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-[#6B7280] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={creatorIsLeader}
                    onChange={(e) => setCreatorIsLeader(e.target.checked)}
                    className="rounded border-[#E6E1D6] accent-[#4A6B5D]"
                  />
                  <span>Add optional Leader badge for me</span>
                </label>

                <button
                  type="submit"
                  disabled={submitting || !newCircleName.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
                >
                  {submitting ? "Creating..." : "Create Circle"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleJoinCircle} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#1F2937]">
                    Invite Code
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={10}
                    value={circleInviteInput}
                    onChange={(e) =>
                      setCircleInviteInput(e.target.value.toUpperCase())
                    }
                    placeholder="ABC123"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E1D6] bg-[#FAF9F6] text-sm font-mono tracking-widest uppercase text-[#1F2937] focus:outline-none focus:border-[#4A6B5D]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !circleInviteInput.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
                >
                  {submitting ? "Joining..." : "Join Circle"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
