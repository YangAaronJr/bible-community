"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Camera,
  Check,
  ChevronLeft,
  Copy,
  Loader2,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { getInitials } from "@/components/ui/Navbar";
import QuietPageHeader from "@/components/ui/QuietPageHeader";
import NewPlanFlow, { type NewPlanResult } from "@/components/plans/NewPlanFlow";
import {
  encodeSharedCustomPlan,
  getSharedPlanTitle,
  parseSharedPlan,
  WEEKDAYS,
  type CustomScheduleSlot,
} from "@/lib/plans/reading-plans";
import type { Json } from "@/lib/types/database";
import { extractStorageObjectPath } from "@/lib/storage/paths";
import { createClient } from "@/lib/supabase/client";

interface CircleSettingsData {
  id: string;
  name: string;
  invite_code: string;
  avatar_url: string | null;
  shared_plan_id: string | null;
}

export default function CircleSettingsView({
  circleId,
  initialUserId,
  onBack,
  onCircleUpdated,
}: {
  circleId: string;
  initialUserId?: string;
  onBack?: () => void;
  onCircleUpdated?: () => void;
}) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(initialUserId ?? null);
  const [circle, setCircle] = useState<CircleSettingsData | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [sharedPlanId, setSharedPlanId] = useState<string>("");
  const [myPlanSynced, setMyPlanSynced] = useState(false);

  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [syncingMyPlan, setSyncingMyPlan] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leavingCircle, setLeavingCircle] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const loadCircleSettings = useCallback(async () => {
    const supabase = createClient();
    let uid = initialUserId ?? null;
    if (!uid) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      uid = user?.id ?? null;
    }

    if (!uid) {
      setLoading(false);
      return;
    }
    setUserId(uid);

    const [{ data: membership }, { data: circleRow }, { data: activeCustom }] =
      await Promise.all([
        supabase
          .from("circle_members")
          .select("circle_id")
          .eq("circle_id", circleId)
          .eq("user_id", uid)
          .maybeSingle(),
        supabase
          .from("circles")
          .select("id, name, invite_code, avatar_url, shared_plan_id")
          .eq("id", circleId)
          .maybeSingle(),
        supabase
          .from("custom_schedules")
          .select("id, title, schedule_items")
          .eq("user_id", uid)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle(),
      ]);

    if (!membership || !circleRow) {
      setCircle(null);
      setLoading(false);
      return;
    }

    setCircle(circleRow);
    setNameInput(circleRow.name);
    setAvatarUrl(circleRow.avatar_url);
    const planVal = circleRow.shared_plan_id || "";
    setSharedPlanId(planVal);

    if (typeof window !== "undefined" && planVal) {
      const parsedShared = parseSharedPlan(planVal);
      if (parsedShared?.kind === "custom") {
        const items = Array.isArray(activeCustom?.schedule_items)
          ? (activeCustom.schedule_items as unknown as CustomScheduleSlot[])
          : [];
        const expectedTrack = parsedShared.custom.books.join(", ");
        const matchesCustom =
          Boolean(activeCustom) &&
          activeCustom?.title === parsedShared.custom.title &&
          items.length === 1 &&
          items[0]?.track === expectedTrack &&
          (items[0]?.chaptersPerDay || 1) === parsedShared.custom.chaptersPerDay;
        setMyPlanSynced(matchesCustom);
      } else {
        const localPlan = localStorage.getItem("selected_reading_plan");
        setMyPlanSynced(!activeCustom && localPlan === planVal);
      }
    } else {
      setMyPlanSynced(false);
    }

    setLoading(false);
  }, [circleId, initialUserId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadCircleSettings();
    });
    return () => {
      active = false;
    };
  }, [loadCircleSettings]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !circle) return;

    setUploadingAvatar(true);
    setFeedback(null);
    const previousAvatarUrl = avatarUrl;
    const supabase = createClient();

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const filePath = `${circle.id}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("circle-avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("circle-avatars").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("circles")
        .update({ avatar_url: publicUrl })
        .eq("id", circle.id);

      if (updateError) throw updateError;

      const oldPath = extractStorageObjectPath(
        previousAvatarUrl,
        "circle-avatars"
      );
      if (oldPath && oldPath !== filePath) {
        try {
          await supabase.storage.from("circle-avatars").remove([oldPath]);
        } catch {
          // Best-effort cleanup of replaced circle avatar
        }
      }

      setAvatarUrl(publicUrl);
      setCircle((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
      setFeedback({ type: "success", text: "Circle photo updated." });
      onCircleUpdated?.();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Could not upload circle photo.",
      });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!circle || !nameInput.trim()) return;
    setSavingName(true);
    setFeedback(null);

    const supabase = createClient();
    const trimmed = nameInput.trim();
    const { error } = await supabase
      .from("circles")
      .update({ name: trimmed })
      .eq("id", circle.id);

    setSavingName(false);
    if (error) {
      setFeedback({ type: "error", text: error.message });
    } else {
      setCircle((prev) => (prev ? { ...prev, name: trimmed } : prev));
      setFeedback({ type: "success", text: "Circle name saved." });
      onCircleUpdated?.();
    }
  }

  async function handleSharedPlanChange(nextPlanId: string) {
    if (!circle) return;
    setSharedPlanId(nextPlanId);
    setSavingPlan(true);
    setFeedback(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("circles")
      .update({ shared_plan_id: nextPlanId || null })
      .eq("id", circle.id);

    setSavingPlan(false);
    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setCircle((prev) =>
      prev ? { ...prev, shared_plan_id: nextPlanId || null } : prev
    );

    if (nextPlanId && userId) {
      await supabase.from("circle_plan_updates").insert({
        circle_id: circle.id,
        actor_id: userId,
        plan_id: nextPlanId,
        plan_title: getSharedPlanTitle(nextPlanId) || nextPlanId,
      });
    }

    const localPlan =
      typeof window !== "undefined"
        ? localStorage.getItem("selected_reading_plan")
        : null;
    setMyPlanSynced(Boolean(nextPlanId && localPlan === nextPlanId));
    setFeedback({
      type: "success",
      text: nextPlanId
        ? "Shared reading plan updated."
        : "Shared reading plan cleared.",
    });
    onCircleUpdated?.();
  }

  async function handleNewCirclePlanComplete(result: NewPlanResult) {
    if (result.kind === "preset" && result.presetId) {
      await handleSharedPlanChange(result.presetId);
    } else {
      const encoded = encodeSharedCustomPlan({
        title: result.title,
        books: result.books,
        chaptersPerDay: result.chaptersPerDay,
        restDays: result.restDays,
      });
      await handleSharedPlanChange(encoded);
    }
    setPlanModalOpen(false);
  }

  async function handleSyncMyPlan() {
    if (!userId || !sharedPlanId) return;
    const parsed = parseSharedPlan(sharedPlanId);
    if (!parsed) return;
    setSyncingMyPlan(true);
    setFeedback(null);

    try {
      const supabase = createClient();
      if (parsed.kind === "preset") {
        if (typeof window !== "undefined") {
          localStorage.setItem("selected_reading_plan", parsed.preset.id);
        }
        const { error } = await supabase
          .from("custom_schedules")
          .update({ is_active: false })
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error: deactivateErr } = await supabase
          .from("custom_schedules")
          .update({ is_active: false })
          .eq("user_id", userId);
        if (deactivateErr) throw deactivateErr;

        const items: CustomScheduleSlot[] = [
          {
            timeOfDay: "Morning",
            track: parsed.custom.books.join(", "),
            chaptersPerDay: parsed.custom.chaptersPerDay,
          },
        ];
        const { error } = await supabase.from("custom_schedules").insert({
          user_id: userId,
          title: parsed.custom.title,
          rest_days: parsed.custom.restDays,
          schedule_items: items as unknown as Json,
          is_active: true,
        });
        if (error) throw error;
      }

      setMyPlanSynced(true);
      const title = getSharedPlanTitle(sharedPlanId) || sharedPlanId;
      setFeedback({
        type: "success",
        text: `Synced your reading plan to ${title}.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error ? err.message : "Could not sync reading plan.",
      });
    } finally {
      setSyncingMyPlan(false);
    }
  }

  async function handleLeaveCircle() {
    if (!circle || !userId) return;
    setLeavingCircle(true);
    setFeedback(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("circle_members")
      .delete()
      .eq("circle_id", circle.id)
      .eq("user_id", userId);

    if (error) {
      setLeavingCircle(false);
      setConfirmingLeave(false);
      setFeedback({ type: "error", text: error.message });
      return;
    }

    if (typeof window !== "undefined") {
      try {
        if (localStorage.getItem("active_circle_id") === circle.id) {
          localStorage.removeItem("active_circle_id");
        }
      } catch {
        // Ignore storage errors
      }
    }

    router.push("/social");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <QuietPageHeader
          title="Circle Settings"
          backHref={onBack ? undefined : `/circles/${circleId}`}
          onBack={onBack}
          backLabel="Back to Circle"
          showThemeSettings={!onBack}
        />
        <div className="p-8 bg-white border border-[#E6E1D6] rounded-2xl flex items-center justify-center text-xs text-[#6B7280]">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Loading circle settings...
        </div>
      </div>
    );
  }

  if (!circle) {
    return (
      <div className="space-y-5">
        <QuietPageHeader
          title="Circle Settings"
          backHref={onBack ? undefined : "/social"}
          onBack={onBack}
          backLabel="Back to Social"
          showThemeSettings={!onBack}
        />
        <div className="bg-white border border-[#E6E1D6] rounded-2xl p-6 text-center space-y-3">
          <p className="font-editorial text-lg font-medium text-[#1F2937]">
            Circle Not Found
          </p>
          <p className="text-xs text-[#6B7280]">
            You may not be a member of this circle.
          </p>
          <Link
            href="/social"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white text-xs font-medium transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Back to Social</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <QuietPageHeader
        title="Circle Settings"
        backHref={onBack ? undefined : `/circles/${circle.id}`}
        onBack={onBack}
        backLabel="Back to Circle"
        showThemeSettings={!onBack}
      />

      {feedback && (
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

      {/* 1. Circle Avatar & Name */}
      <section className="bg-white border border-[#E6E1D6] rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-4">
          <label className="relative cursor-pointer group shrink-0">
            <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-[#E6E1D6] dark:ring-[#2E2E2B] group-hover:ring-[#4A6B5D] bg-[#DDE6E1] dark:bg-[#212B25] text-[#4A6B5D] flex items-center justify-center font-editorial text-lg font-semibold transition-all">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={circle.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                getInitials(circle.name)
              )}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[#4A6B5D] dark:bg-[#63826A] text-white flex items-center justify-center shadow-xs">
              {uploadingAvatar ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Camera className="w-3 h-3" />
              )}
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              disabled={uploadingAvatar}
              className="hidden"
            />
          </label>

          <div className="min-w-0 flex-1">
            <p className="font-editorial text-lg font-medium text-[#1F2937] truncate">
              {circle.name}
            </p>
            <p className="text-[11px] text-[#4A6B5D] font-medium mt-0.5">
              Tap avatar to upload circle photo
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveName} className="flex gap-2 pt-1">
          <input
            type="text"
            required
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Circle name"
            className="flex-1 px-3.5 py-2 rounded-xl border border-[#E6E1D6] bg-[#FAF9F6] text-xs text-[#1F2937] focus:outline-none focus:border-[#4A6B5D]"
          />
          <button
            type="submit"
            disabled={savingName || !nameInput.trim()}
            className="px-4 py-2 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
          >
            {savingName ? "Saving..." : "Save"}
          </button>
        </form>
      </section>

      {/* 2. Invite Code */}
      <section className="bg-white border border-[#E6E1D6] rounded-2xl p-5 space-y-3">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
          Circle Invite Code
        </span>
        <div className="flex items-center justify-between bg-[#F4F1EA] border border-[#E6E1D6] rounded-xl px-3.5 py-2.5">
          <span className="font-mono text-sm font-semibold tracking-widest text-[#1F2937]">
            {circle.invite_code}
          </span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(circle.invite_code);
              setCopiedCode(true);
              if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
              copiedTimerRef.current = setTimeout(() => {
                setCopiedCode(false);
                copiedTimerRef.current = null;
              }, 2000);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E6E1D6] text-xs font-semibold text-[#4A6B5D] hover:bg-[#EBF1EE] transition-colors cursor-pointer"
          >
            {copiedCode ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* 3. Shared Reading Plan */}
      <section className="bg-white dark:bg-[#1C1C1A] border border-[#E6E1D6] dark:border-[#2C2C28] rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#4A6B5D] dark:text-[#7C9A82]" />
            <h2 className="font-editorial text-base font-semibold text-[#1F2937] dark:text-[#F3F2EE]">
              Shared Reading Plan
            </h2>
          </div>
          {sharedPlanId && (
            <button
              type="button"
              disabled={savingPlan}
              onClick={() => handleSharedPlanChange("")}
              className="text-xs font-medium text-[#6B7280] dark:text-[#A1A19A] hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-[#E6E1D6] dark:border-[#2C2C28] bg-[#FAF9F6] dark:bg-[#141413]">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#1F2937] dark:text-[#F3F2EE] truncate">
              {sharedPlanId
                ? getSharedPlanTitle(sharedPlanId)
                : "No shared plan"}
            </p>
            {(() => {
              const parsed = parseSharedPlan(sharedPlanId);
              if (!parsed || parsed.kind !== "custom") return null;
              const restStr = parsed.custom.restDays
                .map((d) => WEEKDAYS.find((w) => w.day === d)?.short || "")
                .filter(Boolean)
                .join(", ");
              return (
                <p className="text-[11px] text-[#6B7280] dark:text-[#A1A19A]">
                  {parsed.custom.chaptersPerDay} ch/day
                  {restStr ? ` · Rest: ${restStr}` : ""}
                </p>
              );
            })()}
          </div>
          <button
            type="button"
            disabled={savingPlan}
            onClick={() => setPlanModalOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-[#E6E1D6] dark:border-[#2C2C28] bg-white dark:bg-[#1C1C1A] text-xs font-semibold text-[#4A6B5D] dark:text-[#7C9A82] hover:bg-[#EBF1EE] dark:hover:bg-[#202923] transition-colors shrink-0 cursor-pointer"
          >
            {sharedPlanId ? "Change" : "+ Set Plan"}
          </button>
        </div>

        {sharedPlanId && (
          <button
            type="button"
            disabled={syncingMyPlan}
            onClick={handleSyncMyPlan}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              myPlanSynced
                ? "bg-[#EBF1EE] border border-[#CFE0D6] text-[#3D5A4E]"
                : "bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white"
            }`}
          >
            {syncingMyPlan ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : myPlanSynced ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>
              {myPlanSynced
                ? "Synced with Your Plan"
                : "Sync My Plan to Circle"}
            </span>
          </button>
        )}
      </section>

      <NewPlanFlow
        open={planModalOpen}
        mode="circle"
        saving={savingPlan}
        initialPresetId={
          sharedPlanId === "gospels-psalms" ? "gospels-psalms" : "nt-90"
        }
        onClose={() => setPlanModalOpen(false)}
        onComplete={handleNewCirclePlanComplete}
      />

      {/* 4. Leave Circle */}
      <section className="bg-white border border-[#E6E1D6] rounded-2xl p-5 space-y-3">
        {!confirmingLeave ? (
          <button
            type="button"
            onClick={() => setConfirmingLeave(true)}
            className="w-full py-2.5 px-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Leave Circle</span>
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[#6B7280] leading-relaxed">
              Leave <strong className="text-[#1F2937]">{circle.name}</strong>?
              You will need an invite code to rejoin later.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={leavingCircle}
                onClick={() => setConfirmingLeave(false)}
                className="py-2.5 px-4 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-medium text-[#1F2937] transition-colors cursor-pointer disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={leavingCircle}
                onClick={handleLeaveCircle}
                className="py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                {leavingCircle && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>{leavingCircle ? "Leaving..." : "Confirm Leave"}</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
