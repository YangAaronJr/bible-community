import { redirect } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import QuietPageHeader from "@/components/ui/QuietPageHeader";
import SocialHub from "@/components/social/SocialHub";
import { getInitialSessionProfile } from "@/lib/auth/server-auth";

export default async function SocialPage() {
  const session = await getInitialSessionProfile();

  if (!session.userId) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1F2937] pb-24">
      <Navbar
        variant="inner"
        initialUserId={session.userId}
        initialDisplayName={session.displayName}
        initialAvatarUrl={session.avatarUrl}
      />
      <main className="flex-1 max-w-xl w-full mx-auto px-5 pt-4 pb-4 space-y-4">
        <QuietPageHeader title="Social" />
        <SocialHub initialUserId={session.userId} />
      </main>
    </div>
  );
}
