"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BellRing, Moon, Sun, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface RingBannerItem {
  id: string;
  senderName: string;
  message: string;
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return "FR";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Navbar() {
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [latestRing, setLatestRing] = useState<RingBannerItem | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsDark(document.documentElement.classList.contains("dark"));
    }
  }, [pathname]);

  function toggleDarkMode() {
    if (typeof window === "undefined") return;
    const nextDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem("theme_preference", nextDark ? "dark" : "light");
    setIsDark(nextDark);
  }

  useEffect(() => {
    const supabase = createClient();

    async function loadUserAndRings() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsAuthenticated(false);
        setDisplayName(null);
        setAvatarUrl(null);
        setLatestRing(null);
        return;
      }
      setIsAuthenticated(true);
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      setDisplayName(
        profile?.display_name ||
          (user.user_metadata?.display_name as string) ||
          user.email?.split("@")[0] ||
          "Reader"
      );
      setAvatarUrl(profile?.avatar_url || null);

      const since24h = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();
      const { data: ringRow } = await supabase
        .from("rings")
        .select("id, sender_id, message")
        .eq("recipient_id", user.id)
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ringRow) {
        const dismissedKey = `dismissed_ring_${ringRow.id}`;
        if (
          typeof window !== "undefined" &&
          sessionStorage.getItem(dismissedKey)
        ) {
          return;
        }
        const { data: senderProf } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", ringRow.sender_id)
          .maybeSingle();

        setLatestRing({
          id: ringRow.id,
          senderName: senderProf?.display_name || "A Circle Friend",
          message: ringRow.message,
        });
      }
    }

    loadUserAndRings();
  }, [pathname]);

  function dismissRingBanner() {
    if (latestRing && typeof window !== "undefined") {
      sessionStorage.setItem(`dismissed_ring_${latestRing.id}`, "1");
    }
    setLatestRing(null);
  }

  const isHomeActive =
    pathname === "/" ||
    pathname?.startsWith("/today") ||
    pathname?.startsWith("/plans");
  const isReaderActive = pathname?.startsWith("/reader") ?? false;
  const isCirclesActive = pathname?.startsWith("/circle") ?? false;
  const isJourneyActive = pathname?.startsWith("/journey") ?? false;

  return (
    <>
      <header className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#E6E1D6]">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Left: App Grace Mark & Title */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="w-8 h-8 rounded-xl bg-[#4A6B5D] text-white flex items-center justify-center shadow-2xs shrink-0">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 6.5v11M8.5 10h7" strokeLinecap="round" />
                <path
                  d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="font-editorial text-[19px] font-medium text-[#1F2937] tracking-tight">
              Bible Community
            </span>
          </Link>

          {/* Right: Quick Light/Dark Toggle + Circular Avatar + Display Name Chip -> /settings */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="w-8 h-8 rounded-full bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-[#1F2937] flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-[#B47B44]" />
              ) : (
                <Moon className="w-4 h-4 text-[#4A6B5D]" />
              )}
            </button>

            {isAuthenticated ? (
              <Link
                href="/settings"
                title="Account & Circle Settings"
                className="flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] transition-colors group"
              >
                <span className="w-7 h-7 rounded-full overflow-hidden ring-2 ring-[#E6E1D6] group-hover:ring-[#4A6B5D] bg-[#DDE6E1] text-[#4A6B5D] flex items-center justify-center text-[11px] font-semibold shrink-0 transition-all">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt={displayName || "Profile"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    getInitials(displayName)
                  )}
                </span>
                <span className="text-xs font-medium text-[#1F2937] max-w-[110px] truncate">
                  {displayName}
                </span>
              </Link>
            ) : (
              <Link
                href="/login"
                className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-[#4A6B5D] text-white hover:bg-[#3D5A4E] transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>

        {/* Gentle In-App Ring Notification Banner */}
        {latestRing && !isCirclesActive && (
          <div className="bg-[#EBF1EE] border-t border-[#CFE0D6] px-4 py-2">
            <div className="max-w-xl mx-auto flex items-center justify-between gap-2 text-xs text-[#3D5A4E]">
              <div className="flex items-center gap-2 min-w-0">
                <BellRing className="w-3.5 h-3.5 text-[#4A6B5D] shrink-0" />
                <span className="truncate">
                  <strong>{latestRing.senderName}</strong>:{" "}
                  <em className="font-editorial">
                    &ldquo;{latestRing.message}&rdquo;
                  </em>
                </span>
              </div>
              <button
                type="button"
                onClick={dismissRingBanner}
                className="p-0.5 text-[#6B7280] hover:text-[#1F2937] cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Minimal Bottom Navigation Bar (4 Tabs matching docs/ui-reference.html) */}
      <nav
        aria-label="Primary Bottom Navigation"
        className="fixed bottom-0 inset-x-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-t border-[#E6E1D6]"
      >
        <div className="max-w-xl mx-auto px-4 pt-2 pb-4 flex items-center justify-around">
          <Link
            href="/"
            className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${
              isHomeActive
                ? "text-[#4A6B5D]"
                : "text-[#6B7280] hover:text-[#1F2937]"
            }`}
          >
            <div
              className={
                isHomeActive ? "bg-[#EBF1EE] p-1.5 rounded-xl" : "p-1.5"
              }
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5z"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-[10.5px] font-medium tracking-tight">
              Home
            </span>
          </Link>

          <Link
            href="/reader"
            className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${
              isReaderActive
                ? "text-[#4A6B5D]"
                : "text-[#6B7280] hover:text-[#1F2937]"
            }`}
          >
            <div
              className={
                isReaderActive ? "bg-[#EBF1EE] p-1.5 rounded-xl" : "p-1.5"
              }
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
                  strokeLinecap="round"
                />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <span className="text-[10.5px] font-medium tracking-tight">
              Reader
            </span>
          </Link>

          <Link
            href="/circle"
            className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${
              isCirclesActive
                ? "text-[#4A6B5D]"
                : "text-[#6B7280] hover:text-[#1F2937]"
            }`}
          >
            <div
              className={
                isCirclesActive ? "bg-[#EBF1EE] p-1.5 rounded-xl" : "p-1.5"
              }
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
              >
                <path
                  d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-[10.5px] font-medium tracking-tight">
              Circles
            </span>
          </Link>

          <Link
            href="/journey"
            className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${
              isJourneyActive
                ? "text-[#4A6B5D]"
                : "text-[#6B7280] hover:text-[#1F2937]"
            }`}
          >
            <div
              className={
                isJourneyActive ? "bg-[#EBF1EE] p-1.5 rounded-xl" : "p-1.5"
              }
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-[10.5px] font-medium tracking-tight">
              Journey
            </span>
          </Link>
        </div>
      </nav>
    </>
  );
}
