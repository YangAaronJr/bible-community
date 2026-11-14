"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Lock, Send, Shield, X } from "lucide-react";
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
}

export default function DirectMessageDrawer({
  circle,
  currentUserId,
  recipient,
  onClose,
}: DirectMessageDrawerProps) {
  const [messages, setMessages] = useState<DirectMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDMs = useCallback(async () => {
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("messages")
      .select("id, circle_id, sender_id, recipient_id, content, created_at")
      .eq("circle_id", circle.id)
      .not("recipient_id", "is", null)
      .or(
        `and(sender_id.eq.${currentUserId},recipient_id.eq.${recipient.user_id}),and(sender_id.eq.${recipient.user_id},recipient_id.eq.${currentUserId})`
      )
      .order("created_at", { ascending: true });

    if (!fetchError && data) {
      setMessages(data);
    }
    setLoading(false);
  }, [circle.id, currentUserId, recipient.user_id]);

  useEffect(() => {
    setLoading(true);
    loadDMs();
  }, [loadDMs]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    setSending(true);
    setError(null);
    const supabase = createClient();

    try {
      const { error: insertError } = await supabase.from("messages").insert({
        circle_id: circle.id,
        sender_id: currentUserId,
        recipient_id: recipient.user_id,
        parent_id: null,
        content: text.trim(),
        image_url: null,
      });

      if (insertError) throw insertError;

      setText("");
      await loadDMs();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not send direct message."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-[1px]">
      <div className="w-full max-w-md bg-[#FAF9F6] h-full shadow-xl border-l border-[#E5E0D8] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-white border-b border-[#E5E0D8] flex items-center justify-between">
          <div>
            <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-[#4B6F5B] font-semibold">
              <Lock className="w-3 h-3" />
              1-on-1 Fellowship • {circle.name}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <h3 className="text-lg font-serif font-semibold text-[#1F2937]">
                {recipient.display_name}
              </h3>
              {recipient.role === "leader" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E3EBE6] text-[#3D5A4A] text-[10px] font-semibold">
                  <Shield className="w-2.5 h-2.5" />
                  Leader / Pastor
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#596579] hover:text-[#1F2937] hover:bg-[#F3EFEA] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {loading ? (
            <div className="py-12 flex items-center justify-center text-xs text-[#596579]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading private conversation...
            </div>
          ) : messages.length === 0 ? (
            <div className="p-6 text-center rounded-xl bg-white border border-[#E5E0D8] text-xs text-[#596579]">
              No private messages with {recipient.display_name} yet. Send a
              quiet word of encouragement or prayer request below.
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
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                      isMine
                        ? "bg-[#4B6F5B] text-white"
                        : "bg-white border border-[#E5E0D8] text-[#1F2937]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                  <span className="text-[10px] text-[#596579] mt-1 px-1">
                    {new Date(m.created_at).toLocaleTimeString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Compose Form */}
        <form
          onSubmit={handleSend}
          className="p-4 bg-white border-t border-[#E5E0D8] space-y-2"
        >
          {error && (
            <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              required
              placeholder={`Message ${recipient.display_name}...`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#E5E0D8] bg-[#FAF9F6] text-xs text-[#1F2937] focus:outline-none focus:border-[#4B6F5B]"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#4B6F5B] hover:bg-[#3D5A4A] disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              {sending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Send</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
