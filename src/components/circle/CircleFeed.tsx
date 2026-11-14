"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import {
  Camera,
  CornerDownRight,
  Loader2,
  MessageSquare,
  Send,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
}

export default function CircleFeed({
  circle,
  members,
  currentUserId,
}: CircleFeedProps) {
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // New top-level post state
  const [content, setContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Nested reply state
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [postingReply, setPostingReply] = useState(false);

  const memberMap = new Map(members.map((m) => [m.user_id, m]));

  const loadFeed = useCallback(async () => {
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("messages")
      .select(
        "id, circle_id, sender_id, recipient_id, parent_id, content, image_url, created_at"
      )
      .eq("circle_id", circle.id)
      .is("recipient_id", null)
      .order("created_at", { ascending: false });

    if (!fetchError && data) {
      setMessages(data);
    }
    setLoading(false);
  }, [circle.id]);

  useEffect(() => {
    setLoading(true);
    loadFeed();
  }, [loadFeed]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPG, PNG, WEBP).");
      return;
    }
    setError(null);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
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

      const postText =
        content.trim() || "Shared a handwritten notebook reflection";

      const { error: insertError } = await supabase.from("messages").insert({
        circle_id: circle.id,
        sender_id: currentUserId,
        recipient_id: null,
        parent_id: null,
        content: postText,
        image_url: uploadedImageUrl,
      });

      if (insertError) throw insertError;

      setContent("");
      clearSelectedFile();
      await loadFeed();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to post to Circle feed."
      );
    } finally {
      setPosting(false);
    }
  }

  async function handleCreateReply(e: React.FormEvent, parentId: string) {
    e.preventDefault();
    if (!replyContent.trim()) return;

    setPostingReply(true);
    const supabase = createClient();

    try {
      const { error: insertError } = await supabase.from("messages").insert({
        circle_id: circle.id,
        sender_id: currentUserId,
        recipient_id: null,
        parent_id: parentId,
        content: replyContent.trim(),
        image_url: null,
      });

      if (insertError) throw insertError;

      setReplyContent("");
      setReplyingToId(null);
      await loadFeed();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not post reply.");
    } finally {
      setPostingReply(false);
    }
  }

  async function handleDeleteMessage(id: string) {
    const supabase = createClient();
    await supabase.from("messages").delete().eq("id", id);
    await loadFeed();
  }

  // Separate top-level posts (newest first) and nested replies (oldest first per thread)
  const topLevelPosts = messages.filter((m) => m.parent_id === null);
  const repliesByParent = new Map<string, FeedMessage[]>();

  for (const m of [...messages].reverse()) {
    if (m.parent_id) {
      const list = repliesByParent.get(m.parent_id) || [];
      list.push(m);
      repliesByParent.set(m.parent_id, list);
    }
  }

  return (
    <section className="space-y-6">
      {/* Compose Post & Notebook Photo Upload Card */}
      <form
        onSubmit={handleCreatePost}
        className="bg-white border border-[#E5E0D8] rounded-2xl p-5 space-y-4 shadow-2xs"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-serif font-semibold text-[#1F2937]">
            Share with {circle.name}
          </h3>
          <span className="text-[11px] text-[#596579]">
            Reflections • Verse Notes • Physical Notebook Photos
          </span>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}

        <textarea
          rows={3}
          placeholder="Share a reflection, a question from your reading, or attach a photo of your handwritten notebook page..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full p-3.5 rounded-xl border border-[#E5E0D8] bg-[#FAF9F6] text-sm text-[#1F2937] focus:outline-none focus:border-[#4B6F5B]"
        />

        {previewUrl && (
          <div className="relative inline-block rounded-xl overflow-hidden border border-[#E5E0D8] bg-[#FAF9F6]">
            <Image
              src={previewUrl}
              alt="Notebook page preview"
              width={260}
              height={200}
              unoptimized
              className="max-h-48 w-auto object-cover"
            />
            <button
              type="button"
              onClick={clearSelectedFile}
              className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
              id="notebook-photo-input"
            />
            <label
              htmlFor="notebook-photo-input"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E5E0D8] bg-[#FAF9F6] hover:bg-[#F3EFEA] text-xs font-medium text-[#1F2937] transition-colors cursor-pointer"
            >
              <Camera className="w-4 h-4 text-[#4B6F5B]" />
              <span>Upload Physical Notebook Photo</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={posting || (!content.trim() && !selectedFile)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#4B6F5B] hover:bg-[#3D5A4A] disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer"
          >
            {posting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Post to Circle</span>
          </button>
        </div>
      </form>

      {/* Main Circle Feed */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#596579]">
          Circle Fellowship Stream ({topLevelPosts.length})
        </h3>

        {loading ? (
          <div className="p-8 bg-white border border-[#E5E0D8] rounded-2xl flex items-center justify-center text-sm text-[#596579]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading circle reflections...
          </div>
        ) : topLevelPosts.length === 0 ? (
          <div className="p-8 bg-white border border-[#E5E0D8] rounded-2xl text-center space-y-1">
            <p className="text-sm font-serif font-medium text-[#1F2937]">
              Quiet Sanctuary
            </p>
            <p className="text-xs text-[#596579]">
              No reflections posted yet. Share a thought from today&apos;s
              reading or a photo of your handwritten notes above.
            </p>
          </div>
        ) : (
          topLevelPosts.map((post) => {
            const author = memberMap.get(post.sender_id);
            const authorName = author?.display_name || "Fellow Reader";
            const isLeader = author?.role === "leader";
            const replies = repliesByParent.get(post.id) || [];
            const isReplying = replyingToId === post.id;

            return (
              <article
                key={post.id}
                className="bg-white border border-[#E5E0D8] rounded-2xl p-5 space-y-3 shadow-2xs"
              >
                {/* Post Author & Timestamp */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#1F2937]">
                      {authorName}
                    </span>
                    {isLeader && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E3EBE6] text-[#3D5A4A] text-[10px] font-semibold">
                        <Shield className="w-2.5 h-2.5" />
                        Leader / Pastor
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[#596579]">
                    <span>
                      {new Date(post.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    {post.sender_id === currentUserId && (
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(post.id)}
                        title="Delete post"
                        className="text-[#596579] hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Post Content */}
                <p className="text-sm text-[#1F2937] whitespace-pre-wrap leading-relaxed">
                  {post.content}
                </p>

                {/* Attached Handwritten Notebook Photo */}
                {post.image_url && (
                  <div className="pt-1">
                    <a
                      href={post.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded-xl overflow-hidden border border-[#E5E0D8] bg-[#FAF9F6]"
                    >
                      <Image
                        src={post.image_url}
                        alt="Uploaded physical notebook page"
                        width={600}
                        height={450}
                        className="max-h-96 w-auto object-contain"
                      />
                    </a>
                  </div>
                )}

                {/* Reply Toggle Button */}
                <div className="pt-1 flex items-center gap-4 border-t border-[#F3EFEA]">
                  <button
                    type="button"
                    onClick={() =>
                      setReplyingToId(isReplying ? null : post.id)
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4B6F5B] hover:text-[#3D5A4A] pt-2 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>
                      {replies.length > 0
                        ? `${replies.length} ${
                            replies.length === 1 ? "Reply" : "Replies"
                          } • Add Reply`
                        : "Reply"}
                    </span>
                  </button>
                </div>

                {/* Nested Thread Replies */}
                {replies.length > 0 && (
                  <div className="pl-4 border-l-2 border-[#E3EBE6] space-y-2.5 pt-1">
                    {replies.map((reply) => {
                      const replyAuthor = memberMap.get(reply.sender_id);
                      return (
                        <div
                          key={reply.id}
                          className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E5E0D8] space-y-1"
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <CornerDownRight className="w-3 h-3 text-[#4B6F5B]" />
                              <span className="font-semibold text-[#1F2937]">
                                {replyAuthor?.display_name || "Fellow Reader"}
                              </span>
                              {replyAuthor?.role === "leader" && (
                                <span className="px-1.5 py-0.2 rounded-full bg-[#E3EBE6] text-[#3D5A4A] text-[9px] font-semibold">
                                  Leader
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[#596579]">
                              <span>
                                {new Date(reply.created_at).toLocaleDateString(
                                  undefined,
                                  { month: "short", day: "numeric" }
                                )}
                              </span>
                              {reply.sender_id === currentUserId && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(reply.id)}
                                  className="hover:text-red-600 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-[#1F2937] whitespace-pre-wrap leading-relaxed">
                            {reply.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Inline Reply Composer */}
                {isReplying && (
                  <form
                    onSubmit={(e) => handleCreateReply(e, post.id)}
                    className="flex gap-2 pt-2"
                  >
                    <input
                      type="text"
                      required
                      placeholder={`Reply to ${authorName}...`}
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-[#E5E0D8] bg-[#FAF9F6] text-xs text-[#1F2937] focus:outline-none focus:border-[#4B6F5B]"
                    />
                    <button
                      type="submit"
                      disabled={postingReply || !replyContent.trim()}
                      className="px-3.5 py-2 rounded-xl bg-[#4B6F5B] hover:bg-[#3D5A4A] disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
                    >
                      Send
                    </button>
                  </form>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
