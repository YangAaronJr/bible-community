"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { BellRing, ChevronLeft, Loader2, Lock, Send } from "lucide-react";
import { getInitials } from "@/components/ui/Navbar";
import { triggerRingPush } from "@/lib/notifications/push-client";
import { createClient } from "@/lib/supabase/client";
import type {
  CircleInfo,
  CircleMemberProfile,
} from "@/components/circle/CircleManager";

interface DirectMessageRow {
  id: string;
  circle_id: string;
  sender_id: string;
  recipient_id: string | null;
  content: string;
  created_at: string;
}

interface DirectMessageDrawerProps {
  circle: CircleInfo;
  currentUserId: string;
  recipient: CircleMemberProfile;
  onClose: () => void;
  onOpenMemberCard?: (member: CircleMemberProfile) => void;
}

export default function DirectMessageDrawer({
  circle,
  currentUserId,
  recipient,
  onClose,
  onOpenMemberCard,
}: DirectMessageDrawerProps) {
  const [messages, setMessages] = useState<DirectMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [isRung, setIsRung] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollerRef.current) {
        scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      }
    }, 40);
  }, []);

  const loadDMs = useCallback(async () => {
    const supabase = createClient();
    const since10m = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const [{ data, error: fetchError }, { data: ringData }] = await Promise.all(
      [
        supabase
          .from("messages")
          .select("id, circle_id, sender_id, recipient_id, content, created_at")
          .eq("circle_id", circle.id)
          .not("recipient_id", "is", null)
          .or(
            `and(sender_id.eq.${currentUserId},recipient_id.eq.${recipient.user_id}),and(sender_id.eq.${recipient.user_id},recipient_id.eq.${currentUserId})`
          )
          .order("created_at", { ascending: true }),
        supabase
          .from("rings")
          .select("id")
          .eq("circle_id", circle.id)
          .eq("sender_id", currentUserId)
          .eq("recipient_id", recipient.user_id)
          .gte("created_at", since10m)
          .limit(1),
      ]
    );

    if (!fetchError && data) {
      setMessages(data);
      scrollToBottom();
    }
    setIsRung(Boolean(ringData && ringData.length > 0));
    setLoading(false);
  }, [circle.id, currentUserId, recipient.user_id, scrollToBottom]);

  useEffect(() => {
    setLoading(true);
    loadDMs();
  }, [loadDMs]);

  // Live Supabase Realtime Subscription for 1-on-1 DMs
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`dm-${circle.id}-${currentUserId}-${recipient.user_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `circle_id=eq.${circle.id}`,
        },
        (payload) => {
          const newMsg = payload.new as DirectMessageRow;
          const isThisPair =
            (newMsg.sender_id === currentUserId &&
              newMsg.recipient_id === recipient.user_id) ||
            (newMsg.sender_id === recipient.user_id &&
              newMsg.recipient_id === currentUserId);

          if (!isThisPair) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [circle.id, currentUserId, recipient.user_id, scrollToBottom]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    setSending(true);
    setError(null);
    const supabase = createClient();

    try {
      const { data: inserted, error: insertError } = await supabase
        .from("messages")
        .insert({
          circle_id: circle.id,
          sender_id: currentUserId,
          recipient_id: recipient.user_id,
          parent_id: null,
          content: text.trim(),
          image_url: null,
        })
        .select("id, circle_id, sender_id, recipient_id, content, created_at")
        .single();

      if (insertError) throw insertError;

      if (inserted) {
        setMessages((prev) =>
          prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]
        );
        scrollToBottom();
      }
      setText("");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not send direct message."
      );
    } finally {
      setSending(false);
    }
  }

  async function handleQuickRing() {
    if (isRung) return;
    const supabase = createClient();
    const ringMessage = "Praying for your time in the Word today";
    const { error: ringError } = await supabase.from("rings").insert({
      circle_id: circle.id,
      sender_id: currentUserId,
      recipient_id: recipient.user_id,
      message: ringMessage,
    });
    if (!ringError) {
      setIsRung(true);
      triggerRingPush({
        circleId: circle.id,
        recipientId: recipient.user_id,
        message: ringMessage,
      });
    }
  }

  const shortName = recipient.display_name.split(" ")[0];

  return (
    <div className="fixed inset-0 z-40 bg-[#FAF9F6] flex flex-col pb-16">
      <div className="max-w-xl w-full mx-auto flex-1 flex flex-col min-h-0">
        {/* Top 1-on-1 DM Header matching docs/ui-reference.html */}
        <div className="px-4 py-3 bg-[#FAF9F6] border-b border-[#E6E1D6] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to Circles"
              className="w-8 h-8 rounded-full hover:bg-[#F4F1EA] flex items-center justify-center text-[#1F2937] shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => onOpenMemberCard?.(recipient)}
              className="flex items-center gap-2.5 text-left min-w-0 group cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full overflow-hidden bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center text-xs font-semibold shrink-0">
                {recipient.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={recipient.avatar_url}
                    alt={recipient.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  getInitials(recipient.display_name)
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] font-semibold text-[#1F2937] truncate group-hover:text-[#4A6B5D]">
                    {recipient.display_name}
                  </span>
                  {recipient.role === "leader" && (
                    <span className="px-1.5 py-[1px] rounded text-[9.5px] font-semibold bg-[#EBF1EE] text-[#4A6B5D]">
                      Leader
                    </span>
                  )}
                </div>
                <p className="text-[10.5px] text-[#6B7280]">
                  Tap for shared notes
                </p>
              </div>
            </button>
          </div>

          {/* Quick Ring Bell Button (10m cooldown) */}
          <button
            type="button"
            disabled={isRung}
            onClick={handleQuickRing}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
              isRung
                ? "bg-[#F4F1EA] border-[#E6E1D6] text-[#6B7280]"
                : "bg-[#FBF5EE] border-[#E7D3BC] text-[#B47B44] hover:bg-[#F6EAD9]"
            }`}
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>{isRung ? "Rung" : "Ring"}</span>
          </button>
        </div>

        {/* Subtle Privacy Banner */}
        <div className="px-4 py-2 bg-[#F4F1EA] border-b border-[#E6E1D6] flex items-center justify-center gap-1.5 text-[11px] text-[#6B7280] shrink-0">
          <Lock className="w-3.5 h-3.5 text-[#4A6B5D] shrink-0" />
          <span className="truncate">
            Private 1-on-1 conversation · Only visible to you and {shortName}
          </span>
        </div>

        {/* Scrollable DM Messages */}
        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        >
          {loading ? (
            <div className="py-12 flex items-center justify-center text-xs text-[#6B7280]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading conversation...
            </div>
          ) : messages.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-white border border-[#E6E1D6] text-xs text-[#6B7280]">
              No messages with {shortName} yet. Send a quiet word of
              encouragement below.
            </div>
          ) : (
            messages.map((m) => {
              const isMine = m.sender_id === currentUserId;
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${
                    isMine ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                      isMine
                        ? "bg-[#4A6B5D] text-white rounded-br-sm"
                        : "bg-white border border-[#E6E1D6] text-[#1F2937] rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                  <span className="text-[10px] text-[#6B7280] mt-1 px-1">
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {error && (
          <div className="px-4 py-1.5 bg-red-50 text-xs text-red-600 text-center">
            {error}
          </div>
        )}

        {/* DM Reply Input Bar */}
        <form
          onSubmit={handleSend}
          className="px-4 py-3 bg-[#FAF9F6] border-t border-[#E6E1D6] flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Message ${shortName}...`}
            className="flex-1 bg-white border border-[#E6E1D6] rounded-full px-4 py-2 text-[13px] text-[#1F2937] placeholder-[#6B7280] focus:outline-none focus:border-[#4A6B5D]"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            aria-label="Send direct message"
            className="w-9 h-9 rounded-full bg-[#4A6B5D] hover:bg-[#3D5A4E] disabled:opacity-50 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
