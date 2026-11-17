"use client";

import { MessageSquare, Plus, X } from "lucide-react";
import {
  formatRelativeAgo,
  parseThreadTopic,
  renderChatAvatar,
  type ChatMessageRow,
  type ChatParticipant,
} from "@/components/chat/ChatThread";

export interface ThreadSummaryItem {
  root: ChatMessageRow;
  replyCount: number;
  lastReplyAt: string;
}

interface ThreadsIndexDrawerProps {
  threads: ThreadSummaryItem[];
  participantMap: Map<string, ChatParticipant>;
  onSelectThread: (rootId: string) => void;
  onNewTopic?: () => void;
  onClose: () => void;
}

export default function ThreadsIndexDrawer({
  threads,
  participantMap,
  onSelectThread,
  onNewTopic,
  onClose,
}: ThreadsIndexDrawerProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px] flex justify-end"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#FAF9F6] h-full border-l border-[#E6E1D6] shadow-2xl flex flex-col"
      >
        <div className="px-4 py-3.5 bg-white border-b border-[#E6E1D6] flex items-center justify-between gap-2 shrink-0">
          <div>
            <h3 className="font-editorial text-lg font-semibold text-[#1F2937] leading-tight">
              Topic Threads
            </h3>
            <p className="text-[11px] text-[#6B7280]">
              {threads.length}{" "}
              {threads.length === 1 ? "topic chat" : "topic chats"} sorted by
              activity
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {onNewTopic && (
              <button
                type="button"
                onClick={onNewTopic}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-[11px] font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Topic</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close threads index"
              className="p-1.5 rounded-full bg-[#F4F1EA] text-[#6B7280] hover:text-[#1F2937] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
          {threads.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-white border border-[#E6E1D6] text-xs text-[#6B7280] space-y-3">
              <p>
                No topic threads yet. Tap the <strong>+</strong> button in chat
                and choose <strong>Topic Thread</strong> to start a focused
                conversation.
              </p>
              {onNewTopic && (
                <button
                  type="button"
                  onClick={onNewTopic}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#4A6B5D] text-white text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Start First Topic</span>
                </button>
              )}
            </div>
          ) : (
            threads.map(({ root, replyCount, lastReplyAt }) => {
              const author = participantMap.get(root.sender_id);
              const authorName = author?.display_name || "Fellow Reader";
              const topic = parseThreadTopic(root.content);
              const title = topic.isTopicThread
                ? topic.title
                : root.content
                    .replace(/^\[Prayer\]\s*/, "")
                    .replace(/\s+/g, " ")
                    .trim();

              return (
                <button
                  key={root.id}
                  type="button"
                  onClick={() => onSelectThread(root.id)}
                  className="w-full text-left p-3.5 rounded-2xl bg-white hover:bg-[#F4F1EA] border border-[#E6E1D6] transition-colors space-y-2 shadow-2xs cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {renderChatAvatar(author, 26)}
                      <span className="text-xs font-semibold text-[#1F2937] truncate">
                        {authorName}
                      </span>
                    </div>
                    <span className="text-[10.5px] text-[#6B7280] shrink-0">
                      {formatRelativeAgo(lastReplyAt)}
                    </span>
                  </div>

                  <p className="font-editorial text-[15px] font-semibold text-[#1F2937] truncate">
                    {title}
                  </p>

                  {topic.isTopicThread && topic.body && (
                    <p className="text-xs text-[#6B7280] truncate">
                      {topic.body}
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#4A6B5D]">
                    <MessageSquare className="w-3 h-3 shrink-0" />
                    <span>
                      {replyCount}{" "}
                      {replyCount === 1 ? "message" : "messages"}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
