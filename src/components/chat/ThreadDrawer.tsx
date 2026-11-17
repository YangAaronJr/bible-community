"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Loader2, Send, Trash2, X } from "lucide-react";
import { extractStorageObjectPath } from "@/lib/storage/paths";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";
import {
  formatChatTime,
  parseScriptureRef,
  parseThreadTopic,
  renderChatAvatar,
  type ChatMessageRow,
  type ChatParticipant,
} from "@/components/chat/ChatThread";

interface ThreadDrawerProps {
  rootMessage: ChatMessageRow;
  replies: ChatMessageRow[];
  mode: "circle" | "dm" | "circle-dm";
  threadId: string;
  currentUserId: string;
  peerUserId?: string;
  participantMap: Map<string, ChatParticipant>;
  onClose: () => void;
  onReplyInserted: (inserted: ChatMessageRow) => void;
  onDeleteReply: (id: string) => void;
  onSelectParticipant?: (participant: ChatParticipant) => void;
}

export default function ThreadDrawer({
  rootMessage,
  replies,
  mode,
  threadId,
  currentUserId,
  peerUserId,
  participantMap,
  onClose,
  onReplyInserted,
  onDeleteReply,
  onSelectParticipant,
}: ThreadDrawerProps) {
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedImageEntry, setSignedImageEntry] = useState<{
    raw: string;
    url: string;
  } | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const raw = rootMessage.image_url;
    const objectPath = extractStorageObjectPath(raw, "notebook-uploads");
    if (!raw || !objectPath) return;

    let cancelled = false;
    const supabase = createClient();

    supabase.storage
      .from("notebook-uploads")
      .createSignedUrl(objectPath, 3600)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) {
          setSignedImageEntry({ raw, url: data.signedUrl });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [rootMessage.image_url]);

  useEffect(() => {
    setTimeout(() => {
      if (scrollerRef.current) {
        scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      }
      inputRef.current?.focus();
    }, 40);
  }, [rootMessage.id, replies.length]);

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = replyText.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    const supabase = createClient();

    try {
      const payload: Database["public"]["Tables"]["messages"]["Insert"] = {
        circle_id: mode === "dm" ? null : threadId,
        friendship_id: mode === "dm" ? threadId : null,
        sender_id: currentUserId,
        recipient_id: mode === "circle" ? null : (peerUserId ?? null),
        parent_id: rootMessage.id,
        content: trimmed,
        image_url: null,
        ocr_text: null,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("messages")
        .insert(payload)
        .select(
          "id, circle_id, friendship_id, sender_id, recipient_id, parent_id, content, image_url, ocr_text, created_at"
        )
        .single();

      if (insertError) throw insertError;

      if (inserted) {
        onReplyInserted(inserted);
      }
      setReplyText("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send reply.");
    } finally {
      setSending(false);
    }
  }

  const rootAuthor = participantMap.get(rootMessage.sender_id);
  const rootAuthorName = rootAuthor?.display_name || "Fellow Reader";
  const topic = parseThreadTopic(rootMessage.content);
  const isRootPrayer = rootMessage.content.startsWith("[Prayer]");
  const rootDisplayContent = topic.isTopicThread
    ? topic.body
    : isRootPrayer
      ? rootMessage.content.replace(/^\[Prayer\]\s*/, "")
      : rootMessage.content;
  const rootScriptureRef = parseScriptureRef(rootDisplayContent);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px] flex justify-end"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#FAF9F6] h-full border-l border-[#E6E1D6] shadow-2xl flex flex-col"
      >
        {/* Drawer Header */}
        <div className="px-4 py-3.5 bg-white border-b border-[#E6E1D6] flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h3 className="font-editorial text-lg font-semibold text-[#1F2937] leading-tight truncate">
              {topic.isTopicThread ? topic.title : "Thread"}
            </h3>
            <p className="text-[11px] text-[#6B7280] truncate">
              {topic.isTopicThread ? "Topic chat · " : ""}
              {replies.length === 0
                ? "No messages yet"
                : `${replies.length} ${
                    replies.length === 1 ? "message" : "messages"
                  }`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close thread drawer"
            className="p-1.5 rounded-full bg-[#F4F1EA] text-[#6B7280] hover:text-[#1F2937] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pinned Topic Intro / Root Message */}
        {(rootDisplayContent || rootMessage.image_url || !topic.isTopicThread) && (
          <div className="px-4 py-3 bg-[#F4F1EA] border-b border-[#E6E1D6] max-h-44 overflow-y-auto shrink-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => rootAuthor && onSelectParticipant?.(rootAuthor)}
                className="flex items-center gap-2 min-w-0 cursor-pointer"
              >
                {renderChatAvatar(rootAuthor, 26)}
                <span className="text-xs font-semibold text-[#1F2937] truncate">
                  {rootAuthorName}
                </span>
                {isRootPrayer && (
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-semibold bg-[#4A6B5D] text-white">
                    Prayer
                  </span>
                )}
              </button>
              <span className="text-[10.5px] text-[#6B7280] shrink-0">
                {formatChatTime(rootMessage.created_at)}
              </span>
            </div>

            {rootMessage.image_url && (
              signedImageEntry?.raw === rootMessage.image_url ? (
                <div className="rounded-xl overflow-hidden border border-[#E6E1D6] bg-white max-h-24">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signedImageEntry.url}
                    alt="Notebook attachment"
                    className="w-full h-24 object-cover"
                  />
                </div>
              ) : (
                <div className="h-20 rounded-xl border border-[#E6E1D6] bg-white flex items-center justify-center text-[11px] text-[#6B7280]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Loading image...
                </div>
              )
            )}

            {rootScriptureRef && (
              <Link
                href={`/reader?book=${encodeURIComponent(rootScriptureRef.book)}&chapter=${rootScriptureRef.chapter}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#EBF1EE] text-[#4A6B5D] text-[10.5px] font-semibold"
              >
                <BookOpen className="w-3 h-3" />
                <span>{rootScriptureRef.label}</span>
              </Link>
            )}

            {rootDisplayContent && (
              <p className="text-[13px] leading-relaxed text-[#1F2937] whitespace-pre-wrap">
                {rootDisplayContent}
              </p>
            )}
          </div>
        )}

        {/* Chronological Replies */}
        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        >
          {replies.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-white border border-[#E6E1D6] text-xs text-[#6B7280]">
              No messages yet. Start the conversation on this topic below.
            </div>
          ) : (
            replies.map((reply) => {
              const author = participantMap.get(reply.sender_id);
              const authorName = author?.display_name || "Fellow Reader";
              const isMe = reply.sender_id === currentUserId;
              return (
                <div
                  key={reply.id}
                  className="flex items-start gap-2.5 bg-white border border-[#E6E1D6] rounded-2xl p-3 shadow-2xs"
                >
                  <button
                    type="button"
                    onClick={() => author && onSelectParticipant?.(author)}
                    className="shrink-0 mt-0.5 cursor-pointer"
                  >
                    {renderChatAvatar(author, 28)}
                  </button>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#1F2937] truncate">
                        {authorName}
                      </span>
                      <div className="flex items-center gap-2 text-[10.5px] text-[#6B7280] shrink-0">
                        <span>{formatChatTime(reply.created_at)}</span>
                        {isMe && (
                          <button
                            type="button"
                            onClick={() => onDeleteReply(reply.id)}
                            aria-label="Delete reply"
                            className="hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[13px] leading-relaxed text-[#1F2937] whitespace-pre-wrap">
                      {reply.content}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {error && (
          <div className="px-4 py-1.5 bg-red-50 text-xs text-red-600 text-center shrink-0">
            {error}
          </div>
        )}

        {/* Dedicated Reply Composer */}
        <form
          onSubmit={handleSendReply}
          className="px-4 py-3 bg-white border-t border-[#E6E1D6] flex items-center gap-2 shrink-0"
        >
          <input
            ref={inputRef}
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={
              topic.isTopicThread
                ? "Message in this topic..."
                : "Write a reply in this thread..."
            }
            className="flex-1 bg-[#FAF9F6] border border-[#E6E1D6] rounded-full px-4 py-2 text-[13px] text-[#1F2937] placeholder-[#6B7280] focus:outline-none focus:border-[#4A6B5D]"
          />
          <button
            type="submit"
            disabled={sending || !replyText.trim()}
            aria-label="Send reply"
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
