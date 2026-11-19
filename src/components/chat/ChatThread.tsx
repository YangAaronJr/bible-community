"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  BookOpen,
  Camera,
  ChevronLeft,
  Heart,
  Loader2,
  MessageSquare,
  MessagesSquare,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { getInitials } from "@/components/ui/Navbar";
import { BIBLE_BOOKS } from "@/lib/plans/reading-plans";
import { fetchChapter } from "@/lib/bible/bible-api";
import { extractStorageObjectPath } from "@/lib/storage/paths";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";
import ThreadDrawer from "@/components/chat/ThreadDrawer";
import ThreadsIndexDrawer, {
  type ThreadSummaryItem,
} from "@/components/chat/ThreadsIndexDrawer";

export interface ChatParticipant {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  role?: "member" | "leader";
}

export interface ChatMessageRow {
  id: string;
  circle_id: string | null;
  friendship_id: string | null;
  sender_id: string;
  recipient_id: string | null;
  parent_id: string | null;
  prayer_request_id?: string | null;
  content: string;
  image_url: string | null;
  ocr_text: string | null;
  created_at: string;
}

const MESSAGE_PAGE_SIZE = 50;
const MESSAGE_SELECT_COLS =
  "id, circle_id, friendship_id, sender_id, recipient_id, parent_id, prayer_request_id, content, image_url, ocr_text, created_at";

export interface ChatThreadProps {
  mode: "circle" | "dm" | "circle-dm";
  threadId: string;
  title: string;
  subtitle: string;
  participants: ChatParticipant[];
  currentUserId: string;
  peerUserId?: string;
  headerAvatarUrl?: string | null;
  headerAction?: React.ReactNode;
  privacyNotice?: string;
  onBack?: () => void;
  onSelectParticipant?: (participant: ChatParticipant) => void;
  onMessagesUpdated?: (latestCreatedAt: string | null) => void;
}

export function parseThreadTopic(content: string): {
  isTopicThread: boolean;
  title: string;
  body: string;
} {
  if (!content.startsWith("[Thread]")) {
    return { isTopicThread: false, title: "", body: content };
  }
  const rest = content.replace(/^\[Thread\]\s*/, "");
  const newlineIdx = rest.indexOf("\n");
  if (newlineIdx === -1) {
    return {
      isTopicThread: true,
      title: rest.trim() || "Topic Thread",
      body: "",
    };
  }
  return {
    isTopicThread: true,
    title: rest.slice(0, newlineIdx).trim() || "Topic Thread",
    body: rest.slice(newlineIdx + 1).trim(),
  };
}

