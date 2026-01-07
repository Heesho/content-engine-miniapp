"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther, formatUnits } from "viem";
import type { CommunityListItem } from "@/hooks/useAllCommunities";
import { cn } from "@/lib/utils";
import { ipfsToHttp, USDC_DECIMALS } from "@/lib/constants";

const formatUsd = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
};

const formatUsdc = (value: bigint) => {
  const num = Number(formatUnits(value, USDC_DECIMALS));
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  if (num >= 1) return `$${num.toFixed(2)}`;
  return `$${num.toFixed(4)}`;
};

type CommunityCardProps = {
  community: CommunityListItem;
  donutUsdPrice?: number;
  isNew?: boolean;
  isActive?: boolean;
};

export function CommunityCard({
  community,
  donutUsdPrice = 0.01,
  isNew = false,
  isActive = false,
}: CommunityCardProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Calculate market value using unit price in DONUT
  const unitPriceUsd =
    community.unitPrice > 0n
      ? Number(formatEther(community.unitPrice)) * donutUsdPrice
      : 0;

  // Fetch metadata to get image URL
  useEffect(() => {
    if (!community.uri) return;

    const metadataUrl = ipfsToHttp(community.uri);
    if (!metadataUrl) return;

    fetch(metadataUrl)
      .then((res) => res.json())
      .then((metadata) => {
        if (metadata.image) {
          setLogoUrl(ipfsToHttp(metadata.image));
        }
      })
      .catch(() => {
        // Silently fail - will show fallback
      });
  }, [community.uri]);

  return (
    <Link href={`/community/${community.address}`} className="block mb-1.5">
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer",
          isNew && "animate-bump-enter",
          isActive && !isNew && "animate-bump-glow"
        )}
      >
        {/* Community Logo */}
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center overflow-hidden">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={community.tokenSymbol}
              className="w-12 h-12 object-cover rounded-xl"
            />
          ) : (
            <span className="text-teal-500 font-bold text-lg">
              {community.tokenSymbol.slice(0, 2)}
            </span>
          )}
        </div>

        {/* Community Name & Symbol */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">
            {community.tokenName}
          </div>
          <div className="text-sm text-gray-500">{community.tokenSymbol}</div>
        </div>

        {/* Content Count & Price */}
        <div className="flex-shrink-0 text-right">
          <div className="text-sm font-semibold text-teal-500">
            {community.totalContent.toString()} posts
          </div>
          <div className="text-xs text-gray-500">
            {formatUsd(unitPriceUsd)}
          </div>
        </div>
      </div>
    </Link>
  );
}
