"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  BookOpen,
  Camera,
  ChevronLeft,
  FileText,
  Heart,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { getInitials } from "@/components/ui/Navbar";
import { createClient } from "@/lib/supabase/client";
import CircleDocsView from "@/components/circle/CircleDocsView";
import type {
  CircleInfo,
  CircleMemberProfile,
} from "@/components/circle/CircleManager";

interface FeedMessage {
  id: string;
  circle_id: string;
  sender_id: string;
  recipient_id: string | null;
  parent_id: string | null;
  content: string;
  image_url: string | null;
  created_at: string;
}

interface CircleFeedProps {
  circle: CircleInfo;
  members: CircleMemberProfile[];
  currentUserId: string;
  onBack?: () => void;
  onSelectMember?: (member: CircleMemberProfile) => void;
}

function formatChatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderChatAvatar(
  member: CircleMemberProfile | undefined,
  sizePx = 34
) {
  const name = member?.display_name || "Fellow Reader";
  return (
    <div
      style={{ width: sizePx, height: sizePx }}
      className="rounded-full overflow-hidden bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center font-semibold text-[11px] shrink-0 select-none"
    >
      {member?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.avatar_url}
          alt={name}
          className="w-full h-full object-cover"
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}

export default function CircleFeed({
  circle,
  members,
  currentUserId,
  onBack,
  onSelectMember,
}: CircleFeedProps) {
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const [content, setContent] = useState("");
  const [composeMode, setComposeMode] = useState<"text" | "prayer">("text");
  const [showAttachmentTray, setShowAttachmentTray] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [replyingTo, setReplyingTo] = useState<FeedMessage | null>(null);
  const [prayingIds, setPrayingIds] = useState<Set<string>>(new Set());
  const [showDocs, setShowDocs] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const memberMap = new Map(members.map((m) => [m.user_id, m]));

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollerRef.current) {
        scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      }
    }, 40);
  }, []);

  const loadFeed = useCallback(async () => {
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("messages")
      .select(
        "id, circle_id, sender_id, recipient_id, parent_id, content, image_url, created_at"
      )
      .eq("circle_id", circle.id)
      .is("recipient_id", null)
      .order("created_at", { ascending: true });

    if (!fetchError && data) {
      setMessages(data);
      scrollToBottom();
    }
    setLoading(false);
  }, [circle.id, scrollToBottom]);

  useEffect(() => {
    setLoading(true);
    loadFeed();
  }, [loadFeed]);

  // Live Supabase Realtime Subscription on messages
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`circle-group-chat-${circle.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `circle_id=eq.${circle.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newMsg = payload.new as FeedMessage;
            if (newMsg.recipient_id !== null) return;
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            scrollToBottom();
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string })?.id;
            if (oldId) {
              setMessages((prev) => prev.filter((m) => m.id !== oldId));
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as FeedMessage;
            setMessages((prev) =>
              prev.map((m) => (m.id === updated.id ? updated : m))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [circle.id, scrollToBottom]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    setError(null);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setShowAttachmentTray(false);
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!content.trim() && !selectedFile) return;

    setPosting(true);
    setError(null);
    const supabase = createClient();

    try {
      let uploadedImageUrl: string | null = null;

      if (selectedFile) {
        const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${currentUserId}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("notebook-uploads")
          .upload(filePath, selectedFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("notebook-uploads")
          .getPublicUrl(filePath);

        uploadedImageUrl = publicUrlData.publicUrl;
      }

      const rawText =
        content.trim() || "Shared a page from my physical study journal.";
      const finalContent =
        composeMode === "prayer" && !rawText.startsWith("[Prayer]")
          ? `[Prayer] ${rawText}`
          : rawText;

      const { data: inserted, error: insertError } = await supabase
        .from("messages")
        .insert({
          circle_id: circle.id,
          sender_id: currentUserId,
          recipient_id: null,
          parent_id: replyingTo ? replyingTo.id : null,
          content: finalContent,
          image_url: uploadedImageUrl,
        })
        .select(
          "id, circle_id, sender_id, recipient_id, parent_id, content, image_url, created_at"
        )
        .single();

      if (insertError) throw insertError;

      if (inserted) {
        setMessages((prev) =>
          prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]
        );
        scrollToBottom();
      }

      setContent("");
      setComposeMode("text");
      setReplyingTo(null);
      setShowAttachmentTray(false);
      clearSelectedFile();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setPosting(false);
    }
  }

  async function handleDeleteMessage(id: string) {
    const supabase = createClient();
    await supabase.from("messages").delete().eq("id", id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  function togglePrayer(msgId: string) {
    setPrayingIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }

  const topLevelPosts = messages.filter((m) => m.parent_id === null);
  const repliesByParent = new Map<string, FeedMessage[]>();

  for (const m of messages) {
    if (m.parent_id) {
      const list = repliesByParent.get(m.parent_id) || [];
      list.push(m);
      repliesByParent.set(m.parent_id, list);
    }
  }

  if (showDocs) {
    return (
      <CircleDocsView
        circle={circle}
        members={members}
        currentUserId={currentUserId}
        onBack={() => setShowDocs(false)}
      />
    );
  }

  return (
    <div className="bg-[#FAF9F6] border border-[#E6E1D6] rounded-3xl overflow-hidden flex flex-col h-[calc(100dvh-9.5rem)] shadow-2xs">
      {/* Top Group Chat Bar matching docs/ui-reference.html */}
      <div className="px-4 py-2.5 bg-[#FAF9F6] border-b border-[#E6E1D6] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to Circles"
              className="w-8 h-8 rounded-full hover:bg-[#F4F1EA] flex items-center justify-center text-[#1F2937] shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[#1F2937] truncate">
              {circle.name}
            </h2>
            <p className="text-[11px] text-[#6B7280]">
              {members.length} members · Live fellowship
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowDocs(true)}
          title="Open Shared Circle Docs"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EBF1EE] hover:bg-[#DCE7E1] text-[#4A6B5D] text-xs font-semibold transition-colors shrink-0 cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Docs</span>
        </button>
      </div>

      {/* Scrollable Message Feed */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4"
      >
        {loading ? (
          <div className="py-12 flex items-center justify-center text-xs text-[#6B7280]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading live fellowship...
          </div>
        ) : topLevelPosts.length === 0 ? (
          <div className="py-12 text-center space-y-1">
            <p className="font-editorial text-base font-medium text-[#1F2937]">
              Quiet Fellowship Space
            </p>
            <p className="text-xs text-[#6B7280]">
              Share a reflection, prayer request, or handwritten notebook photo
              below.
            </p>
          </div>
        ) : (
          topLevelPosts.map((msg) => {
            const author = memberMap.get(msg.sender_id);
            const authorName = author?.display_name || "Fellow Reader";
            const isLeader = author?.role === "leader";
            const isMe = msg.sender_id === currentUserId;
            const replies = repliesByParent.get(msg.id) || [];
            const isPrayer = msg.content.startsWith("[Prayer]");
            const displayContent = isPrayer
              ? msg.content.replace(/^\[Prayer\]\s*/, "")
              : msg.content;
            const isVerseCard = msg.content.startsWith("Reflection —");

            return (
              <div key={msg.id} className="space-y-2">
                {/* 1. Prayer Request Card */}
                {isPrayer ? (
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => author && onSelectMember?.(author)}
                      className="shrink-0 mt-0.5 cursor-pointer"
                    >
                      {renderChatAvatar(author, 34)}
                    </button>
                    <div className="flex-1 bg-[#F3F7F4] border border-[#CFE0D6] rounded-2xl rounded-tl-sm p-3.5">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-[#1F2937]">
                            {authorName}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#4A6B5D] text-white">
                            Prayer Request
                          </span>
                        </div>
                        <span className="text-[10.5px] text-[#6B7280]">
                          {formatChatTime(msg.created_at)}
                        </span>
                      </div>
                      <p className="text-[13px] leading-relaxed text-[#1F2937] mb-3 whitespace-pre-wrap">
                        {displayContent}
                      </p>
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#DCE8E0]">
                        <button
                          type="button"
                          onClick={() => togglePrayer(msg.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                            prayingIds.has(msg.id)
                              ? "bg-[#4A6B5D] text-white"
                              : "bg-white border border-[#CFE0D6] text-[#4A6B5D] hover:bg-[#EBF1EE]"
                          }`}
                        >
                          <Heart className="w-3.5 h-3.5" />
                          <span>
                            {prayingIds.has(msg.id)
                              ? "Praying for you"
                              : `Pray for ${authorName.split(" ")[0]}`}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setReplyingTo(msg)}
                          className="text-[11px] text-[#4A6B5D] font-medium hover:underline cursor-pointer"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  </div>
                ) : msg.image_url ? (
                  /* 2. Handwritten Notebook Photo Card */
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => author && onSelectMember?.(author)}
                      className="shrink-0 mt-0.5 cursor-pointer"
                    >
                      {renderChatAvatar(author, 34)}
                    </button>
                    <div className="flex-1 bg-white border border-[#E6E1D6] rounded-2xl rounded-tl-sm p-3 shadow-2xs">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-[#1F2937]">
                            {authorName}
                          </span>
                          <span className="px-1.5 py-[1px] rounded text-[9.5px] font-medium bg-[#FBF5EE] text-[#B47B44]">
                            Physical Bible
                          </span>
                        </div>
                        <span className="text-[10.5px] text-[#6B7280]">
                          {formatChatTime(msg.created_at)}
                        </span>
                      </div>
                      <div className="mb-2 rounded-xl overflow-hidden border border-[#E6E1D6] bg-[#FAF9F6]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={msg.image_url}
                          alt="Notebook reflection"
                          className="w-full max-h-64 object-cover"
                        />
                      </div>
                      <p className="text-[13px] leading-relaxed text-[#1F2937] whitespace-pre-wrap">
                        {displayContent}
                      </p>
                      <div className="flex items-center justify-end gap-3 mt-1.5">
                        <button
                          type="button"
                          onClick={() => setReplyingTo(msg)}
                          className="text-[11px] font-medium text-[#4A6B5D] hover:underline cursor-pointer"
                        >
                          Reply
                        </button>
                        {isMe && (
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="text-[#6B7280] hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : isVerseCard ? (
                  /* 3. Verse-Anchored Reflection Card */
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => author && onSelectMember?.(author)}
                      className="shrink-0 mt-0.5 cursor-pointer"
                    >
                      {renderChatAvatar(author, 34)}
                    </button>
                    <div className="flex-1 bg-white border border-[#E6E1D6] rounded-2xl rounded-tl-sm p-3.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-[#1F2937]">
                            {authorName}
                          </span>
                          {isLeader && (
                            <span className="px-1.5 py-[1px] rounded text-[9.5px] font-semibold bg-[#EBF1EE] text-[#4A6B5D]">
                              Leader
                            </span>
                          )}
                        </div>
                        <span className="text-[10.5px] text-[#6B7280]">
                          {formatChatTime(msg.created_at)}
                        </span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F4F1EA] text-[#4A6B5D] text-[11.5px] font-medium mb-2">
                        <BookOpen className="w-3 h-3" />
                        <span>Scripture Reflection</span>
                      </div>
                      <p className="text-[13px] leading-relaxed text-[#1F2937] whitespace-pre-wrap">
                        {displayContent}
                      </p>
                      <div className="flex items-center justify-end mt-1.5">
                        <button
                          type="button"
                          onClick={() => setReplyingTo(msg)}
                          className="text-[11px] font-medium text-[#4A6B5D] hover:underline cursor-pointer"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 4. Standard Text Reflection Bubble */
                  <div
                    className={`flex items-start gap-2.5 ${
                      isMe ? "justify-end" : ""
                    }`}
                  >
                    {!isMe && (
                      <button
                        type="button"
                        onClick={() => author && onSelectMember?.(author)}
                        className="shrink-0 mt-0.5 cursor-pointer"
                      >
                        {renderChatAvatar(author, 34)}
                      </button>
                    )}
                    <div
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                        isMe
                          ? "bg-[#4A6B5D] text-white rounded-br-sm"
                          : "bg-white border border-[#E6E1D6] text-[#1F2937] rounded-tl-sm"
                      }`}
                    >
                      {!isMe && (
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="text-[11px] font-semibold text-[#4A6B5D]">
                            {authorName}
                          </p>
                          {isLeader && (
                            <span className="px-1.5 py-[0.5px] rounded text-[9px] font-semibold bg-[#EBF1EE] text-[#4A6B5D]">
                              Leader
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
                        {displayContent}
                      </p>
                      <div
                        className={`flex items-center justify-end gap-2 text-[10px] mt-1 ${
                          isMe ? "text-white/75" : "text-[#6B7280]"
                        }`}
                      >
                        <span>{formatChatTime(msg.created_at)}</span>
                        <button
                          type="button"
                          onClick={() => setReplyingTo(msg)}
                          className="underline cursor-pointer"
                        >
                          Reply
                        </button>
                        {isMe && (
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="hover:text-red-200 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Threaded Replies matching docs/ui-reference.html */}
                {replies.map((reply) => {
                  const replyAuthor = memberMap.get(reply.sender_id);
                  return (
                    <div
                      key={reply.id}
                      className="ml-10 pl-3 border-l-2 border-[#E6E1D6] flex items-start gap-2"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          replyAuthor && onSelectMember?.(replyAuthor)
                        }
                        className="shrink-0 mt-0.5 cursor-pointer"
                      >
                        {renderChatAvatar(replyAuthor, 26)}
                      </button>
                      <div className="bg-[#F4F1EA] rounded-xl px-3 py-2 flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11.5px] font-semibold text-[#1F2937]">
                            {replyAuthor?.display_name || "Fellow Reader"}
                          </span>
                          <span className="text-[10px] text-[#6B7280]">
                            {formatChatTime(reply.created_at)}
                          </span>
                        </div>
                        <p className="text-[12.5px] text-[#1F2937] whitespace-pre-wrap">
                          {reply.content}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* Attachment Tray (+ button) */}
      {showAttachmentTray && (
        <div className="px-4 py-2.5 bg-[#F4F1EA] border-t border-[#E6E1D6] grid grid-cols-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setComposeMode("prayer");
              setShowAttachmentTray(false);
            }}
            className="bg-white border border-[#E6E1D6] hover:border-[#4A6B5D] rounded-xl p-2.5 text-left flex items-center gap-2 transition-colors cursor-pointer"
          >
            <span className="w-7 h-7 rounded-lg bg-[#EBF1EE] text-[#4A6B5D] flex items-center justify-center shrink-0">
              <Heart className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-semibold text-[#1F2937]">
                Prayer Card
              </p>
              <p className="text-[10px] text-[#6B7280]">Ask circle to pray</p>
            </div>
          </button>

          <label className="bg-white border border-[#E6E1D6] hover:border-[#B47B44] rounded-xl p-2.5 text-left flex items-center gap-2 transition-colors cursor-pointer">
            <span className="w-7 h-7 rounded-lg bg-[#FBF5EE] text-[#B47B44] flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-semibold text-[#1F2937]">
                Notebook Photo
              </p>
              <p className="text-[10px] text-[#6B7280]">Upload journal page</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Active Reply / Photo / Prayer Banner */}
      {(replyingTo || previewUrl || composeMode === "prayer" || error) && (
        <div className="px-4 py-2 bg-[#F4F1EA] border-t border-[#E6E1D6] flex items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {error ? (
              <span className="text-red-600 truncate">{error}</span>
            ) : previewUrl ? (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-8 h-8 rounded-lg object-cover border border-[#E6E1D6]"
                />
                <span className="text-[#B47B44] font-medium">
                  Notebook photo attached
                </span>
              </div>
            ) : replyingTo ? (
              <span className="text-[#4A6B5D] font-medium truncate">
                <MessageSquare className="w-3 h-3 inline mr-1" />
                Replying to{" "}
                {memberMap.get(replyingTo.sender_id)?.display_name || "message"}
              </span>
            ) : (
              <span className="text-[#4A6B5D] font-medium">
                Sharing a Prayer Request Card
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setReplyingTo(null);
              setComposeMode("text");
              setError(null);
              clearSelectedFile();
            }}
            className="text-[#6B7280] hover:text-[#1F2937] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Interactive Message Composer */}
      <form
        onSubmit={handleSendMessage}
        className="px-4 py-2.5 bg-[#FAF9F6] border-t border-[#E6E1D6] flex items-center gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={() => setShowAttachmentTray((prev) => !prev)}
          aria-label="Add Prayer Request or Notebook Photo"
          className={`w-9 h-9 rounded-full bg-[#F4F1EA] border border-[#E6E1D6] text-[#1F2937] hover:bg-[#EAE5DA] flex items-center justify-center shrink-0 transition-transform cursor-pointer ${
            showAttachmentTray ? "rotate-45 bg-[#EBF1EE] text-[#4A6B5D]" : ""
          }`}
        >
          <Plus className="w-4 h-4" />
        </button>

        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            replyingTo
              ? "Write a gentle reply..."
              : composeMode === "prayer"
              ? "How can your circle pray for you?"
              : "Share a reflection with the circle..."
          }
          className="flex-1 bg-white border border-[#E6E1D6] rounded-full px-4 py-2 text-[13px] text-[#1F2937] placeholder-[#6B7280] focus:outline-none focus:border-[#4A6B5D]"
        />

        <button
          type="submit"
          disabled={posting || (!content.trim() && !selectedFile)}
          aria-label="Send message"
          className="w-9 h-9 rounded-full bg-[#4A6B5D] hover:bg-[#3D5A4E] disabled:opacity-50 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
        >
          {posting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </form>
    </div>
  );
}
