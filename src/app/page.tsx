import HomeClient from "@/components/home/HomeClient";
import { getInitialSessionProfile } from "@/lib/auth/server-auth";

export default async function HomePage() {
  const session = await getInitialSessionProfile();
  return <HomeClient {...session} />;
}
