import type { Metadata } from "next";
import CommunityDetailPage from "./client-page";

const appDomain = process.env.NEXT_PUBLIC_APP_URL || "https://content-engine.vercel.app";
const heroImageUrl = `${appDomain}/media/hero.png`;
const splashImageUrl = `${appDomain}/media/splash.png`;

type Props = {
  params: Promise<{ address: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const communityAddress = address.toLowerCase();

  const communityUrl = `${appDomain}/community/${communityAddress}`;

  // Mini app embed with community-specific URL
  const miniAppEmbed = {
    version: "1",
    imageUrl: heroImageUrl,
    button: {
      title: "Collect Content!",
      action: {
        type: "launch_miniapp" as const,
        name: "Content Engine",
        url: communityUrl,
        splashImageUrl,
        splashBackgroundColor: "#000000",
      },
    },
  };

  return {
    title: `Community | Content Engine`,
    description: `Collect content and earn rewards on Content Engine.`,
    openGraph: {
      title: `Community | Content Engine`,
      description: `Collect content and earn rewards on Content Engine.`,
      url: communityUrl,
      images: [
        {
          url: heroImageUrl,
        },
      ],
    },
    other: {
      "fc:miniapp": JSON.stringify(miniAppEmbed),
    },
  };
}

export default function Page() {
  return <CommunityDetailPage />;
}
