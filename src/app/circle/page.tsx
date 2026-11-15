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
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-24">
      <Navbar />
      <main className="flex-1 max-w-xl w-full mx-auto px-5 py-4">
        <CircleWorkspace />
      </main>
    </div>
  );
}
