import type { SVGProps } from "react";

/** Minimal botanical olive branch line drawing for calm empty states & accents. */
export function OliveBranchMark({
  className = "w-8 h-8 text-[#4A6B5D]",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M8 28C14 22 20 15 28 8" />
      <path d="M14 22c-3.5-.5-5-2.5-4.5-5 2.5-.5 4.5 1 4.5 5z" />
      <path d="M19 17c.5-3.5 2.5-5 5-4.5.5 2.5-1 4.5-5 4.5z" />
      <path d="M22 14c-3.5-.5-5-2.5-4.5-5 2.5-.5 4.5 1 4.5 5z" />
      <path d="M13 23c3.5.5 5 2.5 4.5 5-2.5.5-4.5-1-4.5-5z" />
    </svg>
  );
}

/** Minimal open Scripture book line drawing. */
export function OpenBookMark({
  className = "w-8 h-8 text-[#4A6B5D]",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M18 10c-3.5-2-7.5-2-11-.5v17c3.5-1.5 7.5-1.5 11 .5" />
      <path d="M18 10c3.5-2 7.5-2 11-.5v17c-3.5-1.5-7.5-1.5-11 .5" />
      <path d="M18 10v17" />
    </svg>
  );
}

/** Minimal interlocking fellowship rings line drawing. */
export function FellowshipRingsMark({
  className = "w-8 h-8 text-[#4A6B5D]",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <circle cx="14" cy="18" r="7.5" />
      <circle cx="22" cy="18" r="7.5" />
    </svg>
  );
}

/** Minimal quiet lamp/candle line drawing for prayer & reflection states. */
export function CandleMark({
  className = "w-8 h-8 text-[#4A6B5D]",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M18 6c2 2.5 2.5 4.5 1 6.5a2.2 2.2 0 0 1-2 0C15.5 10.5 16 8.5 18 6z" />
      <rect x="14" y="15" width="8" height="13" rx="2" />
      <path d="M11 28h14" />
    </svg>
  );
}
