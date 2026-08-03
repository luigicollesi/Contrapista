import { HomePage } from "@/components/home/home-page";
import { createPublicMetadata, SITE_DESCRIPTION } from "@/lib/site-metadata";

export const metadata = createPublicMetadata({
  title: "Dedução competitiva online",
  description: SITE_DESCRIPTION,
  path: "/",
});

export default function Home() {
  return <HomePage />;
}
