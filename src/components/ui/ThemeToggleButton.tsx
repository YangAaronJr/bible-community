"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

function subscribeToDarkMode(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const observer = new MutationObserver(() => {
    onStoreChange();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  const handleStorage = (event: StorageEvent) => {
    if (event.key === "theme_preference" || event.key === null) {
      try {
        const pref = localStorage.getItem("theme_preference") || "system";
        const nextDark =
          pref === "dark" ||
          (pref === "system" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.classList.toggle("dark", nextDark);
      } catch {
        // Ignore storage read errors
      }
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener("theme-change", onStoreChange);

  return () => {
    observer.disconnect();
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("theme-change", onStoreChange);
  };
}

function getDarkModeSnapshot(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

function getDarkModeServerSnapshot(): boolean {
  return false;
}

export default function ThemeToggleButton({
  className = "",
}: {
  className?: string;
}) {
  const isDark = useSyncExternalStore(
    subscribeToDarkMode,
    getDarkModeSnapshot,
    getDarkModeServerSnapshot
  );

  function toggleDarkMode() {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    const nextDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nextDark);
    try {
      localStorage.setItem("theme_preference", nextDark ? "dark" : "light");
    } catch {
      // Ignore storage write errors
    }
    window.dispatchEvent(new Event("theme-change"));
  }

  return (
    <button
      type="button"
      onClick={toggleDarkMode}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`w-8 h-8 rounded-full bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-[#1F2937] flex items-center justify-center transition-colors cursor-pointer shrink-0 ${className}`}
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-[#B47B44]" />
      ) : (
        <Moon className="w-4 h-4 text-[#4A6B5D]" />
      )}
    </button>
  );
}
