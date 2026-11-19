import { redirect } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import FriendDmRoom from "@/components/dm/FriendDmRoom";
import { getInitialSessionProfile } from "@/lib/auth/server-auth";

export default async function FriendDmPage({
  params,
}: {
  params: Promise<{ friendshipId: string }>;
}) {
  const { friendshipId } = await params;
  const session = await getInitialSessionProfile();

  if (!session.userId) {
    redirect("/login");
  }

  return (
    <div className="h-dvh flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-[4.5rem] overflow-hidden">
      <Navbar
        variant="inner"
        initialUserId={session.userId}
        initialDisplayName={session.displayName}
        initialAvatarUrl={session.avatarUrl}
      />
      <main className="flex-1 min-h-0 max-w-xl w-full mx-auto flex flex-col">
        <FriendDmRoom
          friendshipId={friendshipId}
          initialUserId={session.userId}
        />
      </main>
    </div>
  );
}
