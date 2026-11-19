"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type {
  CircleInfo,
  CircleMemberProfile,
} from "@/components/circle/CircleManager";

interface CircleDocRow {
  id: string;
  circle_id: string;
  title: string;
  content: string;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

interface CircleDocsViewProps {
  circle: CircleInfo;
  members: CircleMemberProfile[];
  currentUserId: string;
  onBack: () => void;
}

const DEFAULT_DOC_HTML = `<h2>Sunday Sermon Notes</h2><p>Tap anywhere to write together with your circle—headings, bullet points, and prayer checklists auto-save in real time.</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Share one takeaway in Circle chat</p></li></ul>`;

function stripHtmlPreview(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function formatUpdatedAgo(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default function CircleDocsView({
  circle,
  members,
  currentUserId,
  onBack,
}: CircleDocsViewProps) {
  const [docs, setDocs] = useState<CircleDocRow[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "conflict">("saved");
  const [conflictDoc, setConflictDoc] = useState<CircleDocRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(
    null
  );
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const contentSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDocIdRef = useRef<string | null>(null);
  const lastSyncedDocIdRef = useRef<string | null>(null);
  const suppressUpdateRef = useRef(false);
  const baseUpdatedAtRef = useRef<Record<string, string>>({});
  const pendingContentRef = useRef<{ docId: string; html: string } | null>(null);
  const pendingTitleRef = useRef<{ docId: string; title: string } | null>(null);
  const conflictDocIdRef = useRef<string | null>(null);

  const memberMap = new Map(members.map((m) => [m.user_id, m]));
  const activeDoc = docs.find((d) => d.id === activeDocId) || null;

  useEffect(() => {
    activeDocIdRef.current = activeDocId;
  }, [activeDocId]);

  useEffect(() => {
    conflictDocIdRef.current = conflictDoc?.id ?? null;
  }, [conflictDoc]);

  const flushPendingSave = useCallback(
    async (targetDocId?: string): Promise<boolean> => {
      const pendingContent = pendingContentRef.current;
      const pendingTitle = pendingTitleRef.current;
      const docId =
        targetDocId ?? pendingContent?.docId ?? pendingTitle?.docId ?? null;
      if (!docId) return true;

      const hasContent = pendingContent?.docId === docId;
      const hasTitle = pendingTitle?.docId === docId;
      if (!hasContent && !hasTitle) return true;

      if (hasContent && contentSaveTimerRef.current) {
        clearTimeout(contentSaveTimerRef.current);
        contentSaveTimerRef.current = null;
      }
      if (hasTitle && titleSaveTimerRef.current) {
        clearTimeout(titleSaveTimerRef.current);
        titleSaveTimerRef.current = null;
      }

      const updatePayload: {
        content?: string;
        title?: string;
        updated_by: string;
        updated_at: string;
      } = {
        updated_by: currentUserId,
        updated_at: new Date().toISOString(),
      };
      if (hasContent) updatePayload.content = pendingContent.html;
      if (hasTitle) updatePayload.title = pendingTitle.title;

      const supabase = createClient();
      const expectedUpdatedAt = baseUpdatedAtRef.current[docId];
      let query = supabase
        .from("circle_docs")
        .update(updatePayload)
        .eq("id", docId);
      if (expectedUpdatedAt) {
        query = query.eq("updated_at", expectedUpdatedAt);
      }

      const { data: updatedRows, error } = await query.select(
        "id, circle_id, title, content, updated_by, updated_at, created_at"
      );

      if (error) {
        return false;
      }

      if (!updatedRows || updatedRows.length === 0) {
        const { data: latestRow } = await supabase
          .from("circle_docs")
          .select("id, circle_id, title, content, updated_by, updated_at, created_at")
          .eq("id", docId)
          .single();

        if (latestRow) {
          setConflictDoc(latestRow);
          setSaveState("conflict");
        }
        return false;
      }

      const savedRow = updatedRows[0] as CircleDocRow;
      baseUpdatedAtRef.current[docId] = savedRow.updated_at;
      if (pendingContentRef.current?.docId === docId) {
        pendingContentRef.current = null;
      }
      if (pendingTitleRef.current?.docId === docId) {
        pendingTitleRef.current = null;
      }
      setDocs((prev) => prev.map((d) => (d.id === docId ? savedRow : d)));
      setConflictDoc((prev) => (prev?.id === docId ? null : prev));
      setSaveState("saved");
      return true;
    },
    [currentUserId]
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    content: "",
    onUpdate: ({ editor: ed }) => {
      if (suppressUpdateRef.current) return;
      const docId = activeDocIdRef.current;
      if (!docId) return;

      const html = ed.getHTML();
      pendingContentRef.current = { docId, html };
      setSaveState((prev) => (prev === "conflict" ? "conflict" : "saving"));
      setDocs((prev) =>
        prev.map((d) =>
          d.id === docId
            ? {
                ...d,
                content: html,
                updated_by: currentUserId,
                updated_at: new Date().toISOString(),
              }
            : d
        )
      );

      if (contentSaveTimerRef.current) clearTimeout(contentSaveTimerRef.current);
      contentSaveTimerRef.current = setTimeout(() => {
        contentSaveTimerRef.current = null;
        if (conflictDocIdRef.current === docId) return;
        void flushPendingSave(docId);
      }, 650);
    },
  });

  const loadDocs = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("circle_docs")
      .select("id, circle_id, title, content, updated_by, updated_at, created_at")
      .eq("circle_id", circle.id)
      .order("updated_at", { ascending: false });

    const rows = data || [];
    for (const row of rows) {
      baseUpdatedAtRef.current[row.id] = row.updated_at;
    }
    setDocs(rows);
    setLoading(false);
  }, [circle.id]);

  useEffect(() => {
    setLoading(true);
    loadDocs();
    const handlePageHide = () => {
      void flushPendingSave();
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      void flushPendingSave();
      if (contentSaveTimerRef.current) clearTimeout(contentSaveTimerRef.current);
      if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    };
  }, [loadDocs, flushPendingSave]);

  // Sync editor content only when switching docs
  useEffect(() => {
    if (!activeDoc) {
      lastSyncedDocIdRef.current = null;
      return;
    }
    if (!editor) return;
    if (lastSyncedDocIdRef.current === activeDoc.id) return;

    lastSyncedDocIdRef.current = activeDoc.id;
    if (editor.getHTML() !== activeDoc.content) {
      suppressUpdateRef.current = true;
      editor.commands.setContent(activeDoc.content || "<p></p>");
      suppressUpdateRef.current = false;
    }
  }, [editor, activeDoc]);

  // Live Supabase Realtime sync on circle_docs
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`circle-docs-${circle.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "circle_docs",
          filter: `circle_id=eq.${circle.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const inserted = payload.new as CircleDocRow;
            baseUpdatedAtRef.current[inserted.id] = inserted.updated_at;
            setDocs((prev) =>
              prev.some((d) => d.id === inserted.id) ? prev : [inserted, ...prev]
            );
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as CircleDocRow;
            if (updated.updated_by === currentUserId) return;

            const isActiveDoc = updated.id === activeDocIdRef.current;
            const hasPendingForDoc =
              pendingContentRef.current?.docId === updated.id ||
              pendingTitleRef.current?.docId === updated.id;
            const isFocusedOnActive = Boolean(isActiveDoc && editor?.isFocused);

            if (isActiveDoc && (hasPendingForDoc || isFocusedOnActive)) {
              const localHtml = editor?.getHTML() ?? "";
              if (localHtml !== updated.content) {
                setConflictDoc(updated);
                setSaveState("conflict");
                return;
              }
            }

            baseUpdatedAtRef.current[updated.id] = updated.updated_at;
            setDocs((prev) =>
              prev.map((d) => (d.id === updated.id ? updated : d))
            );
            if (
              isActiveDoc &&
              editor &&
              !editor.isFocused &&
              editor.getHTML() !== updated.content
            ) {
              suppressUpdateRef.current = true;
              editor.commands.setContent(updated.content || "<p></p>");
              suppressUpdateRef.current = false;
            }
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string })?.id;
            if (oldId) {
              setDocs((prev) => prev.filter((d) => d.id !== oldId));
              if (activeDocIdRef.current === oldId) {
                setActiveDocId(null);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [circle.id, currentUserId, editor]);

  async function handleCreateDoc() {
    setCreating(true);
    const supabase = createClient();
    const title =
      docs.length === 0
        ? "Sunday Sermon Notes"
        : `Study Note #${docs.length + 1}`;

    const { data: created } = await supabase
      .from("circle_docs")
      .insert({
        circle_id: circle.id,
        title,
        content: DEFAULT_DOC_HTML,
        updated_by: currentUserId,
      })
      .select("id, circle_id, title, content, updated_by, updated_at, created_at")
      .single();

    setCreating(false);
    if (created) {
      baseUpdatedAtRef.current[created.id] = created.updated_at;
      setDocs((prev) => [created, ...prev]);
      setActiveDocId(created.id);
    }
  }

  async function handleTitleChange(nextTitle: string) {
    if (!activeDoc) return;
    const docId = activeDoc.id;
    pendingTitleRef.current = { docId, title: nextTitle };
    setDocs((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, title: nextTitle } : d))
    );
    setSaveState((prev) => (prev === "conflict" ? "conflict" : "saving"));
    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    titleSaveTimerRef.current = setTimeout(() => {
      titleSaveTimerRef.current = null;
      if (conflictDocIdRef.current === docId) return;
      void flushPendingSave(docId);
    }, 500);
  }

  async function handleExitDoc() {
    if (activeDoc) {
      const ok = await flushPendingSave(activeDoc.id);
      if (!ok) return;
    }
    setConflictDoc(null);
    setActiveDocId(null);
  }

  function handleLoadLatest() {
    if (!conflictDoc) return;
    const latest = conflictDoc;
    baseUpdatedAtRef.current[latest.id] = latest.updated_at;
    if (pendingContentRef.current?.docId === latest.id) {
      pendingContentRef.current = null;
    }
    if (pendingTitleRef.current?.docId === latest.id) {
      pendingTitleRef.current = null;
    }
    if (contentSaveTimerRef.current) {
      clearTimeout(contentSaveTimerRef.current);
      contentSaveTimerRef.current = null;
    }
    if (titleSaveTimerRef.current) {
      clearTimeout(titleSaveTimerRef.current);
      titleSaveTimerRef.current = null;
    }
    setDocs((prev) => prev.map((d) => (d.id === latest.id ? latest : d)));
    if (editor && editor.getHTML() !== latest.content) {
      suppressUpdateRef.current = true;
      editor.commands.setContent(latest.content || "<p></p>");
      suppressUpdateRef.current = false;
    }
    setConflictDoc(null);
    setSaveState("saved");
  }

  async function handleForceOverwrite() {
    if (!conflictDoc || !activeDoc) return;
    baseUpdatedAtRef.current[activeDoc.id] = conflictDoc.updated_at;
    if (!pendingContentRef.current && editor) {
      pendingContentRef.current = {
        docId: activeDoc.id,
        html: editor.getHTML(),
      };
    }
    setConflictDoc(null);
    setSaveState("saving");
    await flushPendingSave(activeDoc.id);
  }

  async function handleDeleteDoc(docId: string) {
    setDeletingDocId(docId);
    if (pendingContentRef.current?.docId === docId) {
      pendingContentRef.current = null;
    }
    if (pendingTitleRef.current?.docId === docId) {
      pendingTitleRef.current = null;
    }
    const supabase = createClient();
    await supabase.from("circle_docs").delete().eq("id", docId);
    setDocs((prev) => prev.filter((d) => d.id !== docId));
    setConfirmDeleteDocId(null);
    setDeletingDocId(null);
    if (activeDocIdRef.current === docId) {
      setConflictDoc(null);
      setActiveDocId(null);
    }
  }

  // 1. Document Editor View (when a doc is clicked)
  if (activeDoc) {
    const lastEditorName =
      activeDoc.updated_by && memberMap.get(activeDoc.updated_by)
        ? memberMap.get(activeDoc.updated_by)!.display_name.split(" ")[0]
        : "Circle";

    const conflictEditorName =
      conflictDoc?.updated_by && memberMap.get(conflictDoc.updated_by)
        ? memberMap.get(conflictDoc.updated_by)!.display_name.split(" ")[0]
        : "Another member";

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleExitDoc}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#4A6B5D] hover:opacity-80 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>All Docs</span>
          </button>

          <div className="flex items-center gap-3 text-[11px]">
            <span
              className={
                saveState === "conflict"
                  ? "text-amber-700 font-medium"
                  : "text-[#6B7280]"
              }
            >
              {saveState === "saving"
                ? "Saving..."
                : saveState === "conflict"
                ? "Sync conflict"
                : "Saved to Circle"}
            </span>
            <button
              type="button"
              onClick={() => handleDeleteDoc(activeDoc.id)}
              title="Delete document"
              aria-label="Delete document"
              className="text-[#6B7280] hover:text-red-600 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {conflictDoc && conflictDoc.id === activeDoc.id && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>{conflictEditorName}</strong> updated this doc while you
                were editing.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleLoadLatest}
                className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer"
              >
                Load latest
              </button>
              <button
                type="button"
                onClick={handleForceOverwrite}
                className="px-2.5 py-1 rounded-lg bg-amber-700 font-semibold text-white hover:bg-amber-800 cursor-pointer"
              >
                Overwrite with mine
              </button>
            </div>
          </div>
        )}

        <div className="bg-white border border-[#E6E1D6] rounded-2xl shadow-2xs flex flex-col overflow-hidden min-h-[60dvh]">
          <div className="px-3.5 py-2 bg-[#F4F1EA] border-b border-[#E6E1D6] flex items-center gap-1.5 text-[11px] text-[#6B7280]">
            <span className="w-2 h-2 rounded-full bg-[#4A6B5D] shrink-0" />
            <span>
              Last edited by {lastEditorName} ·{" "}
              {formatUpdatedAgo(activeDoc.updated_at)}
            </span>
          </div>

          <div className="px-4 pt-3 pb-1.5 border-b border-[#E6E1D6]">
            <input
              type="text"
              value={activeDoc.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Untitled Doc"
              className="w-full font-editorial text-xl font-semibold text-[#1F2937] bg-transparent focus:outline-none"
            />
          </div>

          {editor && (
            <div className="px-3 py-1.5 border-b border-[#E6E1D6] flex items-center gap-1 bg-[#FAF9F6] overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 1 }).run()
                }
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                  editor.isActive("heading", { level: 1 })
                    ? "bg-[#EBF1EE] text-[#4A6B5D]"
                    : "text-[#1F2937] hover:bg-[#F4F1EA]"
                }`}
              >
                H1
              </button>
              <button
                type="button"
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                  editor.isActive("heading", { level: 2 })
                    ? "bg-[#EBF1EE] text-[#4A6B5D]"
                    : "text-[#1F2937] hover:bg-[#F4F1EA]"
                }`}
              >
                H2
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  editor.isActive("bold")
                    ? "bg-[#EBF1EE] text-[#4A6B5D]"
                    : "text-[#1F2937] hover:bg-[#F4F1EA]"
                }`}
              >
                B
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`px-2 py-1 rounded-lg text-[11px] italic font-serif cursor-pointer ${
                  editor.isActive("italic")
                    ? "bg-[#EBF1EE] text-[#4A6B5D]"
                    : "text-[#1F2937] hover:bg-[#F4F1EA]"
                }`}
              >
                I
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer ${
                  editor.isActive("bulletList")
                    ? "bg-[#EBF1EE] text-[#4A6B5D]"
                    : "text-[#1F2937] hover:bg-[#F4F1EA]"
                }`}
              >
                • List
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleTaskList().run()}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer ${
                  editor.isActive("taskList")
                    ? "bg-[#EBF1EE] text-[#4A6B5D]"
                    : "text-[#4A6B5D] hover:bg-[#EBF1EE]"
                }`}
              >
                ☑ Check
              </button>
            </div>
          )}

          <div className="flex-1 p-4">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    );
  }

  // 2. Docs List View (all docs created in this Circle)
  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to members"
            className="text-xs font-semibold text-[#4A6B5D] hover:opacity-80 cursor-pointer"
          >
            ← Members
          </button>
          <span className="text-[#E6E1D6]">·</span>
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">
            Shared Circle Docs
          </span>
        </div>

        <button
          type="button"
          disabled={creating}
          onClick={handleCreateDoc}
          className="px-3 py-1.5 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
        >
          {creating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          <span>New Doc</span>
        </button>
      </div>

      {loading ? (
        <div className="p-8 bg-white border border-[#E6E1D6] rounded-2xl flex items-center justify-center text-xs text-[#6B7280]">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Loading shared docs...
        </div>
      ) : docs.length === 0 ? (
        <div className="bg-white border border-[#E6E1D6] rounded-2xl p-8 text-center space-y-3">
          <span className="w-12 h-12 rounded-2xl bg-[#EBF1EE] text-[#4A6B5D] flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </span>
          <div>
            <h3 className="font-editorial text-lg font-medium text-[#1F2937]">
              Shared Circle Docs
            </h3>
            <p className="text-xs text-[#6B7280] mt-1 max-w-xs mx-auto">
              Create a collaborative space for Sunday sermon notes, study
              outlines, or discussion prompts.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateDoc}
            disabled={creating}
            className="px-4 py-2 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Doc</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {docs.map((doc) => {
            const editorName =
              doc.updated_by && memberMap.get(doc.updated_by)
                ? memberMap.get(doc.updated_by)!.display_name.split(" ")[0]
                : "Circle";
            const preview = stripHtmlPreview(doc.content);

            const isConfirmingDelete = confirmDeleteDocId === doc.id;
            const isDeleting = deletingDocId === doc.id;

            return (
              <div
                key={doc.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveDocId(doc.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveDocId(doc.id);
                  }
                }}
                className="w-full text-left bg-white hover:bg-[#FCFBF8] border border-[#E6E1D6] hover:border-[#4A6B5D] rounded-2xl p-4 flex items-center justify-between gap-3 transition-all shadow-2xs cursor-pointer group"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-[#EBF1EE] text-[#4A6B5D] flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-editorial text-base font-semibold text-[#1F2937] truncate group-hover:text-[#4A6B5D] transition-colors">
                      {doc.title.trim() || "Untitled Doc"}
                    </h3>
                    <p className="text-[11px] text-[#6B7280]">
                      Edited by {editorName} · {formatUpdatedAgo(doc.updated_at)}
                    </p>
                    {preview && (
                      <p className="text-xs text-[#6B7280] line-clamp-1">
                        {preview}
                      </p>
                    )}
                  </div>
                </div>
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isConfirmingDelete ? (
                    <>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteDocId(null);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-[11px] font-medium text-[#1F2937] cursor-pointer disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDoc(doc.id);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteDocId(doc.id);
                        }}
                        aria-label={`Delete ${doc.title.trim() || "Untitled Doc"}`}
                        title="Delete document"
                        className="p-1.5 rounded-lg text-[#6B7280] hover:text-red-600 hover:bg-[#F4F1EA] transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-[#6B7280] group-hover:text-[#4A6B5D] transition-colors" />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
