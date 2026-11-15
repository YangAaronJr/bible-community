import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/ui/Navbar";
import CircleSettingsView from "@/components/circle/CircleSettingsView";

export default async function CircleSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-24">
      <Navbar />
      <main className="flex-1 max-w-xl w-full mx-auto px-5 py-6">
        <CircleSettingsView circleId={id} />
      </main>
    </div>
  );
}
