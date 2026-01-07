"use client";

import { useState, useEffect } from "react";
import { formatUnits } from "viem";
import { ExternalLink, User, ImageIcon, FileText, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ipfsToHttp, USDC_DECIMALS } from "@/lib/constants";
import type { ContentPiece } from "@/hooks/useContentFeed";
import type { ContentMetadata } from "@/lib/contracts";
import { CollectButton } from "./collect-button";

type ContentCardProps = {
  piece: ContentPiece;
  metadata?: ContentMetadata;
  creatorName?: string;
  creatorAvatar?: string;
  ownerName?: string;
  ownerAvatar?: string;
  onCollect?: () => void;
  isCollecting?: boolean;
  showCollectButton?: boolean;
};

const formatUsdc = (value: bigint) => {
  const num = Number(formatUnits(value, USDC_DECIMALS));
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  if (num >= 1) return `$${num.toFixed(2)}`;
  if (num >= 0.01) return `$${num.toFixed(2)}`;
  return `$${num.toFixed(4)}`;
};

const truncateAddress = (address: string) => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export function ContentCard({
  piece,
  metadata: propMetadata,
  creatorName,
  creatorAvatar,
  ownerName,
  ownerAvatar,
  onCollect,
  isCollecting = false,
  showCollectButton = true,
}: ContentCardProps) {
  const [metadata, setMetadata] = useState<ContentMetadata | null>(
    propMetadata ?? null
  );
  const [imageError, setImageError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Fetch metadata from IPFS if not provided
  useEffect(() => {
    if (propMetadata) {
      setMetadata(propMetadata);
      return;
    }

    if (!piece.tokenUri) return;

    const metadataUrl = ipfsToHttp(piece.tokenUri);
    if (!metadataUrl) return;

    fetch(metadataUrl)
      .then((res) => res.json())
      .then((data) => setMetadata(data as ContentMetadata))
      .catch(() => setMetadata(null));
  }, [piece.tokenUri, propMetadata]);

  const imageUrl = metadata?.image ? ipfsToHttp(metadata.image) : null;
  const contentType = metadata?.contentType ?? "image";

  // Render content based on type
  const renderContent = () => {
    if (contentType === "image" && imageUrl && !imageError) {
      return (
        <div className="relative w-full aspect-square bg-zinc-800 rounded-lg overflow-hidden">
          <img
            src={imageUrl}
            alt={metadata?.name ?? "Content"}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        </div>
      );
    }

    if (contentType === "text" && metadata?.text) {
      const text = metadata.text;
      const isLong = text.length > 280;
      const displayText = expanded || !isLong ? text : text.slice(0, 280) + "...";

      return (
        <div className="bg-zinc-800 rounded-lg p-4">
          <p className="text-white whitespace-pre-wrap break-words">
            {displayText}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-purple-500 text-sm mt-2 hover:text-purple-400"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      );
    }

    if (contentType === "link" && metadata?.link) {
      const preview = metadata.linkPreview;
      return (
        <a
          href={metadata.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-zinc-800 rounded-lg overflow-hidden hover:bg-zinc-700 transition-colors"
        >
          {preview?.image && (
            <div className="w-full aspect-video bg-zinc-700">
              <img
                src={preview.image}
                alt={preview.title ?? "Link preview"}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}
          <div className="p-3">
            <div className="flex items-center gap-2 text-purple-500 text-sm mb-1">
              <ExternalLink className="w-3 h-3" />
              {new URL(metadata.link).hostname}
            </div>
            {preview?.title && (
              <h4 className="font-medium text-white">{preview.title}</h4>
            )}
            {preview?.description && (
              <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                {preview.description}
              </p>
            )}
          </div>
        </a>
      );
    }

    // Fallback for unknown/missing content
    return (
      <div className="bg-zinc-800 rounded-lg p-8 flex flex-col items-center justify-center text-gray-500">
        {contentType === "image" && <ImageIcon className="w-8 h-8 mb-2" />}
        {contentType === "text" && <FileText className="w-8 h-8 mb-2" />}
        {contentType === "link" && <Link2 className="w-8 h-8 mb-2" />}
        <span className="text-sm">Content unavailable</span>
      </div>
    );
  };

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden mb-3">
      {/* Header: Creator info */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
            {creatorAvatar ? (
              <img
                src={creatorAvatar}
                alt={creatorName ?? "Creator"}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-4 h-4 text-gray-500" />
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-white">
              {creatorName ?? truncateAddress(piece.creator)}
            </div>
            <div className="text-xs text-gray-500">Creator</div>
          </div>
        </div>

        {/* Content type indicator */}
        <div className="flex items-center gap-1 text-gray-500 text-xs">
          {contentType === "image" && <ImageIcon className="w-3 h-3" />}
          {contentType === "text" && <FileText className="w-3 h-3" />}
          {contentType === "link" && <Link2 className="w-3 h-3" />}
          <span className="capitalize">{contentType}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">{renderContent()}</div>

      {/* Description if available */}
      {metadata?.description && (
        <div className="px-3 pb-2">
          <p className="text-sm text-gray-400">{metadata.description}</p>
        </div>
      )}

      {/* Footer: Owner + Collect button */}
      <div className="flex items-center justify-between p-3 border-t border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
            {ownerAvatar ? (
              <img
                src={ownerAvatar}
                alt={ownerName ?? "Owner"}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-3 h-3 text-gray-500" />
            )}
          </div>
          <div className="text-xs">
            <span className="text-gray-500">Owned by </span>
            <span className="text-white">
              {ownerName ?? truncateAddress(piece.owner)}
            </span>
          </div>
        </div>

        {showCollectButton && (
          <CollectButton
            price={piece.price}
            onClick={onCollect}
            isLoading={isCollecting}
            disabled={isCollecting}
          />
        )}
      </div>
    </div>
  );
}
