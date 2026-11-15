"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Camera,
  Check,
  Copy,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  PlusCircle,
  Shield,
  Sun,
  Users,
} from "lucide-react";
import Navbar, { getInitials } from "@/components/ui/Navbar";
import { createClient } from "@/lib/supabase/client";

interface CircleSummary {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  max_members: number;
  my_role: "member" | "leader";
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [themePref, setThemePref] = useState<"light" | "dark" | "system">(
    "system"
  );
  const [circles, setCircles] = useState<CircleSummary[]>([]);
  const [activeCircleId, setActiveCircleId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const [newCircleName, setNewCircleName] = useState("");
  const [creatorIsLeader, setCreatorIsLeader] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadSettings = useCallback(
    async (preferredCircleId?: string) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);
      setEmail(user.email || "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      setDisplayName(
        profile?.display_name ||
          (user.user_metadata?.display_name as string) ||
          user.email?.split("@")[0] ||
          "Fellow Reader"
      );
      setAvatarUrl(profile?.avatar_url || null);

      const { data: memberships } = await supabase
        .from("circle_members")
        .select("circle_id, role")
        .eq("user_id", user.id);

      const roleByCircle = new Map<string, "member" | "leader">();
      for (const m of memberships || []) {
        roleByCircle.set(m.circle_id, m.role);
      }

      const circleIds = Array.from(roleByCircle.keys());
      if (circleIds.length === 0) {
        setCircles([]);
        setActiveCircleId(null);
        setLoading(false);
        return;
      }

      const { data: circleRows } = await supabase
        .from("circles")
        .select("id, name, invite_code, created_by, max_members")
        .in("id", circleIds)
        .order("created_at", { ascending: true });

      const summaries: CircleSummary[] = (circleRows || []).map((c) => ({
        ...c,
        my_role: roleByCircle.get(c.id) || "member",
      }));

      setCircles(summaries);

      const savedId =
        typeof window !== "undefined"
          ? localStorage.getItem("active_circle_id")
          : null;
      const chosen =
        summaries.find((c) => c.id === (preferredCircleId || savedId)) ||
        summaries[0] ||
        null;

      if (chosen) {
        setActiveCircleId(chosen.id);
        if (typeof window !== "undefined") {
          localStorage.setItem("active_circle_id", chosen.id);
        }
      }
      setLoading(false);
    },
    [router]
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme_preference");
      if (
        savedTheme === "light" ||
        savedTheme === "dark" ||
        savedTheme === "system"
      ) {
        setThemePref(savedTheme);
      }
    }
    loadSettings();
  }, [loadSettings]);

  function handleSelectTheme(next: "light" | "dark" | "system") {
    setThemePref(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("theme_preference", next);
      const isDark =
        next === "dark" ||
        (next === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", isDark);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setUploadingAvatar(true);
    setFeedback(null);
    const supabase = createClient();

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const filePath = `${userId}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const { error: updateError } = await supabase.from("profiles").upsert(
        {
          id: userId,
          display_name: displayName.trim() || "Fellow Reader",
          avatar_url: publicUrl,
        },
        { onConflict: "id" }
      );

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      setFeedback({ type: "success", text: "Profile photo updated." });
      router.refresh();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error ? err.message : "Could not upload profile photo.",
      });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !displayName.trim()) return;
    setSavingProfile(true);
    setFeedback(null);

    const supabase = createClient();
    const { error } = await supabase.from("profiles").upsert(
      {
        id: userId,
        display_name: displayName.trim(),
        avatar_url: avatarUrl,
      },
      { onConflict: "id" }
    );

    setSavingProfile(false);
    if (error) {
      setFeedback({ type: "error", text: error.message });
    } else {
      setFeedback({ type: "success", text: "Display name saved." });
      router.refresh();
    }
  }

  async function handleToggleMyLeaderBadge() {
    if (!userId || !activeCircle) return;
    const nextRole = activeCircle.my_role === "leader" ? "member" : "leader";
    const supabase = createClient();

    const { error } = await supabase
      .from("circle_members")
      .update({ role: nextRole })
      .eq("circle_id", activeCircle.id)
      .eq("user_id", userId);

    if (error) {
      setFeedback({ type: "error", text: error.message });
    } else {
      setFeedback({
        type: "success",
        text:
          nextRole === "leader"
            ? "Leader / Pastor badge enabled for this Circle."
            : "Leader / Pastor badge removed.",
      });
      await loadSettings(activeCircle.id);
    }
  }

  async function handleCreateCircle(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !newCircleName.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const supabase = createClient();
    const code = generateInviteCode();

    try {
      const { data: created, error: createError } = await supabase
        .from("circles")
        .insert({
          name: newCircleName.trim(),
          invite_code: code,
          created_by: userId,
          max_members: 12,
        })
        .select("id, name, invite_code")
        .single();

      if (createError) throw createError;

      const { error: memberError } = await supabase
        .from("circle_members")
        .insert({
          circle_id: created.id,
          user_id: userId,
          role: creatorIsLeader ? "leader" : "member",
        });

      if (memberError) throw memberError;

      setNewCircleName("");
      setCreatorIsLeader(false);
      setFeedback({
        type: "success",
        text: `Created "${created.name}" · Invite code: ${created.invite_code}`,
      });
      await loadSettings(created.id);
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Could not create circle.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCodeInput.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc("join_circle_by_code", {
        code: inviteCodeInput.trim().toUpperCase(),
      });

      if (error) throw error;
      const result = data as {
        circle_id: string;
        name: string;
        already_member?: boolean;
      };
      setInviteCodeInput("");
      setFeedback({
        type: "success",
        text: result.already_member
          ? `Already in "${result.name}".`
          : `Joined "${result.name}"!`,
      });
      await loadSettings(result.circle_id);
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to join circle.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const activeCircle =
    circles.find((c) => c.id === activeCircleId) || circles[0] || null;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-24">
      <Navbar />

      <main className="flex-1 max-w-xl w-full mx-auto px-5 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-editorial text-[28px] leading-none font-medium text-[#1F2937] tracking-tight">
              Settings
            </h1>
            <p className="text-xs text-[#6B7280] mt-1">
              Profile photo, circle invite codes &amp; membership
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-medium text-[#1F2937] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-[#6B7280]" />
            <span>Sign Out</span>
          </button>
        </div>

        {feedback && (
          <div
            className={`px-4 py-3 rounded-2xl text-xs font-medium border ${
              feedback.type === "success"
                ? "bg-[#EBF1EE] border-[#CFE0D6] text-[#3D5A4E]"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {feedback.text}
          </div>
        )}

        {loading ? (
          <div className="p-8 bg-white border border-[#E6E1D6] rounded-2xl flex items-center justify-center text-xs text-[#6B7280]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading settings...
          </div>
        ) : (
          <>
            {/* 1. Profile Photo & Display Name */}
            <section className="bg-white border border-[#E6E1D6] rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-4">
                <label className="relative cursor-pointer group shrink-0">
                  <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-[#E6E1D6] group-hover:ring-[#4A6B5D] bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center text-lg font-semibold transition-all">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      getInitials(displayName)
                    )}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[#4A6B5D] text-white flex items-center justify-center shadow-xs">
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
                  <p className="text-sm font-semibold text-[#1F2937] truncate">
                    {displayName}
                  </p>
                  <p className="text-xs text-[#6B7280] truncate">{email}</p>
                  <p className="text-[11px] text-[#4A6B5D] font-medium mt-1">
                    Tap avatar to upload profile photo
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="flex gap-2 pt-1">
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className="flex-1 px-3.5 py-2 rounded-xl border border-[#E6E1D6] bg-[#FAF9F6] text-xs text-[#1F2937] focus:outline-none focus:border-[#4A6B5D]"
                />
                <button
                  type="submit"
                  disabled={savingProfile || !displayName.trim()}
                  className="px-4 py-2 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
                >
                  {savingProfile ? "Saving..." : "Save"}
                </button>
              </form>
            </section>

            {/* Appearance (Light / Dark / System) */}
            <section className="bg-white border border-[#E6E1D6] rounded-2xl p-5 space-y-3">
              <div>
                <h2 className="font-editorial text-base font-semibold text-[#1F2937]">
                  Appearance
                </h2>
                <p className="text-xs text-[#6B7280]">
                  Choose warm paper light mode or eye-friendly night reading
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-[#F4F1EA] border border-[#E6E1D6]">
                {(
                  [
                    { id: "light", label: "Light", icon: Sun },
                    { id: "dark", label: "Dark", icon: Moon },
                    { id: "system", label: "System", icon: Monitor },
                  ] as const
                ).map(({ id, label, icon: Icon }) => {
                  const active = themePref === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSelectTheme(id)}
                      className={`py-2 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        active
                          ? "bg-[#4A6B5D] text-white shadow-2xs"
                          : "text-[#6B7280] hover:text-[#1F2937]"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 2. Active Circle Invite Code & Leader Badge */}
            {activeCircle && (
              <section className="bg-white border border-[#E6E1D6] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#4A6B5D]">
                      Active Circle
                    </span>
                    <h2 className="font-editorial text-lg font-semibold text-[#1F2937]">
                      {activeCircle.name}
                    </h2>
                  </div>

                  {circles.length > 1 && (
                    <select
                      value={activeCircle.id}
                      onChange={(e) => {
                        setActiveCircleId(e.target.value);
                        localStorage.setItem("active_circle_id", e.target.value);
                      }}
                      className="text-xs border border-[#E6E1D6] rounded-xl px-3 py-1.5 bg-[#FAF9F6] text-[#1F2937]"
                    >
                      {circles.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Copy Invite Code Row */}
                <div className="flex items-center justify-between bg-[#F4F1EA] border border-[#E6E1D6] rounded-xl px-3.5 py-2.5">
                  <div>
                    <p className="text-[10.5px] text-[#6B7280] font-medium">
                      Circle Invite Code (Max 12)
                    </p>
                    <p className="font-mono text-sm font-semibold tracking-widest text-[#1F2937]">
                      {activeCircle.invite_code}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(activeCircle.invite_code);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
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

                {/* Optional Leader / Pastor Badge Toggle */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-[#EBF1EE] text-[#4A6B5D] flex items-center justify-center shrink-0">
                      <Shield className="w-4 h-4" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-[#1F2937]">
                        Optional Leader / Pastor Badge
                      </p>
                      <p className="text-[11px] text-[#6B7280]">
                        Shows a gentle &ldquo;Leader&rdquo; tag beside your name
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleMyLeaderBadge}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      activeCircle.my_role === "leader"
                        ? "bg-[#4A6B5D] border-[#4A6B5D] text-white"
                        : "bg-[#FAF9F6] border-[#E6E1D6] text-[#6B7280] hover:text-[#1F2937]"
                    }`}
                  >
                    {activeCircle.my_role === "leader" ? "Active" : "Enable"}
                  </button>
                </div>
              </section>
            )}

            {/* 3. Join via Invite Code & Create a Circle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <form
                onSubmit={handleJoinByCode}
                className="bg-white border border-[#E6E1D6] rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[#1F2937]">
                  <KeyRound className="w-4 h-4 text-[#4A6B5D]" />
                  <span>Join via Invite Code</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="e.g. 8HA99L"
                    value={inviteCodeInput}
                    onChange={(e) =>
                      setInviteCodeInput(e.target.value.toUpperCase())
                    }
                    className="flex-1 px-3 py-2 rounded-xl border border-[#E6E1D6] bg-[#FAF9F6] text-xs font-mono uppercase tracking-wider text-[#1F2937] focus:outline-none focus:border-[#4A6B5D]"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-3.5 py-2 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    Join
                  </button>
                </div>
              </form>

              <form
                onSubmit={handleCreateCircle}
                className="bg-white border border-[#E6E1D6] rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[#1F2937]">
                  <PlusCircle className="w-4 h-4 text-[#4A6B5D]" />
                  <span>Create a Circle (Max 12)</span>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Circle Name"
                  value={newCircleName}
                  onChange={(e) => setNewCircleName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E6E1D6] bg-[#FAF9F6] text-xs text-[#1F2937] focus:outline-none focus:border-[#4A6B5D]"
                />
                <label className="flex items-center gap-2 text-[11px] text-[#6B7280] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={creatorIsLeader}
                    onChange={(e) => setCreatorIsLeader(e.target.checked)}
                    className="rounded border-[#E6E1D6] text-[#4A6B5D]"
                  />
                  <span>Include Leader / Pastor badge</span>
                </label>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#1F2937] hover:bg-[#374151] text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Create Circle</span>
                </button>
              </form>
            </div>

            <div className="text-center pt-1">
              <Link
                href="/circle"
                className="text-xs font-medium text-[#4A6B5D] hover:underline"
              >
                &larr; Return to Circles Inbox
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
