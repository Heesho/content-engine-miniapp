import { useQuery } from "@tanstack/react-query";
import { useReadContract, useReadContracts } from "wagmi";
import { base } from "wagmi/chains";
import {
  CONTRACT_ADDRESSES,
  MULTICALL_ABI,
  CONTENT_ABI,
  type TokenState,
  type ContentMetadata,
} from "@/lib/contracts";
import { ipfsToHttp } from "@/lib/constants";

export type ContentPiece = TokenState & {
  contentAddress: `0x${string}`;
  metadata?: ContentMetadata;
};

// Hook to get total content count in a community
export function useContentCount(contentAddress: `0x${string}` | undefined) {
  const { data: count, isLoading, error, refetch } = useReadContract({
    address: contentAddress,
    abi: CONTENT_ABI,
    functionName: "totalSupply",
    chainId: base.id,
    query: {
      enabled: !!contentAddress,
      refetchInterval: 10_000,
    },
  });

  return {
    count: count as bigint | undefined,
    isLoading,
    error,
    refetch,
  };
}

// Hook to get token IDs for a content feed (paginated, newest first)
export function useContentTokenIds(
  contentAddress: `0x${string}` | undefined,
  limit = 20,
  offset = 0
) {
  const { count } = useContentCount(contentAddress);
  const totalCount = count ? Number(count) : 0;

  // Calculate indices for newest-first ordering
  // Token IDs are 1-indexed and sequential, so we work backwards
  const startIndex = Math.max(0, totalCount - offset - limit);
  const endIndex = Math.max(0, totalCount - offset);
  const indices: number[] = [];

  // Build indices in reverse order (newest first)
  for (let i = endIndex; i > startIndex; i--) {
    indices.push(i); // Token IDs are 1-indexed
  }

  return {
    tokenIds: indices,
    hasMore: startIndex > 0,
    totalCount,
    isLoading: !count && !!contentAddress,
  };
}

// Hook to get content pieces by token IDs using batched Multicall.getToken()
export function useContentPieces(
  contentAddress: `0x${string}` | undefined,
  tokenIds: number[]
) {
  const contracts = tokenIds.map((tokenId) => ({
    address: CONTRACT_ADDRESSES.multicall as `0x${string}`,
    abi: MULTICALL_ABI,
    functionName: "getToken" as const,
    args: [contentAddress!, BigInt(tokenId)] as const,
    chainId: base.id,
  }));

  const { data: tokenStates, isLoading, error, refetch } = useReadContracts({
    contracts,
    query: {
      enabled: !!contentAddress && tokenIds.length > 0,
      refetchInterval: 10_000,
    },
  });

  const pieces: ContentPiece[] = (tokenStates ?? [])
    .map((result, index) => {
      const state = result.result as TokenState | undefined;
      if (!state) return null;
      return {
        ...state,
        contentAddress: contentAddress!,
      };
    })
    .filter((piece): piece is ContentPiece => piece !== null);

  return {
    pieces,
    isLoading,
    error,
    refetch,
  };
}

// Hook to get a single content piece
export function useContentPiece(
  contentAddress: `0x${string}` | undefined,
  tokenId: bigint | undefined
) {
  const { data: rawTokenState, isLoading, error, refetch } = useReadContract({
    address: CONTRACT_ADDRESSES.multicall as `0x${string}`,
    abi: MULTICALL_ABI,
    functionName: "getToken",
    args: contentAddress && tokenId ? [contentAddress, tokenId] : undefined,
    chainId: base.id,
    query: {
      enabled: !!contentAddress && tokenId !== undefined,
      refetchInterval: 5_000,
    },
  });

  const tokenState = rawTokenState as TokenState | undefined;

  const piece: ContentPiece | undefined = tokenState
    ? {
        ...tokenState,
        contentAddress: contentAddress!,
      }
    : undefined;

  return {
    piece,
    isLoading,
    error,
    refetch,
  };
}

// Hook to fetch content metadata from IPFS
export function useContentMetadata(tokenUri: string | undefined) {
  const { data: metadata, isLoading, error } = useQuery({
    queryKey: ["contentMetadata", tokenUri],
    queryFn: async (): Promise<ContentMetadata | null> => {
      if (!tokenUri) return null;

      const url = ipfsToHttp(tokenUri);
      if (!url) return null;

      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        return data as ContentMetadata;
      } catch {
        return null;
      }
    },
    enabled: !!tokenUri,
    staleTime: 60_000, // Cache for 1 minute
    gcTime: 5 * 60_000, // Keep in cache for 5 minutes
  });

  return {
    metadata,
    isLoading,
    error,
  };
}

// Combined hook for content feed with metadata
export function useContentFeed(
  contentAddress: `0x${string}` | undefined,
  limit = 20,
  offset = 0
) {
  const { tokenIds, hasMore, totalCount, isLoading: isLoadingIds } =
    useContentTokenIds(contentAddress, limit, offset);

  const { pieces, isLoading: isLoadingPieces, refetch } =
    useContentPieces(contentAddress, tokenIds);

  return {
    pieces,
    hasMore,
    totalCount,
    isLoading: isLoadingIds || isLoadingPieces,
    refetch,
  };
}

// Hook to batch fetch metadata for multiple content pieces
export function useContentMetadataBatch(tokenUris: string[]) {
  const { data: metadataMap, isLoading } = useQuery({
    queryKey: ["contentMetadataBatch", tokenUris.join(",")],
    queryFn: async (): Promise<Record<string, ContentMetadata>> => {
      const results: Record<string, ContentMetadata> = {};

      await Promise.all(
        tokenUris.map(async (uri) => {
          if (!uri) return;
          const url = ipfsToHttp(uri);
          if (!url) return;

          try {
            const response = await fetch(url);
            if (!response.ok) return;
            const data = await response.json();
            results[uri] = data as ContentMetadata;
          } catch {
            // Skip failed fetches
          }
        })
      );

      return results;
    },
    enabled: tokenUris.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  return {
    metadataMap: metadataMap ?? {},
    isLoading,
  };
}
