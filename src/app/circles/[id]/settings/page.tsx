import { redirect } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import CircleSettingsView from "@/components/circle/CircleSettingsView";
import { getInitialSessionProfile } from "@/lib/auth/server-auth";

export default async function CircleSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getInitialSessionProfile();

  if (!session.userId) {
    redirect("/login");
  }

  const { id } = await params;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-24">
      <Navbar
        variant="inner"
        initialUserId={session.userId}
        initialDisplayName={session.displayName}
        initialAvatarUrl={session.avatarUrl}
      />
      <main className="flex-1 max-w-xl w-full mx-auto px-5 pt-4 pb-6">
        <CircleSettingsView circleId={id} initialUserId={session.userId} />
      </main>
    </div>
  );
}
