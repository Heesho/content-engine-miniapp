"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, User, Loader2, CheckCircle2, ImageIcon, FileText, Link2, ExternalLink } from "lucide-react";
import { formatUnits } from "viem";
import { useContentPiece, useContentMetadata } from "@/hooks/useContentFeed";
import { useCollect } from "@/hooks/useCollect";
import { useFarcaster } from "@/hooks/useFarcaster";
import { useBatchProfiles } from "@/hooks/useBatchProfiles";
import { ipfsToHttp, USDC_DECIMALS } from "@/lib/constants";
import { NavBar } from "@/components/nav-bar";

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

export default function StickerPage() {
  const params = useParams();
  const router = useRouter();
  const contentAddress = params.contentAddress as `0x${string}`;
  const tokenId = BigInt(params.tokenId as string);

  const { address } = useFarcaster();
  const { piece, isLoading: isLoadingPiece, refetch } = useContentPiece(contentAddress, tokenId);
  const { metadata } = useContentMetadata(piece?.uri);
  const { collect, state: collectState, reset: resetCollect } = useCollect();

  const [imageError, setImageError] = useState(false);

  // Get profiles for creator and owner
  const addresses = piece ? [piece.creator, piece.owner] : [];
  const { getDisplayName, profiles } = useBatchProfiles(addresses);

  const imageUrl = metadata?.image ? ipfsToHttp(metadata.image) : null;
  const contentType = metadata?.contentType ?? "image";

  const canCollect = address && piece && piece.owner.toLowerCase() !== address.toLowerCase();
  const isOwner = address && piece && piece.owner.toLowerCase() === address.toLowerCase();

  const handleCollect = useCallback(async () => {
    if (!address || !piece) return;

    await collect(contentAddress, piece.tokenId, piece.epochId, piece.price);
    refetch();
  }, [collect, contentAddress, piece, address, refetch]);

  // Reset collect state when leaving
  useEffect(() => {
    return () => resetCollect();
  }, [resetCollect]);

  // Render main content
  const renderContent = () => {
    if (contentType === "image" && imageUrl && !imageError) {
      return (
        <img
          src={imageUrl}
          alt={metadata?.name ?? "Sticker"}
          className="w-full max-h-[50vh] object-contain rounded-xl"
          onError={() => setImageError(true)}
        />
      );
    }

    if (contentType === "text" && metadata?.text) {
      return (
        <div className="bg-zinc-800 rounded-xl p-4">
          <p className="text-white whitespace-pre-wrap break-words">
            {metadata.text}
          </p>
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
          className="block bg-zinc-800 rounded-xl overflow-hidden hover:bg-zinc-700 transition-colors"
        >
          {preview?.image && (
            <img
              src={preview.image}
              alt={preview.title ?? "Link"}
              className="w-full aspect-video object-cover"
            />
          )}
          <div className="p-4">
            <div className="flex items-center gap-2 text-teal-500 text-sm mb-2">
              <ExternalLink className="w-4 h-4" />
              {new URL(metadata.link).hostname}
            </div>
            {preview?.title && (
              <h3 className="font-semibold text-white text-lg">{preview.title}</h3>
            )}
            {preview?.description && (
              <p className="text-gray-400 mt-1 line-clamp-3">{preview.description}</p>
            )}
          </div>
        </a>
      );
    }

    // Fallback
    return (
      <div className="bg-zinc-800 rounded-xl p-12 flex flex-col items-center justify-center text-gray-500">
        {contentType === "image" && <ImageIcon className="w-12 h-12 mb-2" />}
        {contentType === "text" && <FileText className="w-12 h-12 mb-2" />}
        {contentType === "link" && <Link2 className="w-12 h-12 mb-2" />}
        <span>Content unavailable</span>
      </div>
    );
  };

  if (isLoadingPiece) {
    return (
      <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
        <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
        <NavBar />
      </main>
    );
  }

  if (!piece) {
    return (
      <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
        <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col items-center justify-center">
          <p className="text-gray-500">Sticker not found</p>
          <button
            onClick={() => router.back()}
            className="mt-4 text-teal-500 hover:text-teal-400"
          >
            Go back
          </button>
        </div>
        <NavBar />
      </main>
    );
  }

  const creatorProfile = profiles[piece.creator.toLowerCase()];
  const ownerProfile = profiles[piece.owner.toLowerCase()];

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-4"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between py-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-lg font-bold">{formatUsdc(piece.price)}</div>
          <div className="w-9" /> {/* Spacer for centering */}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Main content */}
          <div className="mb-4">
            {renderContent()}
          </div>

          {/* Description */}
          {metadata?.description && (
            <div className="mb-4">
              <p className="text-gray-300">{metadata.description}</p>
            </div>
          )}

          {/* Creator & Owner info */}
          <div className="space-y-3 mb-6">
            {/* Creator */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
                {creatorProfile?.pfpUrl ? (
                  <img
                    src={creatorProfile.pfpUrl}
                    alt={getDisplayName(piece.creator)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-5 h-5 text-gray-500" />
                )}
              </div>
              <div>
                <div className="text-xs text-gray-500">Created by</div>
                <div className="font-medium">
                  {getDisplayName(piece.creator) ?? truncateAddress(piece.creator)}
                </div>
              </div>
            </div>

            {/* Owner */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
                {ownerProfile?.pfpUrl ? (
                  <img
                    src={ownerProfile.pfpUrl}
                    alt={getDisplayName(piece.owner)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-5 h-5 text-gray-500" />
                )}
              </div>
              <div>
                <div className="text-xs text-gray-500">Owned by</div>
                <div className="font-medium">
                  {isOwner ? "You" : (getDisplayName(piece.owner) ?? truncateAddress(piece.owner))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Collect button - fixed at bottom */}
        <div className="py-4">
          {isOwner ? (
            <div className="w-full py-3 rounded-xl bg-zinc-800 text-center text-gray-400 font-semibold">
              You own this sticker
            </div>
          ) : (
            <button
              onClick={handleCollect}
              disabled={!canCollect || collectState === "pending" || collectState === "confirming" || collectState === "success"}
              className={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                collectState === "success"
                  ? "bg-teal-600 text-white"
                  : collectState === "pending" || collectState === "confirming"
                  ? "bg-zinc-700 text-gray-400"
                  : "bg-teal-600 hover:bg-teal-500 text-white active:scale-[0.98]"
              }`}
            >
              {collectState === "pending" && (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Confirm in wallet...
                </>
              )}
              {collectState === "confirming" && (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Collecting...
                </>
              )}
              {collectState === "success" && (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Collected!
                </>
              )}
              {(collectState === "idle" || collectState === "error") && (
                <>
                  Collect for {formatUsdc(piece.price)}
                </>
              )}
            </button>
          )}
        </div>
      </div>
      <NavBar />
    </main>
  );
}
