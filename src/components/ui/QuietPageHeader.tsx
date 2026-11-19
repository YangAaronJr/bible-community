"use client";

import Link from "next/link";
import { ChevronLeft, Settings } from "lucide-react";
import ThemeToggleButton from "@/components/ui/ThemeToggleButton";

export function ThemeSettingsCluster({
  showSettingsLink = true,
  className = "",
}: {
  showSettingsLink?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 shrink-0 ${className}`}>
      <ThemeToggleButton />
      {showSettingsLink && (
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className="w-8 h-8 rounded-full bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-[#6B7280] hover:text-[#1F2937] flex items-center justify-center transition-colors shrink-0"
        >
          <Settings className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

export interface QuietPageHeaderProps {
  title?: string;
  subtitle?: string;
  titleAs?: "h1" | "span";
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  showThemeSettings?: boolean;
  showSettingsLink?: boolean;
  className?: string;
}

export function QuietPageHeader({
  title,
  subtitle,
  titleAs = "h1",
  backHref,
  onBack,
  backLabel = "Back",
  leftSlot,
  rightSlot,
  showThemeSettings = true,
  showSettingsLink = true,
  className = "",
}: QuietPageHeaderProps) {
  return (
    <header
      className={`flex items-center justify-between gap-2.5 min-h-[36px] ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            title={backLabel}
            className="w-8 h-8 rounded-full bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-[#1F2937] flex items-center justify-center transition-colors shrink-0 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : backHref ? (
          <Link
            href={backHref}
            aria-label={backLabel}
            title={backLabel}
            className="w-8 h-8 rounded-full bg-[#F4F1EA] hover:bg-[#EAE5DA] border border-[#E6E1D6] text-[#1F2937] flex items-center justify-center transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
        ) : null}

        {leftSlot}

        {title && (
          <div className="min-w-0">
            {titleAs === "span" ? (
              <span className="block font-editorial text-base font-semibold text-[#1F2937] truncate">
                {title}
              </span>
            ) : (
              <h1 className="font-editorial text-[26px] leading-tight font-medium text-[#1F2937] tracking-tight truncate">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-xs text-[#6B7280] mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {rightSlot}
        {showThemeSettings && (
          <ThemeSettingsCluster showSettingsLink={showSettingsLink} />
        )}
      </div>
    </header>
  );
}

export default QuietPageHeader;