export function formatChatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelativeAgo(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function parseScriptureRef(
  text: string
): { label: string; book: string; chapter: number } | null {
  const sortedBooks = [...BIBLE_BOOKS].sort(
    (a, b) => b.name.length - a.name.length
  );
  for (const b of sortedBooks) {
    const escaped = b.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b(${escaped})\\s+(\\d+)(?::(\\d+(?:[-–]\\d+)?))?`, "i");
    const match = text.match(regex);
    if (match) {
      const ch = Number(match[2]);
      if (ch >= 1 && ch <= b.chapters) {
        const versePart = match[3] ? `:${match[3]}` : "";
        return {
          label: `${b.name} ${ch}${versePart}`,
          book: b.name,
          chapter: ch,
        };
      }
    }
  }
  return null;
}

export function renderChatAvatar(
  participant: ChatParticipant | undefined,
  sizePx = 34
) {
  const name = participant?.display_name || "Fellow Reader";
  return (
    <div
      style={{ width: sizePx, height: sizePx }}
      className="rounded-full overflow-hidden bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center font-semibold text-[11px] shrink-0 select-none"
    >
      {participant?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={participant.avatar_url}
          alt={name}
          className="w-full h-full object-cover"
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}

export default function ChatThread({
  mode,
  threadId,
  title,
  subtitle,
  participants,
  currentUserId,
  peerUserId,
  headerAvatarUrl,
  headerAction,
  privacyNotice,
  onBack,
  onSelectParticipant,
  onMessagesUpdated,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [content, setContent] = useState("");
  const [topicTitle, setTopicTitle] = useState("");
  const [composeMode, setComposeMode] = useState<
    "text" | "prayer" | "verse" | "thread"
  >("text");
  const [verseBook, setVerseBook] = useState("John");
  const [verseChapter, setVerseChapter] = useState(1);
  const [verseNumber, setVerseNumber] = useState(14);

  const [showAttachmentTray, setShowAttachmentTray] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractOcr, setExtractOcr] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeThreadRootId, setActiveThreadRootId] = useState<string | null>(
    null
  );
  const [showThreadsIndex, setShowThreadsIndex] = useState(false);
  const [prayerReqResponders, setPrayerReqResponders] = useState<
    Map<string, Set<string>>
  >(new Map());
  const [msgPrayerResponders, setMsgPrayerResponders] = useState<
    Map<string, Set<string>>
  >(new Map());
  const [busyPrayerMsgIds, setBusyPrayerMsgIds] = useState<Set<string>>(
    new Set()
  );
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [signedImageUrls, setSignedImageUrls] = useState<
    Record<string, string>
  >({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const resolvedImageKeysRef = useRef<Set<string>>(new Set());
  const messagesRef = useRef<ChatMessageRow[]>([]);
  const participantMap = new Map(participants.map((p) => [p.user_id, p]));

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollerRef.current) {
        scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      }
    }, 40);
  }, []);

  const buildFilteredQuery = useCallback(
    (supabase: ReturnType<typeof createClient>) => {
      const baseQuery = supabase.from("messages").select(MESSAGE_SELECT_COLS);
      if (mode === "circle") {
        return baseQuery.eq("circle_id", threadId).is("recipient_id", null);
      }
      if (mode === "circle-dm") {
        return baseQuery
          .eq("circle_id", threadId)
          .not("recipient_id", "is", null)
          .or(
            `and(sender_id.eq.${currentUserId},recipient_id.eq.${peerUserId}),and(sender_id.eq.${peerUserId},recipient_id.eq.${currentUserId})`
          );
      }
      return baseQuery.eq("friendship_id", threadId);
    },
    [mode, threadId, currentUserId, peerUserId]
  );

  const loadPrayerResponses = useCallback(async (rows: ChatMessageRow[]) => {
    const prayerReqIds = Array.from(
      new Set(
        rows
          .map((m) => m.prayer_request_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );
    const legacyMsgIds = rows
      .filter((m) => m.content.startsWith("[Prayer]") && !m.prayer_request_id)
      .map((m) => m.id);

    if (prayerReqIds.length === 0 && legacyMsgIds.length === 0) {
      setPrayerReqResponders(new Map());
      setMsgPrayerResponders(new Map());
      return;
    }

    const supabase = createClient();
    const [reqRes, msgRes] = await Promise.all([
      prayerReqIds.length > 0
        ? supabase
            .from("prayer_responses")
            .select("prayer_id, user_id")
            .in("prayer_id", prayerReqIds)
        : Promise.resolve({ data: [] }),
      legacyMsgIds.length > 0
        ? supabase
            .from("message_prayer_responses")
            .select("message_id, user_id")
            .in("message_id", legacyMsgIds)
        : Promise.resolve({ data: [] }),
    ]);

    const nextReqMap = new Map<string, Set<string>>();
    for (const r of reqRes.data || []) {
      if (!nextReqMap.has(r.prayer_id)) {
        nextReqMap.set(r.prayer_id, new Set());
      }
      nextReqMap.get(r.prayer_id)!.add(r.user_id);
    }

    const nextMsgMap = new Map<string, Set<string>>();
    for (const r of msgRes.data || []) {
      if (!nextMsgMap.has(r.message_id)) {
        nextMsgMap.set(r.message_id, new Set());
      }
      nextMsgMap.get(r.message_id)!.add(r.user_id);
    }

    setPrayerReqResponders(nextReqMap);
    setMsgPrayerResponders(nextMsgMap);
  }, []);

  const loadMessages = useCallback(async () => {
    const supabase = createClient();
    const { data: topRows, error: fetchError } = await buildFilteredQuery(
      supabase
    )
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1);

    if (!fetchError && topRows) {
      const hasMore = topRows.length > MESSAGE_PAGE_SIZE;
      const latestTop = topRows.slice(0, MESSAGE_PAGE_SIZE).reverse();
      const topIds = latestTop.map((m) => m.id);

      let replyRows: ChatMessageRow[] = [];
      if (topIds.length > 0) {
        const { data: fetchedReplies } = await buildFilteredQuery(supabase)
          .in("parent_id", topIds)
          .order("created_at", { ascending: true });
        replyRows = fetchedReplies || [];
      }

      const combined = [...latestTop, ...replyRows];
      setMessages(combined);
      setHasOlderMessages(hasMore);
      await loadPrayerResponses(combined);
      const latest =
        combined.length > 0
          ? combined.reduce(
              (max, m) => (m.created_at > max ? m.created_at : max),
              combined[0].created_at
            )
          : null;
      onMessagesUpdated?.(latest);
      scrollToBottom();
    }
    setLoading(false);
  }, [
    buildFilteredQuery,
    loadPrayerResponses,
    onMessagesUpdated,
    scrollToBottom,
  ]);

  useEffect(() => {
    setLoading(true);
    loadMessages();
  }, [loadMessages]);

  async function handleLoadOlderMessages() {
    if (loadingOlder || !hasOlderMessages) return;
    const topLevel = messages.filter((m) => m.parent_id === null);
    if (topLevel.length === 0) return;

    const oldestTopCreatedAt = topLevel.reduce(
      (min, m) => (m.created_at < min ? m.created_at : min),
      topLevel[0].created_at
    );

    const scroller = scrollerRef.current;
    const prevScrollHeight = scroller?.scrollHeight ?? 0;
    const prevScrollTop = scroller?.scrollTop ?? 0;

    setLoadingOlder(true);
    try {
      const supabase = createClient();
      const { data: olderTopRows, error: fetchError } = await buildFilteredQuery(
        supabase
      )
        .is("parent_id", null)
        .lt("created_at", oldestTopCreatedAt)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE + 1);

      if (fetchError || !olderTopRows) return;

      const hasMore = olderTopRows.length > MESSAGE_PAGE_SIZE;
      const olderTop = olderTopRows.slice(0, MESSAGE_PAGE_SIZE).reverse();
      const olderTopIds = olderTop.map((m) => m.id);

      let olderReplies: ChatMessageRow[] = [];
      if (olderTopIds.length > 0) {
        const { data: fetchedReplies } = await buildFilteredQuery(supabase)
          .in("parent_id", olderTopIds)
          .order("created_at", { ascending: true });
        olderReplies = fetchedReplies || [];
      }

      const prepended = [...olderTop, ...olderReplies];
      const nextCombined = (() => {
        const existingIds = new Set(messagesRef.current.map((m) => m.id));
        const uniquePrepended = prepended.filter((m) => !existingIds.has(m.id));
        return [...uniquePrepended, ...messagesRef.current];
      })();

      setMessages(nextCombined);
      setHasOlderMessages(hasMore);
      await loadPrayerResponses(nextCombined);

      requestAnimationFrame(() => {
        if (scrollerRef.current) {
          const newScrollHeight = scrollerRef.current.scrollHeight;
          scrollerRef.current.scrollTop =
            prevScrollTop + (newScrollHeight - prevScrollHeight);
        }
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    const rawUrls = Array.from(
      new Set(
        messages
          .map((m) => m.image_url)
          .filter(
            (u): u is string =>
              typeof u === "string" &&
              u.length > 0 &&
              !resolvedImageKeysRef.current.has(u)
          )
      )
    );
    if (rawUrls.length === 0) return;

    const pathToRaw = new Map<string, string[]>();
    for (const raw of rawUrls) {
      const path = extractStorageObjectPath(raw, "notebook-uploads");
      if (path) {
        const list = pathToRaw.get(path) || [];
        list.push(raw);
        pathToRaw.set(path, list);
      }
    }
    const uniquePaths = Array.from(pathToRaw.keys());
    if (uniquePaths.length === 0) return;

    let cancelled = false;
    const supabase = createClient();

    supabase.storage
      .from("notebook-uploads")
      .createSignedUrls(uniquePaths, 3600)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const updates: Record<string, string> = {};
        for (const item of data) {
          if (item.path) {
            const raws = pathToRaw.get(item.path) || [];
            for (const raw of raws) {
              resolvedImageKeysRef.current.add(raw);
              if (item.signedUrl) {
                updates[raw] = item.signedUrl;
              }
            }
          }
        }
        if (Object.keys(updates).length > 0) {
          setSignedImageUrls((prev) => ({ ...prev, ...updates }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [messages]);

  // Live Supabase Realtime Subscription on messages
  useEffect(() => {
    const supabase = createClient();
    const filterCol = mode === "dm" ? "friendship_id" : "circle_id";
    const channel = supabase
      .channel(`chat-thread-${mode}-${threadId}-${peerUserId || "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `${filterCol}=eq.${threadId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newMsg = payload.new as ChatMessageRow;
            if (mode === "circle" && newMsg.recipient_id !== null) return;
            if (mode === "circle-dm") {
              const isThisPair =
                (newMsg.sender_id === currentUserId &&
                  newMsg.recipient_id === peerUserId) ||
                (newMsg.sender_id === peerUserId &&
                  newMsg.recipient_id === currentUserId);
              if (!isThisPair) return;
            }
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            if (
              newMsg.content.startsWith("[Prayer]") &&
              !messagesRef.current.some((m) => m.id === newMsg.id)
            ) {
              void loadPrayerResponses([...messagesRef.current, newMsg]);
            }
            onMessagesUpdated?.(newMsg.created_at);
            if (newMsg.parent_id === null) {
              scrollToBottom();
            }
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string })?.id;
            if (oldId) {
              setMessages((prev) => prev.filter((m) => m.id !== oldId));
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as ChatMessageRow;
            setMessages((prev) =>
              prev.map((m) => (m.id === updated.id ? updated : m))
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prayer_responses" },
        () => {
          void loadPrayerResponses(messagesRef.current);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_prayer_responses" },
        () => {
          void loadPrayerResponses(messagesRef.current);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    mode,
    threadId,
    currentUserId,
    peerUserId,
    loadPrayerResponses,
    onMessagesUpdated,
    scrollToBottom,
  ]);

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
    setExtractOcr(false);
    setOcrStatus(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (composeMode === "thread" && !topicTitle.trim()) return;
    if (
      composeMode !== "verse" &&
      composeMode !== "thread" &&
      !content.trim() &&
      !selectedFile
    ) {
      return;
    }

    setPosting(true);
    setError(null);
    const supabase = createClient();

    try {
      let uploadedImageUrl: string | null = null;
      let extractedOcrText: string | null = null;

      if (selectedFile) {
        if (extractOcr) {
          setOcrStatus("Scanning handwriting…");
          try {
            const { createWorker } = await import("tesseract.js");
            const worker = await createWorker("eng");
            try {
              const { data } = await worker.recognize(selectedFile);
              const cleaned = data.text?.replace(/\s+/g, " ").trim();
              if (cleaned) extractedOcrText = cleaned;
            } finally {
              await worker.terminate();
            }
          } catch {
            // Best-effort OCR: photo upload continues even if OCR fails
          } finally {
            setOcrStatus(null);
          }
        }

        const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${currentUserId}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("notebook-uploads")
          .upload(filePath, selectedFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        uploadedImageUrl = filePath;
      }

      let finalContent =
        content.trim() || "Shared a page from my physical study journal.";

      if (composeMode === "thread") {
        const cleanTitle = topicTitle.trim();
        const opening = content.trim();
        finalContent = opening
          ? `[Thread] ${cleanTitle}\n${opening}`
          : `[Thread] ${cleanTitle}`;
      } else if (
        composeMode === "prayer" &&
        !finalContent.startsWith("[Prayer]")
      ) {
        finalContent = `[Prayer] ${finalContent}`;
      } else if (composeMode === "verse") {
        let quotedVerse = "";
        try {
          const chData = await fetchChapter(verseBook, verseChapter);
          const match = chData.verses.find((v) => v.verse === verseNumber);
          if (match) quotedVerse = `\n"${match.text}"`;
        } catch {
          // Proceed with reference even if offline
        }
        const noteSuffix = content.trim() ? `\n\n${content.trim()}` : "";
        finalContent = `Reflection — ${verseBook} ${verseChapter}:${verseNumber}${quotedVerse}${noteSuffix}`;
      }

      let linkedPrayerRequestId: string | null = null;
      if (composeMode === "prayer" && mode === "circle") {
        const strippedPrayerText = finalContent
          .replace(/^\[Prayer\]\s*/, "")
          .trim();
        const { data: createdPrayer, error: prayerErr } = await supabase
          .from("prayer_requests")
          .insert({
            circle_id: threadId,
            user_id: currentUserId,
            content: strippedPrayerText,
            is_answered: false,
          })
          .select("id")
          .single();
        if (prayerErr) throw prayerErr;
        linkedPrayerRequestId = createdPrayer?.id ?? null;
      }

      const payload: Database["public"]["Tables"]["messages"]["Insert"] = {
        circle_id: mode === "dm" ? null : threadId,
        friendship_id: mode === "dm" ? threadId : null,
        sender_id: currentUserId,
        recipient_id: mode === "circle" ? null : (peerUserId ?? null),
        parent_id: null,
        prayer_request_id: linkedPrayerRequestId,
        content: finalContent,
        image_url: uploadedImageUrl,
        ocr_text: extractedOcrText,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("messages")
        .insert(payload)
        .select(MESSAGE_SELECT_COLS)
        .single();

      if (insertError) throw insertError;

      const createdTopic = composeMode === "thread";
      if (inserted) {
        setMessages((prev) =>
          prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]
        );
        onMessagesUpdated?.(inserted.created_at);
        scrollToBottom();
        if (createdTopic) {
          setActiveThreadRootId(inserted.id);
        }
      }

      setContent("");
      setTopicTitle("");
      setComposeMode("text");
      setShowAttachmentTray(false);
      clearSelectedFile();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setPosting(false);
    }
  }

  async function handleDeleteMessage(id: string) {
    const target = messages.find((m) => m.id === id);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("messages")
      .delete()
      .eq("id", id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessages((prev) => prev.filter((m) => m.id !== id));

    const objectPath = extractStorageObjectPath(
      target?.image_url,
      "notebook-uploads"
    );
    if (objectPath) {
      try {
        await supabase.storage.from("notebook-uploads").remove([objectPath]);
      } catch {
        // Best-effort storage cleanup; DB deletion already succeeded
      }
    }
  }

  async function togglePrayer(msg: ChatMessageRow) {
    if (busyPrayerMsgIds.has(msg.id)) return;
    const prayerReqId = msg.prayer_request_id ?? null;
    const isCurrentlyPraying = prayerReqId
      ? Boolean(prayerReqResponders.get(prayerReqId)?.has(currentUserId))
      : Boolean(msgPrayerResponders.get(msg.id)?.has(currentUserId));

    const updateSetInMap = (
      prev: Map<string, Set<string>>,
      key: string,
      add: boolean
    ) => {
      const next = new Map(prev);
      const set = new Set(next.get(key) || []);
      if (add) set.add(currentUserId);
      else set.delete(currentUserId);
      next.set(key, set);
      return next;
    };

    if (prayerReqId) {
      setPrayerReqResponders((prev) =>
        updateSetInMap(prev, prayerReqId, !isCurrentlyPraying)
      );
    } else {
      setMsgPrayerResponders((prev) =>
        updateSetInMap(prev, msg.id, !isCurrentlyPraying)
      );
    }

    setBusyPrayerMsgIds((prev) => new Set(prev).add(msg.id));
    const supabase = createClient();

    try {
      if (prayerReqId) {
        if (isCurrentlyPraying) {
          const { error: delErr } = await supabase
            .from("prayer_responses")
            .delete()
            .eq("prayer_id", prayerReqId)
            .eq("user_id", currentUserId);
          if (delErr) throw delErr;
        } else {
          const { error: insErr } = await supabase
            .from("prayer_responses")
            .insert({ prayer_id: prayerReqId, user_id: currentUserId });
          if (insErr) throw insErr;
        }
      } else if (isCurrentlyPraying) {
        const { error: delErr } = await supabase
          .from("message_prayer_responses")
          .delete()
          .eq("message_id", msg.id)
          .eq("user_id", currentUserId);
        if (delErr) throw delErr;
      } else {
        const { error: insErr } = await supabase
          .from("message_prayer_responses")
          .insert({ message_id: msg.id, user_id: currentUserId });
        if (insErr) throw insErr;
      }
    } catch (err: unknown) {
      // Revert optimistic update on failure
      if (prayerReqId) {
        setPrayerReqResponders((prev) =>
          updateSetInMap(prev, prayerReqId, isCurrentlyPraying)
        );
      } else {
        setMsgPrayerResponders((prev) =>
          updateSetInMap(prev, msg.id, isCurrentlyPraying)
        );
      }
      setError(
        err instanceof Error ? err.message : "Could not update prayer response."
      );
    } finally {
      setBusyPrayerMsgIds((prev) => {
        const next = new Set(prev);
        next.delete(msg.id);
        return next;
      });
    }
  }

  const topLevelPosts = messages.filter((m) => m.parent_id === null);
  const repliesByParent = new Map<string, ChatMessageRow[]>();

  for (const m of messages) {
    if (m.parent_id) {
      const list = repliesByParent.get(m.parent_id) || [];
      list.push(m);
      repliesByParent.set(m.parent_id, list);
    }
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visiblePosts = normalizedQuery
    ? topLevelPosts.filter((msg) => {
        const authorName =
          participantMap.get(msg.sender_id)?.display_name?.toLowerCase() || "";
        const selfMatches =
          msg.content.toLowerCase().includes(normalizedQuery) ||
          (msg.ocr_text || "").toLowerCase().includes(normalizedQuery) ||
          authorName.includes(normalizedQuery);
        if (selfMatches) return true;
        const replies = repliesByParent.get(msg.id) || [];
        return replies.some((r) => {
          const rAuthor =
            participantMap.get(r.sender_id)?.display_name?.toLowerCase() || "";
          return (
            r.content.toLowerCase().includes(normalizedQuery) ||
            (r.ocr_text || "").toLowerCase().includes(normalizedQuery) ||
            rAuthor.includes(normalizedQuery)
          );
        });
      })
    : topLevelPosts;

  const activeThreads: ThreadSummaryItem[] = topLevelPosts
    .map((root) => {
      const replies = repliesByParent.get(root.id) || [];
      const topic = parseThreadTopic(root.content);
      if (!topic.isTopicThread && replies.length === 0) return null;
      return {
        root,
        replyCount: replies.length,
        lastReplyAt:
          replies.length > 0
            ? replies[replies.length - 1].created_at
            : root.created_at,
      };
    })
    .filter((t): t is ThreadSummaryItem => t !== null)
    .sort((a, b) => b.lastReplyAt.localeCompare(a.lastReplyAt));

  const activeThreadRoot = activeThreadRootId
    ? messages.find((m) => m.id === activeThreadRootId) || null
    : null;

  const selectedBookMeta =
    BIBLE_BOOKS.find((b) => b.name === verseBook) || BIBLE_BOOKS[0];

  return (
    <div className="bg-[#FAF9F6] flex-1 min-h-0 overflow-hidden flex flex-col">
      {/* Compact Top Chat Header */}
      <div className="px-3 sm:px-4 py-2 bg-[#FAF9F6] border-b border-[#E6E1D6] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="w-7 h-7 rounded-full hover:bg-[#F4F1EA] flex items-center justify-center text-[#1F2937] shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          {(mode === "dm" || mode === "circle-dm") && peerUserId && (
            <Link href={`/members/${peerUserId}`} className="shrink-0">
              {renderChatAvatar(
                {
                  user_id: peerUserId,
                  display_name: title,
                  avatar_url: headerAvatarUrl,
                },
                32
              )}
            </Link>
          )}
          <div className="min-w-0">
            <h2 className="text-[14px] leading-tight font-semibold text-[#1F2937] truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[10.5px] leading-tight text-[#6B7280] truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {headerAction}
          <button
            type="button"
            onClick={() => setShowThreadsIndex(true)}
            aria-label="Open active threads"
            title="Active Threads"
            className="inline-flex items-center gap-1 px-2 sm:px-2.5 h-8 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] text-xs font-medium text-[#1F2937] transition-colors cursor-pointer"
          >
            <MessagesSquare className="w-3.5 h-3.5 text-[#4A6B5D]" />
            <span className="hidden sm:inline">Threads</span>
            {activeThreads.length > 0 && (
              <span className="px-1.5 py-[0.5px] rounded-full bg-[#EBF1EE] text-[#4A6B5D] text-[10px] font-semibold">
                {activeThreads.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowSearch((prev) => {
                if (prev) setSearchQuery("");
                return !prev;
              });
            }}
            aria-label="Search reflections and notebook text"
            title="Search chat & notebook text"
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              showSearch || searchQuery
                ? "bg-[#EBF1EE] text-[#4A6B5D]"
                : "bg-[#F4F1EA] hover:bg-[#EAE5DA] text-[#6B7280]"
            }`}
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Subtle Privacy Notice */}
      {privacyNotice && (
        <div className="px-4 py-1.5 bg-[#F4F1EA] border-b border-[#E6E1D6] text-center text-[11px] text-[#6B7280] shrink-0">
          {privacyNotice}
        </div>
      )}

      {/* Subtle Search Bar (Content + OCR) */}
      {showSearch && (
        <div className="bg-[#FAF9F6] border-b border-[#E6E1D6] shrink-0">
          <div className="px-4 py-2 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages & extracted notebook notes..."
              autoFocus
              className="flex-1 bg-transparent text-xs text-[#1F2937] placeholder-[#6B7280] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="text-[#6B7280] hover:text-[#1F2937] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {hasOlderMessages && (
            <p className="px-4 pb-1.5 text-[10.5px] text-[#6B7280]">
              Searching loaded messages — load older messages above to search
              further back
            </p>
          )}
        </div>
      )}

      {/* Scrollable Message Feed */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4"
      >
        {!loading && hasOlderMessages && (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              disabled={loadingOlder}
              onClick={handleLoadOlderMessages}
              className="px-3.5 py-1.5 rounded-full bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-[11px] font-medium text-[#4A6B5D] inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
            >
              {loadingOlder && <Loader2 className="w-3 h-3 animate-spin" />}
              <span>
                {loadingOlder
                  ? "Loading older messages..."
                  : "Load older messages"}
              </span>
            </button>
          </div>
        )}
        {loading ? (
          <div className="py-12 flex items-center justify-center text-xs text-[#6B7280]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading conversation...
          </div>
        ) : visiblePosts.length === 0 ? (
          <div className="py-12 text-center space-y-1">
            <p className="font-editorial text-base font-medium text-[#1F2937]">
              {normalizedQuery ? "No matching notes" : "Quiet Fellowship Space"}
            </p>
            <p className="text-xs text-[#6B7280]">
              {normalizedQuery
                ? "Try another word from a reflection or notebook scan."
                : "Share a reflection, verse card, prayer request, or handwritten notebook photo below."}
            </p>
          </div>
        ) : (
          visiblePosts.map((msg) => {
            const author = participantMap.get(msg.sender_id);
            const authorName = author?.display_name || "Fellow Reader";
            const isLeader = author?.role === "leader";
            const isMe = msg.sender_id === currentUserId;
            const replies = repliesByParent.get(msg.id) || [];
            const topic = parseThreadTopic(msg.content);
            const isPrayer = msg.content.startsWith("[Prayer]");
            const displayContent = isPrayer
              ? msg.content.replace(/^\[Prayer\]\s*/, "")
              : msg.content;
            const isVerseCard =
              msg.content.startsWith("Reflection —") ||
              msg.content.startsWith("📖 Reflection on") ||
              msg.content.startsWith("📖 Note on");
            const scriptureRef = parseScriptureRef(displayContent);
            const prayerResponders = msg.prayer_request_id
              ? prayerReqResponders.get(msg.prayer_request_id)
              : msgPrayerResponders.get(msg.id);
            const isPraying = Boolean(prayerResponders?.has(currentUserId));
            const isPrayerBusy = busyPrayerMsgIds.has(msg.id);

            return (
              <div key={msg.id} className="space-y-2">
                {topic.isTopicThread ? (
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => author && onSelectParticipant?.(author)}
                      className="shrink-0 mt-0.5 cursor-pointer"
                    >
                      {renderChatAvatar(author, 34)}
                    </button>
                    <div
                      onClick={() => setActiveThreadRootId(msg.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActiveThreadRootId(msg.id);
                        }
                      }}
                      className="flex-1 bg-white hover:bg-[#FCFBF8] border border-[#CFE0D6] rounded-2xl rounded-tl-sm p-3.5 shadow-2xs transition-colors cursor-pointer space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EBF1EE] text-[#4A6B5D] shrink-0">
                            <MessagesSquare className="w-3 h-3" />
                            <span>Topic Thread</span>
                          </span>
                          <span className="text-[11px] text-[#6B7280] truncate">
                            by {authorName.split(" ")[0]}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10.5px] text-[#6B7280]">
                            {formatChatTime(msg.created_at)}
                          </span>
                          {isMe && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMessage(msg.id);
                              }}
                              aria-label="Delete topic thread"
                              className="text-[#6B7280] hover:text-red-600 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <h4 className="font-editorial text-[16px] font-semibold text-[#1F2937] leading-snug">
                        {topic.title}
                      </h4>

                      {topic.body && (
                        <p className="text-xs text-[#6B7280] line-clamp-2 leading-relaxed">
                          {topic.body}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1.5 border-t border-[#E6E1D6]/70 text-[11px] font-medium text-[#4A6B5D]">
                        <span>
                          {replies.length === 0
                            ? "No messages yet"
                            : `${replies.length} ${
                                replies.length === 1 ? "message" : "messages"
                              } · ${formatRelativeAgo(
                                replies[replies.length - 1].created_at
                              )}`}
                        </span>
                        <span>Open Topic →</span>
                      </div>
                    </div>
                  </div>
                ) : isPrayer ? (
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => author && onSelectParticipant?.(author)}
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
                          disabled={isPrayerBusy}
                          onClick={() => togglePrayer(msg)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-70 ${
                            isPraying
                              ? "bg-[#4A6B5D] text-white"
                              : "bg-white border border-[#CFE0D6] text-[#4A6B5D] hover:bg-[#EBF1EE]"
                          }`}
                        >
                          <Heart className="w-3.5 h-3.5" />
                          <span>
                            {isPraying
                              ? "Praying for you"
                              : `Pray for ${authorName.split(" ")[0]}`}
                          </span>
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
                ) : msg.image_url ? (
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => author && onSelectParticipant?.(author)}
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
                      {signedImageUrls[msg.image_url] ? (
                        <div className="mb-2 rounded-xl overflow-hidden border border-[#E6E1D6] bg-[#FAF9F6]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={signedImageUrls[msg.image_url]}
                            alt="Notebook reflection"
                            className="w-full max-h-64 object-cover"
                          />
                        </div>
                      ) : (
                        <div className="mb-2 h-32 rounded-xl border border-[#E6E1D6] bg-[#FAF9F6] flex items-center justify-center text-[11px] text-[#6B7280]">
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                          Loading image...
                        </div>
                      )}
                      <p className="text-[13px] leading-relaxed text-[#1F2937] whitespace-pre-wrap">
                        {displayContent}
                      </p>
                      {msg.ocr_text && (
                        <details
                          open={Boolean(
                            normalizedQuery &&
                              msg.ocr_text
                                .toLowerCase()
                                .includes(normalizedQuery)
                          )}
                          className="mt-2 rounded-xl bg-[#FAF9F6] border border-[#E6E1D6] px-2.5 py-1.5 text-[11px] text-[#6B7280]"
                        >
                          <summary className="cursor-pointer font-medium text-[#4A6B5D] select-none">
                            Extracted notebook text (searchable)
                          </summary>
                          <p className="mt-1 leading-relaxed text-[#1F2937] whitespace-pre-wrap">
                            {msg.ocr_text}
                          </p>
                        </details>
                      )}
                      {isMe && (
                        <div className="flex items-center justify-end mt-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="text-[#6B7280] hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : isVerseCard ? (
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => author && onSelectParticipant?.(author)}
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
                      {scriptureRef ? (
                        <Link
                          href={`/reader?book=${encodeURIComponent(scriptureRef.book)}&chapter=${scriptureRef.chapter}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EBF1EE] hover:bg-[#DCE7E1] text-[#4A6B5D] text-[11.5px] font-semibold mb-2 transition-colors"
                        >
                          <BookOpen className="w-3 h-3" />
                          <span>{scriptureRef.label} · Open in Reader</span>
                        </Link>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F4F1EA] text-[#4A6B5D] text-[11.5px] font-medium mb-2">
                          <BookOpen className="w-3 h-3" />
                          <span>Scripture Reflection</span>
                        </div>
                      )}
                      <p className="font-editorial text-[15px] leading-relaxed text-[#1F2937] whitespace-pre-wrap">
                        {displayContent}
                      </p>
                      {isMe && (
                        <div className="flex items-center justify-end mt-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="text-[#6B7280] hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`flex items-start gap-2.5 ${
                      isMe ? "justify-end" : ""
                    }`}
                  >
                    {!isMe && (
                      <button
                        type="button"
                        onClick={() => author && onSelectParticipant?.(author)}
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
                      {scriptureRef && (
                        <Link
                          href={`/reader?book=${encodeURIComponent(scriptureRef.book)}&chapter=${scriptureRef.chapter}`}
                          className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-lg text-[10.5px] font-medium ${
                            isMe
                              ? "bg-white/15 text-white hover:bg-white/25"
                              : "bg-[#EBF1EE] text-[#4A6B5D] hover:bg-[#DCE7E1]"
                          }`}
                        >
                          <BookOpen className="w-3 h-3" />
                          <span>Read {scriptureRef.label}</span>
                        </Link>
                      )}
                      <div
                        className={`flex items-center justify-end gap-2 text-[10px] mt-1 ${
                          isMe ? "text-white/75" : "text-[#6B7280]"
                        }`}
                      >
                        <span>{formatChatTime(msg.created_at)}</span>
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

                {/* Compact Pill for any legacy non-topic messages that already have replies */}
                {!topic.isTopicThread && replies.length > 0 && (
                  <div className={isMe && !isPrayer && !msg.image_url && !isVerseCard ? "flex justify-end" : "pl-11"}>
                    <button
                      type="button"
                      onClick={() => setActiveThreadRootId(msg.id)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EBF1EE] hover:bg-[#DCE7E1] border border-[#CFE0D6] text-[11px] font-medium text-[#4A6B5D] transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-3 h-3 shrink-0" />
                      <span>
                        {replies.length}{" "}
                        {replies.length === 1 ? "reply" : "replies"} ·{" "}
                        {formatRelativeAgo(
                          replies[replies.length - 1].created_at
                        )}
                      </span>
                    </button>
                  </div>
                )}
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
              setComposeMode("thread");
              setShowAttachmentTray(false);
            }}
            className="bg-white border border-[#E6E1D6] hover:border-[#4A6B5D] rounded-xl p-2 text-left flex items-center gap-2 transition-colors cursor-pointer"
          >
            <span className="w-7 h-7 rounded-lg bg-[#EBF1EE] text-[#4A6B5D] flex items-center justify-center shrink-0">
              <MessagesSquare className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11.5px] font-semibold text-[#1F2937] truncate">
                Topic Thread
              </p>
              <p className="text-[9.5px] text-[#6B7280] truncate">
                Separate topic chat
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setComposeMode("verse");
              setShowAttachmentTray(false);
            }}
            className="bg-white border border-[#E6E1D6] hover:border-[#4A6B5D] rounded-xl p-2 text-left flex items-center gap-2 transition-colors cursor-pointer"
          >
            <span className="w-7 h-7 rounded-lg bg-[#EBF1EE] text-[#4A6B5D] flex items-center justify-center shrink-0">
              <BookOpen className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11.5px] font-semibold text-[#1F2937] truncate">
                Verse Card
              </p>
              <p className="text-[9.5px] text-[#6B7280] truncate">
                Link scripture
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setComposeMode("prayer");
              setShowAttachmentTray(false);
            }}
            className="bg-white border border-[#E6E1D6] hover:border-[#4A6B5D] rounded-xl p-2 text-left flex items-center gap-2 transition-colors cursor-pointer"
          >
            <span className="w-7 h-7 rounded-lg bg-[#EBF1EE] text-[#4A6B5D] flex items-center justify-center shrink-0">
              <Heart className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11.5px] font-semibold text-[#1F2937] truncate">
                Prayer
              </p>
              <p className="text-[9.5px] text-[#6B7280] truncate">
                Ask to pray
              </p>
            </div>
          </button>

          <label className="bg-white border border-[#E6E1D6] hover:border-[#B47B44] rounded-xl p-2 text-left flex items-center gap-2 transition-colors cursor-pointer">
            <span className="w-7 h-7 rounded-lg bg-[#FBF5EE] text-[#B47B44] flex items-center justify-center shrink-0">
              <Camera className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11.5px] font-semibold text-[#1F2937] truncate">
                Notebook
              </p>
              <p className="text-[9.5px] text-[#6B7280] truncate">
                Photo + OCR
              </p>
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

      {/* Active Topic / Photo / Prayer / Verse Banner */}
      {(previewUrl ||
        composeMode === "thread" ||
        composeMode === "prayer" ||
        composeMode === "verse" ||
        error) && (
        <div className="px-4 py-2 bg-[#F4F1EA] border-t border-[#E6E1D6] flex items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {error ? (
              <span className="text-red-600 truncate">{error}</span>
            ) : composeMode === "thread" ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <MessagesSquare className="w-3.5 h-3.5 text-[#4A6B5D] shrink-0" />
                <input
                  type="text"
                  value={topicTitle}
                  onChange={(e) => setTopicTitle(e.target.value)}
                  placeholder="Topic title (e.g. Sunday Sermon Notes)..."
                  autoFocus
                  className="flex-1 bg-white border border-[#E6E1D6] rounded-lg px-2.5 py-1 text-xs text-[#1F2937] placeholder-[#6B7280] focus:outline-none focus:border-[#4A6B5D]"
                />
              </div>
            ) : previewUrl ? (
              <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-8 h-8 rounded-lg object-cover border border-[#E6E1D6] shrink-0"
                />
                <div className="min-w-0">
                  <span className="block text-[#B47B44] font-medium truncate">
                    {ocrStatus || "Notebook photo attached"}
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-[#4A6B5D] font-medium cursor-pointer select-none mt-0.5">
                    <input
                      type="checkbox"
                      checked={extractOcr}
                      disabled={posting}
                      onChange={(e) => setExtractOcr(e.target.checked)}
                      className="rounded border-[#E6E1D6] accent-[#4A6B5D] cursor-pointer"
                    />
                    <Sparkles className="w-3 h-3 shrink-0" />
                    <span>Extract text for search (OCR)</span>
                  </label>
                </div>
              </div>
            ) : composeMode === "verse" ? (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <BookOpen className="w-3.5 h-3.5 text-[#4A6B5D] shrink-0" />
                <select
                  value={verseBook}
                  onChange={(e) => {
                    setVerseBook(e.target.value);
                    setVerseChapter(1);
                    setVerseNumber(1);
                  }}
                  className="bg-white border border-[#E6E1D6] rounded-lg px-2 py-1 text-[#1F2937]"
                >
                  {BIBLE_BOOKS.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={selectedBookMeta.chapters}
                  value={verseChapter}
                  onChange={(e) =>
                    setVerseChapter(
                      Math.max(1, Math.min(selectedBookMeta.chapters, Number(e.target.value) || 1))
                    )
                  }
                  aria-label="Chapter"
                  className="w-12 bg-white border border-[#E6E1D6] rounded-lg px-1.5 py-1 text-center text-[#1F2937]"
                />
                <span>:</span>
                <input
                  type="number"
                  min={1}
                  max={176}
                  value={verseNumber}
                  onChange={(e) =>
                    setVerseNumber(Math.max(1, Number(e.target.value) || 1))
                  }
                  aria-label="Verse"
                  className="w-12 bg-white border border-[#E6E1D6] rounded-lg px-1.5 py-1 text-center text-[#1F2937]"
                />
              </div>
            ) : (
              <span className="text-[#4A6B5D] font-medium">
                Sharing a Prayer Request Card
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setTopicTitle("");
              setComposeMode("text");
              setError(null);
              clearSelectedFile();
            }}
            className="text-[#6B7280] hover:text-[#1F2937] cursor-pointer shrink-0"
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
          aria-label="Add Topic Thread, Verse Card, Prayer Request, or Notebook Photo"
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
            composeMode === "thread"
              ? "Optional opening note for this topic..."
              : composeMode === "prayer"
                ? "How can they pray for you?"
                : composeMode === "verse"
                  ? "Optional thought on this verse..."
                  : mode === "dm" || mode === "circle-dm"
                    ? `Message ${title.split(" ")[0]}...`
                    : "Share a reflection with the circle..."
          }
          className="flex-1 bg-white border border-[#E6E1D6] rounded-full px-4 py-2 text-[13px] text-[#1F2937] placeholder-[#6B7280] focus:outline-none focus:border-[#4A6B5D]"
        />

        <button
          type="submit"
          disabled={
            posting ||
            (composeMode === "thread"
              ? !topicTitle.trim()
              : !content.trim() && !selectedFile && composeMode !== "verse")
          }
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

      {/* Focused Thread Drawer */}
      {activeThreadRoot && (
        <ThreadDrawer
          rootMessage={activeThreadRoot}
          replies={repliesByParent.get(activeThreadRoot.id) || []}
          mode={mode}
          threadId={threadId}
          currentUserId={currentUserId}
          peerUserId={peerUserId}
          participantMap={participantMap}
          onClose={() => setActiveThreadRootId(null)}
          onReplyInserted={(inserted) => {
            setMessages((prev) =>
              prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]
            );
            onMessagesUpdated?.(inserted.created_at);
          }}
          onDeleteReply={handleDeleteMessage}
          onSelectParticipant={onSelectParticipant}
        />
      )}

      {/* Active Threads Index Drawer */}
      {showThreadsIndex && (
        <ThreadsIndexDrawer
          threads={activeThreads}
          participantMap={participantMap}
          onSelectThread={(rootId) => {
            setShowThreadsIndex(false);
            setActiveThreadRootId(rootId);
          }}
          onNewTopic={() => {
            setShowThreadsIndex(false);
            setComposeMode("thread");
            setShowAttachmentTray(false);
          }}
          onClose={() => setShowThreadsIndex(false)}
        />
      )}
    </div>
  );
}
