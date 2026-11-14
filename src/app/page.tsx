import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12 text-center bg-[#FAF9F6] text-[#1F2937]">
      <div className="max-w-md w-full space-y-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#E3EBE6] text-[#4B6F5B] mb-2">
          <svg
            className="w-7 h-7"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.75}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-serif font-semibold tracking-tight text-[#1F2937]">
            Bible Community
          </h1>
          <p className="text-sm text-[#596579] leading-relaxed">
            A quiet, grace-centered sanctuary for Scripture reading and small-group fellowship. Free of performative metrics, streaks, or guilt.
          </p>
        </div>

        <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/today"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-[#4B6F5B] hover:bg-[#3D5A4A] transition-colors shadow-xs"
          >
            Begin Today
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-medium text-[#1F2937] bg-white border border-[#E5E0D8] hover:bg-[#F4F7F5] transition-colors"
          >
            Sign In / Join
          </Link>
        </div>
      </div>
    </main>
  );
}
