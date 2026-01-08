"use client";

import { useState, useEffect } from "react";
import { formatUnits } from "viem";
import { ImageIcon, FileText, Link2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ipfsToHttp, USDC_DECIMALS } from "@/lib/constants";
import type { ContentPiece } from "@/hooks/useContentFeed";
import type { ContentMetadata } from "@/lib/contracts";

type ContentCardProps = {
  piece: ContentPiece;
  metadata?: ContentMetadata;
  onCollect?: () => void;
  isCollecting?: boolean;
  canCollect?: boolean;
};

const formatUsdc = (value: bigint) => {
  const num = Number(formatUnits(value, USDC_DECIMALS));
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  if (num >= 1) return `$${num.toFixed(2)}`;
  if (num >= 0.01) return `$${num.toFixed(2)}`;
  return `$${num.toFixed(4)}`;
};

export function ContentCard({
  piece,
  metadata: propMetadata,
  onCollect,
  isCollecting = false,
  canCollect = true,
}: ContentCardProps) {
  const [metadata, setMetadata] = useState<ContentMetadata | null>(
    propMetadata ?? null
  );
  const [imageError, setImageError] = useState(false);

  // Fetch metadata from IPFS if not provided
  useEffect(() => {
    if (propMetadata) {
      setMetadata(propMetadata);
      return;
    }

    if (!piece.uri) return;

    const metadataUrl = ipfsToHttp(piece.uri);
    if (!metadataUrl) return;

    fetch(metadataUrl)
      .then((res) => res.json())
      .then((data) => setMetadata(data as ContentMetadata))
      .catch(() => setMetadata(null));
  }, [piece.uri, propMetadata]);

  const imageUrl = metadata?.image ? ipfsToHttp(metadata.image) : null;
  const contentType = metadata?.contentType ?? "image";

  const handleClick = () => {
    if (canCollect && onCollect && !isCollecting) {
      onCollect();
    }
  };

  // Render content thumbnail
  const renderThumbnail = () => {
    if (contentType === "image" && imageUrl && !imageError) {
      return (
        <img
          src={imageUrl}
          alt={metadata?.name ?? "Content"}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      );
    }

    if (contentType === "text" && metadata?.text) {
      return (
        <div className="w-full h-full bg-zinc-800 p-2 flex items-center justify-center">
          <p className="text-xs text-gray-300 line-clamp-4 text-center">
            {metadata.text.slice(0, 100)}
          </p>
        </div>
      );
    }

    if (contentType === "link" && metadata?.linkPreview?.image) {
      return (
        <img
          src={metadata.linkPreview.image}
          alt={metadata.linkPreview?.title ?? "Link"}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      );
    }

    // Fallback
    return (
      <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
        {contentType === "image" && <ImageIcon className="w-8 h-8 text-gray-600" />}
        {contentType === "text" && <FileText className="w-8 h-8 text-gray-600" />}
        {contentType === "link" && <Link2 className="w-8 h-8 text-gray-600" />}
      </div>
    );
  };

  return (
    <button
      onClick={handleClick}
      disabled={!canCollect || isCollecting}
      className={cn(
        "relative w-full aspect-square rounded-xl overflow-hidden transition-all",
        canCollect && !isCollecting && "hover:ring-2 hover:ring-teal-500 hover:scale-[1.02] active:scale-[0.98]",
        !canCollect && "opacity-70"
      )}
    >
      {/* Thumbnail */}
      {renderThumbnail()}

      {/* Price overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 pt-6">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-white">
            {formatUsdc(piece.price)}
          </span>
          {canCollect && (
            <span className="text-xs text-teal-400 font-medium">
              Collect
            </span>
          )}
        </div>
      </div>

      {/* Loading overlay */}
      {isCollecting && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
        </div>
      )}

      {/* Owned indicator */}
      {!canCollect && (
        <div className="absolute top-2 right-2 px-2 py-0.5 bg-zinc-900/80 rounded text-xs text-gray-400">
          Owned
        </div>
      )}
    </button>
  );
}
