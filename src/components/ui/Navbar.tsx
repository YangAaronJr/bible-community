"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ThemeToggleButton from "@/components/ui/ThemeToggleButton";
import { createClient } from "@/lib/supabase/client";
import { resolveNavbarVariant, type NavbarVariant } from "@/lib/ui/nav-mode";

export interface NavbarProps {
  variant?: NavbarVariant;
  initialUserId?: string | null;
  initialDisplayName?: string | null;
  initialAvatarUrl?: string | null;
  hideBottomNav?: boolean;
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return "FR";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getLatestReadMs(
  dbIso: string | undefined,
  localIso: string | null
): number {
  const dbMs = dbIso ? new Date(dbIso).getTime() : 0;
  const localMs = localIso ? new Date(localIso).getTime() : 0;
  return Math.max(
    Number.isFinite(dbMs) ? dbMs : 0,
    Number.isFinite(localMs) ? localMs : 0
  );
}

export default function Navbar({
  variant,
  initialUserId,
  initialDisplayName = null,
  initialAvatarUrl = null,
  hideBottomNav = false,
}: NavbarProps = {}) {
  const pathname = usePathname();
  const activeVariant = variant ?? resolveNavbarVariant(pathname ?? "/");

  const [resolvedUserId, setResolvedUserId] = useState<string | null>(
    initialUserId ?? null
  );
  const [displayName, setDisplayName] = useState<string | null>(
    initialDisplayName ?? null
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    initialAvatarUrl ?? null
  );
  const [isAuthenticated, setIsAuthenticated] = useState(
    Boolean(initialUserId)
  );
  const [clientAuthResolved, setClientAuthResolved] = useState(false);
  const [hasSocialBadge, setHasSocialBadge] = useState(false);

  const authResolved = initialUserId !== undefined || clientAuthResolved;

  const refreshSocialBadge = useCallback(async (uid: string) => {
    const supabase = createClient();
    try {
      const { data: friendships } = await supabase
        .from("friendships")
        .select("id, addressee_id, status")
        .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);

      const hasIncoming = (friendships || []).some(
        (f) => f.status === "pending" && f.addressee_id === uid
      );
      if (hasIncoming) {
        setHasSocialBadge(true);
        return;
      }

      const acceptedIds = (friendships || [])
        .filter((f) => f.status === "accepted")
        .map((f) => f.id);

      if (acceptedIds.length === 0) {
        setHasSocialBadge(false);
        return;
      }

      const [{ data: readStates }, ...latestResults] = await Promise.all([
        supabase
          .from("user_read_states")
          .select("scope_id, last_read_at")
          .eq("user_id", uid)
          .eq("scope_type", "dm")
          .in("scope_id", acceptedIds),
        ...acceptedIds.map((fid) =>
          supabase
            .from("messages")
            .select("friendship_id, created_at")
            .eq("friendship_id", fid)
            .neq("sender_id", uid)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        ),
      ]);

      const readMap = new Map(
        (readStates || []).map((r) => [r.scope_id, r.last_read_at])
      );

      const unread = latestResults.some(({ data: m }) => {
        if (!m?.friendship_id) return false;
        const localLastRead =
          typeof window !== "undefined"
            ? localStorage.getItem(`dm_last_read_${m.friendship_id}`)
            : null;
        const lastReadMs = getLatestReadMs(
          readMap.get(m.friendship_id),
          localLastRead
        );
        return lastReadMs === 0 || new Date(m.created_at).getTime() > lastReadMs;
      });

      setHasSocialBadge(unread);
    } catch {
      setHasSocialBadge(false);
    }
  }, []);

