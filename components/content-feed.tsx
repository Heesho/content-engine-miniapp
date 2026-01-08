"use client";

import { useState, useCallback } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { ContentCard } from "./content-card";
import { useContentFeed, useContentMetadataBatch } from "@/hooks/useContentFeed";
import { useCollect } from "@/hooks/useCollect";
import type { ContentPiece } from "@/hooks/useContentFeed";

type ContentFeedProps = {
  contentAddress: `0x${string}`;
  userAddress?: `0x${string}`;
};

const ITEMS_PER_PAGE = 10;

export function ContentFeed({ contentAddress, userAddress }: ContentFeedProps) {
  const [offset, setOffset] = useState(0);
  const [allPieces, setAllPieces] = useState<ContentPiece[]>([]);
  const [collectingId, setCollectingId] = useState<bigint | null>(null);

  const { pieces, hasMore, totalCount, isLoading, refetch } = useContentFeed(
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

  // Collect hook
  const { collect, reset: resetCollect } = useCollect();

  const handleCollect = useCallback(
    async (piece: ContentPiece) => {
      if (!userAddress) return;

      setCollectingId(piece.tokenId);
      try {
        await collect(
          contentAddress,
          piece.tokenId,
          piece.epochId,
          piece.price
        );
        // Refetch feed after successful collect
        refetch();
      } finally {
        setCollectingId(null);
        resetCollect();
      }
    },
    [collect, contentAddress, userAddress, refetch, resetCollect]
  );

  const handleLoadMore = useCallback(() => {
    setAllPieces(displayPieces);
    setOffset((prev) => prev + ITEMS_PER_PAGE);
  }, [displayPieces]);

  const handleRefresh = useCallback(() => {
    setOffset(0);
    setAllPieces([]);
    refetch();
  }, [refetch]);

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
      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-white transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* 2-column grid of content cards */}
      <div className="grid grid-cols-2 gap-2">
        {displayPieces.map((piece) => {
          const metadata = metadataMap[piece.uri];
          const canCollect =
            !!userAddress &&
            piece.owner.toLowerCase() !== userAddress.toLowerCase();

          return (
            <ContentCard
              key={`${piece.contentAddress}-${piece.tokenId}`}
              piece={piece}
              metadata={metadata}
              onCollect={() => handleCollect(piece)}
              isCollecting={collectingId === piece.tokenId}
              canCollect={canCollect}
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
