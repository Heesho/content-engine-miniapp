"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ContentCard } from "./content-card";
import { useContentFeed, useContentMetadataBatch } from "@/hooks/useContentFeed";
import type { ContentPiece } from "@/hooks/useContentFeed";

type ContentFeedProps = {
  contentAddress: `0x${string}`;
  userAddress?: `0x${string}`;
};

const ITEMS_PER_PAGE = 10;

export function ContentFeed({ contentAddress, userAddress }: ContentFeedProps) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [allPieces, setAllPieces] = useState<ContentPiece[]>([]);

  const { pieces, hasMore, totalCount, isLoading } = useContentFeed(
    contentAddress,
    ITEMS_PER_PAGE,
    offset
  );

  // Combine new pieces with existing ones when offset changes
  const displayPieces = offset === 0 ? pieces : [...allPieces, ...pieces.filter(
    (p) => !allPieces.some((a) => a.tokenId === p.tokenId)
  )];

  // Batch fetch metadata
  const tokenUris = displayPieces.map((p) => p.uri).filter(Boolean);
  const { metadataMap } = useContentMetadataBatch(tokenUris);

  const handleCardClick = useCallback(
    (piece: ContentPiece) => {
      router.push(`/sticker/${contentAddress}/${piece.tokenId}`);
    },
    [router, contentAddress]
  );

  const handleLoadMore = useCallback(() => {
    setAllPieces(displayPieces);
    setOffset((prev) => prev + ITEMS_PER_PAGE);
  }, [displayPieces]);

  if (isLoading && offset === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
      </div>
    );
  }

  if (displayPieces.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No content yet</p>
        <p className="text-gray-600 text-sm mt-1">
          Be the first to create something!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 2-column grid of content cards */}
      <div className="grid grid-cols-2 gap-2">
        {displayPieces.map((piece) => {
          const metadata = metadataMap[piece.uri];

          return (
            <ContentCard
              key={`${piece.contentAddress}-${piece.tokenId}`}
              piece={piece}
              metadata={metadata}
              onClick={() => handleCardClick(piece)}
            />
          );
        })}
      </div>

      {/* Load more button */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <button
            onClick={handleLoadMore}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </>
            ) : (
              `Load more (${totalCount - displayPieces.length} remaining)`
            )}
          </button>
        </div>
      )}
    </div>
  );
}