  useEffect(() => {
    if (activeVariant === "login") return;

    let cancelled = false;
    const supabase = createClient();

    async function loadUserProfile() {
      try {
        let uid = initialUserId ?? null;
        let fallbackName: string | undefined;

        if (!uid) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (cancelled) return;

          if (!user) {
            setResolvedUserId(null);
            setIsAuthenticated(false);
            setDisplayName(null);
            setAvatarUrl(null);
            setHasSocialBadge(false);
            setClientAuthResolved(true);
            return;
          }
          uid = user.id;
          fallbackName =
            (user.user_metadata?.display_name as string) ||
            user.email?.split("@")[0];
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", uid)
          .maybeSingle();

        if (cancelled) return;

        setResolvedUserId(uid);
        setIsAuthenticated(true);
        setDisplayName(
          profile?.display_name || initialDisplayName || fallbackName || "Reader"
        );
        setAvatarUrl(profile?.avatar_url ?? initialAvatarUrl ?? null);
        setClientAuthResolved(true);

        await refreshSocialBadge(uid);
      } catch {
        if (!cancelled) {
          setClientAuthResolved(true);
        }
      }
    }

    void loadUserProfile();

    return () => {
      cancelled = true;
    };
  }, [
    activeVariant,
    initialUserId,
    initialDisplayName,
    initialAvatarUrl,
    pathname,
    refreshSocialBadge,
  ]);

  useEffect(() => {
    if (activeVariant === "login" || !resolvedUserId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`navbar-social-badge-${resolvedUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => {
          refreshSocialBadge(resolvedUserId);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as {
            friendship_id?: string | null;
            sender_id?: string;
          };
          if (msg.friendship_id && msg.sender_id !== resolvedUserId) {
            refreshSocialBadge(resolvedUserId);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_read_states",
          filter: `user_id=eq.${resolvedUserId}`,
        },
        () => {
          refreshSocialBadge(resolvedUserId);
        }
      )
      .subscribe();

    const handleFocus = () => {
      refreshSocialBadge(resolvedUserId);
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      supabase.removeChannel(channel);
    };
  }, [activeVariant, resolvedUserId, refreshSocialBadge]);

  const isHomeActive =
    pathname === "/" ||
    pathname?.startsWith("/today") ||
    pathname?.startsWith("/plans");
  const isReaderActive = pathname?.startsWith("/reader") ?? false;
  const isSocialActive =
    pathname?.startsWith("/social") ||
    pathname?.startsWith("/circle") ||
    pathname?.startsWith("/members") ||
    pathname?.startsWith("/dm") ||
    false;
  const isJourneyActive = pathname?.startsWith("/journey") ?? false;

  const showBrandedHeader =
    activeVariant === "home" || activeVariant === "login";
  const showBottomNav = activeVariant !== "login" && !hideBottomNav;

  if (!showBrandedHeader && !showBottomNav) {
    return null;
  }

  return (
    <>
      {showBrandedHeader && (
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

            {/* Right: Quick Light/Dark Toggle + Profile Chip or Sign In (Home only) */}
            <div className="flex items-center gap-2">
              <ThemeToggleButton />

              {activeVariant === "home" && (
                <>
                  {!authResolved ? (
                    <span
                      aria-hidden="true"
                      className="w-24 h-8 rounded-full bg-[#F4F1EA] border border-[#E6E1D6] animate-pulse"
                    />
                  ) : isAuthenticated ? (
                    <Link
                      href="/settings"
                      title="Personal Settings"
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
                        {displayName || initialDisplayName || "Reader"}
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
                </>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Minimal Bottom Navigation Bar */}
      {showBottomNav && (
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
              href="/social"
              className={`relative flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${
                isSocialActive
                  ? "text-[#4A6B5D]"
                  : "text-[#6B7280] hover:text-[#1F2937]"
              }`}
            >
              <div
                className={`relative ${
                  isSocialActive ? "bg-[#EBF1EE] p-1.5 rounded-xl" : "p-1.5"
                }`}
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <circle cx="9" cy="7" r="4" />
                  <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
                  <circle cx="17" cy="9" r="3" />
                  <path d="M21 21v-1.5a3 3 0 0 0-2.5-2.96" />
                </svg>
                {hasSocialBadge && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#4A6B5D] ring-2 ring-[#FAF9F6] dark:ring-[#141413]" />
                )}
              </div>
              <span className="text-[10.5px] font-medium tracking-tight">
                Social
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
      )}
    </>
  );
}
