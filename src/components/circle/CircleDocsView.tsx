"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { ChevronLeft, FileText, Loader2, Plus, Trash2 } from "lucide-react";
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

export default function CircleDocsView({
  circle,
  members,
  currentUserId,
  onBack,
}: CircleDocsViewProps) {
  const [docs, setDocs] = useState<CircleDocRow[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [creating, setCreating] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDocIdRef = useRef<string | null>(null);
  const suppressUpdateRef = useRef(false);

  const memberMap = new Map(members.map((m) => [m.user_id, m]));
  const activeDoc = docs.find((d) => d.id === activeDocId) || null;

  useEffect(() => {
    activeDocIdRef.current = activeDocId;
  }, [activeDocId]);

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
      setSaveState("saving");
      setDocs((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, content: html } : d))
      );

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const supabase = createClient();
        await supabase
          .from("circle_docs")
          .update({
            content: html,
            updated_by: currentUserId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", docId);
        setSaveState("saved");
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

    const list = data || [];
    setDocs(list);
    if (list.length > 0 && !activeDocIdRef.current) {
      setActiveDocId(list[0].id);
    }
    setLoading(false);
  }, [circle.id]);

  useEffect(() => {
    setLoading(true);
    loadDocs();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [loadDocs]);

  // Sync editor content when switching docs
  useEffect(() => {
    if (!editor || !activeDoc) return;
    if (editor.getHTML() !== activeDoc.content) {
      suppressUpdateRef.current = true;
      editor.commands.setContent(activeDoc.content || "<p></p>");
      suppressUpdateRef.current = false;
    }
  }, [editor, activeDocId, activeDoc]);

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
            setDocs((prev) =>
              prev.some((d) => d.id === inserted.id) ? prev : [inserted, ...prev]
            );
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as CircleDocRow;
            setDocs((prev) =>
              prev.map((d) => (d.id === updated.id ? updated : d))
            );
            if (
              updated.id === activeDocIdRef.current &&
              updated.updated_by !== currentUserId &&
              editor &&
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
      setDocs((prev) => [created, ...prev]);
      setActiveDocId(created.id);
    }
  }

  async function handleTitleChange(nextTitle: string) {
    if (!activeDoc) return;
    setDocs((prev) =>
      prev.map((d) => (d.id === activeDoc.id ? { ...d, title: nextTitle } : d))
    );
    setSaveState("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const supabase = createClient();
      await supabase
        .from("circle_docs")
        .update({
          title: nextTitle.trim() || "Untitled Doc",
          updated_by: currentUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeDoc.id);
      setSaveState("saved");
    }, 500);
  }

  async function handleDeleteDoc(docId: string) {
    const supabase = createClient();
    await supabase.from("circle_docs").delete().eq("id", docId);
    const remaining = docs.filter((d) => d.id !== docId);
    setDocs(remaining);
    setActiveDocId(remaining[0]?.id || null);
  }

  const lastEditorName =
    activeDoc?.updated_by && memberMap.get(activeDoc.updated_by)
      ? memberMap.get(activeDoc.updated_by)!.display_name.split(" ")[0]
      : "Circle";

  return (
    <div className="fixed inset-0 z-40 bg-[#FAF9F6] flex flex-col pb-16">
      <div className="max-w-xl w-full mx-auto flex-1 flex flex-col min-h-0">
        {/* Top Circle Docs Header */}
        <div className="px-4 py-3 bg-[#FAF9F6] border-b border-[#E6E1D6] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to Group Chat"
              className="w-8 h-8 rounded-full hover:bg-[#F4F1EA] flex items-center justify-center text-[#1F2937] cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="font-editorial text-[22px] font-medium text-[#1F2937] tracking-tight">
              Circle Docs
            </h2>
          </div>

          <button
            type="button"
            disabled={creating}
            onClick={handleCreateDoc}
            className="px-3 py-1.5 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
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
          <div className="flex-1 flex items-center justify-center text-xs text-[#6B7280]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading shared docs...
          </div>
        ) : docs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
            <span className="w-12 h-12 rounded-2xl bg-[#EBF1EE] text-[#4A6B5D] flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </span>
            <div>
              <h3 className="font-editorial text-lg font-medium text-[#1F2937]">
                Shared Circle Notes
              </h3>
              <p className="text-xs text-[#6B7280] mt-1 max-w-xs">
                Create a collaborative space for Sunday sermon notes, study
                outlines, or discussion prompts.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCreateDoc}
              className="px-4 py-2 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Doc</span>
            </button>
          </div>
        ) : (
          <>
            {/* Horizontal Document Switcher Pills */}
            <div className="px-4 py-2.5 bg-[#FAF9F6] flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
              {docs.map((doc) => {
                const isActive = doc.id === activeDoc?.id;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setActiveDocId(doc.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      isActive
                        ? "bg-[#4A6B5D] text-white"
                        : "bg-[#F4F1EA] text-[#6B7280] border border-[#E6E1D6] hover:text-[#1F2937]"
                    }`}
                  >
                    {doc.title}
                  </button>
                );
              })}
            </div>

            {/* Distraction-Free Collaborative TipTap Card */}
            {activeDoc && (
              <div className="flex-1 px-4 pb-4 flex flex-col min-h-0">
                <div className="flex-1 bg-white border border-[#E6E1D6] rounded-2xl shadow-2xs flex flex-col overflow-hidden">
                  {/* Status & Title Bar */}
                  <div className="px-3.5 py-2 bg-[#F4F1EA] border-b border-[#E6E1D6] flex items-center justify-between gap-2 text-[11px] shrink-0">
                    <div className="flex items-center gap-1.5 text-[#1F2937] font-medium truncate">
                      <span className="w-2 h-2 rounded-full bg-[#4A6B5D] shrink-0" />
                      <span className="truncate">
                        Last edited by {lastEditorName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[#6B7280]">
                        {saveState === "saving"
                          ? "Saving..."
                          : "Saved to Circle"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteDoc(activeDoc.id)}
                        title="Delete document"
                        className="text-[#6B7280] hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Document Title Input */}
                  <div className="px-4 pt-3 pb-1.5 border-b border-[#E6E1D6] shrink-0">
                    <input
                      type="text"
                      value={activeDoc.title}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      placeholder="Document title..."
                      className="w-full font-editorial text-lg font-semibold text-[#1F2937] bg-transparent focus:outline-none"
                    />
                  </div>

                  {/* Minimal Rich-Text Formatting Toolbar */}
                  {editor && (
                    <div className="px-3 py-1.5 border-b border-[#E6E1D6] flex items-center gap-1 bg-[#FAF9F6] shrink-0 overflow-x-auto no-scrollbar">
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
                        onClick={() =>
                          editor.chain().focus().toggleBold().run()
                        }
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
                        onClick={() =>
                          editor.chain().focus().toggleItalic().run()
                        }
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
                        onClick={() =>
                          editor.chain().focus().toggleBulletList().run()
                        }
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
                        onClick={() =>
                          editor.chain().focus().toggleTaskList().run()
                        }
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

                  {/* Editable Paper Canvas */}
                  <div className="flex-1 overflow-y-auto p-4">
                    <EditorContent editor={editor} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
