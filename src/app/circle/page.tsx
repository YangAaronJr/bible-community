import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/ui/Navbar";
import CircleWorkspace from "@/components/circle/CircleWorkspace";

export default async function CirclePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-20 sm:pb-12">
      <Navbar />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-serif font-semibold text-[#1F2937]">
            Fellowship Circle
          </h1>
          <p className="text-sm text-[#596579]">
            Intimate, invite-only small groups (up to 12 members) for shared
            Scripture reflection, physical notebook photos, and prayer.
          </p>
        </div>

        <CircleWorkspace />
      </main>
    </div>
  );
}
