import { redirect } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import CircleWorkspace from "@/components/circle/CircleWorkspace";
import { getInitialSessionProfile } from "@/lib/auth/server-auth";

export default async function CircleHomePage({
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
    <div className="min-h-dvh flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-[4.5rem]">
      <Navbar
        variant="inner"
        initialUserId={session.userId}
        initialDisplayName={session.displayName}
        initialAvatarUrl={session.avatarUrl}
      />
      <main className="flex-1 min-h-0 max-w-xl w-full mx-auto flex flex-col">
        <CircleWorkspace circleId={id} initialUserId={session.userId} />
      </main>
    </div>
  );
}
