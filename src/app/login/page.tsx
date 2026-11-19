"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, ArrowRight, Loader2 } from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const supabase = createClient();

    try {
      if (mode === "signup") {
        const cleanName = displayName.trim() || email.split("@")[0] || "Reader";
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: cleanName,
            },
          },
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          // Ensure profile exists with display_name
          await supabase.from("profiles").upsert(
            {
              id: data.user.id,
              display_name: cleanName,
            },
            { onConflict: "id" }
          );
        }

        if (data.session) {
          router.push("/circle");
          router.refresh();
          return;
        } else {
          setMessage(
            "Account created! You can now sign in with your email and password."
          );
          setMode("signin");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) throw signInError;

        router.push("/");
        router.refresh();
        return;
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please check your credentials.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937]">
      <Navbar variant="login" />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md bg-white border border-[#E5E0D8] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="text-center space-y-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#E3EBE6] text-[#4B6F5B] mb-1"
          >
            <BookOpen className="w-6 h-6" />
          </Link>
          <h1 className="text-2xl font-serif font-semibold text-[#1F2937]">
            {mode === "signin" ? "Welcome Back" : "Join the Fellowship"}
          </h1>
          <p className="text-sm text-[#596579]">
            {mode === "signin"
              ? "Enter your quiet space for Scripture and small-group fellowship."
              : "Create a private account—no public profiles, streaks, or noise."}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-[#F3EFEA] rounded-xl text-sm font-medium">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            className={`py-2 rounded-lg transition-colors cursor-pointer ${
              mode === "signin"
                ? "bg-white text-[#1F2937] shadow-2xs"
                : "text-[#596579] hover:text-[#1F2937]"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            className={`py-2 rounded-lg transition-colors cursor-pointer ${
              mode === "signup"
                ? "bg-white text-[#1F2937] shadow-2xs"
                : "text-[#596579] hover:text-[#1F2937]"
            }`}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="p-3 rounded-lg bg-[#F4F7F5] border border-[#C5D7CC] text-xs text-[#3D5A4A]">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1">
                First Name or Display Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Aaron"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5E0D8] bg-[#FAF9F6] text-sm text-[#1F2937] focus:outline-none focus:border-[#4B6F5B]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#1F2937] mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5E0D8] bg-[#FAF9F6] text-sm text-[#1F2937] focus:outline-none focus:border-[#4B6F5B]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1F2937] mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5E0D8] bg-[#FAF9F6] text-sm text-[#1F2937] focus:outline-none focus:border-[#4B6F5B]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#4B6F5B] hover:bg-[#3D5A4A] disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>
                  {mode === "signin" ? "Sign In" : "Create Private Account"}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
      </main>
    </div>
  );
}
