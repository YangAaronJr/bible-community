"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Camera,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import Navbar, { getInitials } from "@/components/ui/Navbar";
import QuietPageHeader from "@/components/ui/QuietPageHeader";
import { extractStorageObjectPath } from "@/lib/storage/paths";
import { createClient } from "@/lib/supabase/client";
import {
  arrayBufferToBase64,
  urlBase64ToUint8Array,
} from "@/lib/notifications/push-client";

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
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [togglingPush, setTogglingPush] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadSettings = useCallback(async () => {
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
    setLoading(false);
  }, [router]);

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

      if (
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window
      ) {
        setPushSupported(true);
        navigator.serviceWorker
          .getRegistration("/sw.js")
          .then((reg) => reg?.pushManager.getSubscription())
          .then((sub) => {
            setPushEnabled(Boolean(sub));
          })
          .catch(() => {});
      }
    }
    loadSettings();
  }, [loadSettings]);

  async function handleTogglePushNotifications() {
    if (!userId || !pushSupported || togglingPush) return;
    setTogglingPush(true);
    setFeedback(null);

    const supabase = createClient();
    try {
      if (pushEnabled) {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("user_id", userId)
            .eq("endpoint", endpoint);
        }
        setPushEnabled(false);
        setFeedback({
          type: "success",
          text: "Ring push notifications turned off for this device.",
        });
        return;
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error(
          "Web Push is not configured yet (missing NEXT_PUBLIC_VAPID_PUBLIC_KEY in .env.local)."
        );
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error(
          "Notification permission was denied. Enable notifications in your browser settings."
        );
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      const p256dh = arrayBufferToBase64(subscription.getKey("p256dh"));
      const auth = arrayBufferToBase64(subscription.getKey("auth"));

      if (!p256dh || !auth) {
        throw new Error("Browser returned an incomplete push subscription.");
      }

      const { error: dbError } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: userId,
            endpoint: subscription.endpoint,
            p256dh,
            auth,
          },
          { onConflict: "endpoint" }
        );

      if (dbError) throw dbError;

      setPushEnabled(true);
      setFeedback({
        type: "success",
        text: "Ring notifications enabled for this device.",
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Could not update push notification preference.",
      });
    } finally {
      setTogglingPush(false);
    }
  }

  function handleSelectTheme(next: "light" | "dark" | "system") {
    setThemePref(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("theme_preference", next);
      const isDark =
        next === "dark" ||
        (next === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", isDark);
      window.dispatchEvent(new Event("theme-change"));
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setUploadingAvatar(true);
    setFeedback(null);
    const previousAvatarUrl = avatarUrl;
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

      const oldPath = extractStorageObjectPath(previousAvatarUrl, "avatars");
      if (oldPath && oldPath !== filePath) {
        try {
          await supabase.storage.from("avatars").remove([oldPath]);
        } catch {
          // Best-effort cleanup of replaced avatar
        }
      }

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

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-24">
      <Navbar variant="inner" />

      <main className="flex-1 max-w-xl w-full mx-auto px-5 pt-4 pb-6 space-y-6">
        <QuietPageHeader
          title="Settings"
          subtitle="Profile, appearance & notifications"
          showThemeSettings={false}
          rightSlot={
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-xs font-medium text-[#1F2937] transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-[#6B7280]" />
              <span>Sign Out</span>
            </button>
          }
        />

        {feedback && (
          <div
            className={`px-4 py-3 rounded-2xl text-xs font-medium border ${
              feedback.type === "success"
                ? "bg-[#EBF1EE] border-[#CFE0D6] text-[#3D5A4E]"
                : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300"
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
                  className="px-4 py-2 rounded-xl bg-[#4A6B5D] hover:bg-[#3D5A4E] dark:bg-[#63826A] dark:hover:bg-[#7C9A82] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
                >
                  {savingProfile ? "Saving..." : "Save"}
                </button>
              </form>
            </section>

            {/* 2. Appearance (Light / Dark / System) */}
            <section className="bg-white border border-[#E6E1D6] rounded-2xl p-5 space-y-3">
              <h2 className="font-editorial text-base font-semibold text-[#1F2937]">
                Appearance
              </h2>

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

            {/* 3. Ring Push Notifications */}
            <section className="bg-white border border-[#E6E1D6] rounded-2xl p-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <BellRing className="w-4 h-4 text-[#B47B44] shrink-0" />
                  <h2 className="font-editorial text-base font-semibold text-[#1F2937]">
                    Enable Ring Notifications
                  </h2>
                </div>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  {pushSupported
                    ? "Gentle lock-screen reminders"
                    : "Unsupported browser"}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={pushEnabled}
                aria-label="Enable Ring Notifications"
                disabled={!pushSupported || togglingPush}
                onClick={handleTogglePushNotifications}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer disabled:opacity-50 ${
                  pushEnabled
                    ? "bg-[#4A6B5D] border-[#4A6B5D]"
                    : "bg-[#F4F1EA] border-[#E6E1D6]"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-2xs transition-transform ${
                    pushEnabled ? "translate-x-5.5" : "translate-x-1"
                  }`}
                />
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
