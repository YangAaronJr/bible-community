"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BellRing,
  BookOpen,
  Compass,
  LogOut,
  Sun,
  Users,
  UserCheck,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/reader", label: "Reader", icon: BookOpen },
  { href: "/circle", label: "Circle", icon: Users },
  { href: "/journey", label: "Journey", icon: Compass },
];

interface RingBannerItem {
  id: string;
  senderName: string;
  message: string;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [latestRing, setLatestRing] = useState<RingBannerItem | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function loadUserAndRings() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsAuthenticated(false);
        setDisplayName(null);
        setLatestRing(null);
        return;
      }
      setIsAuthenticated(true);
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      setDisplayName(
        profile?.display_name ||
          (user.user_metadata?.display_name as string) ||
          user.email?.split("@")[0] ||
          "Reader"
      );

      // Check for any recent incoming Ring in the last 24 hours
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

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function dismissRingBanner() {
    if (latestRing && typeof window !== "undefined") {
      sessionStorage.setItem(`dismissed_ring_${latestRing.id}`, "1");
    }
    setLatestRing(null);
  }

  return (
    <>
      <header className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-xs border-b border-[#E5E0D8]">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/today"
            className="flex items-center gap-2 font-serif font-semibold text-lg text-[#1F2937]"
          >
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#E3EBE6] text-[#4B6F5B]">
              <BookOpen className="w-4 h-4" />
            </span>
            <span>Bible Community</span>
          </Link>

          <nav className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname?.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-[#E3EBE6] text-[#3D5A4A]"
                      : "text-[#596579] hover:text-[#1F2937] hover:bg-[#F3EFEA]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <span className="hidden md:inline-flex items-center gap-1 text-xs text-[#596579] bg-[#F3EFEA] px-2.5 py-1 rounded-full">
                  <UserCheck className="w-3.5 h-3.5 text-[#4B6F5B]" />
                  {displayName}
                </span>
                <button
                  onClick={handleSignOut}
                  title="Sign Out"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#596579] hover:text-[#1F2937] hover:bg-[#F3EFEA] transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#4B6F5B] text-white hover:bg-[#3D5A4A] transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>

        {/* Global In-App Ring Notification Banner */}
        {latestRing && pathname !== "/circle" && (
          <div className="bg-[#F4F7F5] border-t border-[#C5D7CC] px-4 py-2">
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-2 text-xs text-[#3D5A4A]">
              <div className="flex items-center gap-2">
                <BellRing className="w-3.5 h-3.5 text-[#4B6F5B] shrink-0" />
                <span>
                  <strong>{latestRing.senderName}</strong> sent a Ring:{" "}
                  <em className="font-serif">&ldquo;{latestRing.message}&rdquo;</em>
                </span>
              </div>
              <button
                type="button"
                onClick={dismissRingBanner}
                className="p-0.5 text-[#596579] hover:text-[#1F2937] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-xs border-t border-[#E5E0D8] flex justify-around py-2 px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                active ? "text-[#4B6F5B]" : "text-[#596579]"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
