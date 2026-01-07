import { useReadContract, useReadContracts } from "wagmi";
import { base } from "wagmi/chains";
import { zeroAddress } from "viem";
import {
  CONTRACT_ADDRESSES,
  CORE_ABI,
  MULTICALL_ABI,
  ERC20_ABI,
  type ContentState,
} from "@/lib/contracts";

export type CommunityListItem = {
  address: `0x${string}`;
  unitAddress: `0x${string}`;
  tokenName: string;
  tokenSymbol: string;
  uri: string;
  launcher: `0x${string}`;
  totalContent: bigint;
  unitPrice: bigint;
  totalSupply: bigint;
  minInitPrice: bigint;
  isModerated: boolean;
  unitBalance?: bigint; // User's balance of unit tokens
};

export type SortOption = "top" | "new" | "active";

// Hook to get total number of deployed communities
export function useDeployedCommunitiesCount() {
  const { data: count, isLoading, error, refetch } = useReadContract({
    address: CONTRACT_ADDRESSES.core as `0x${string}`,
    abi: CORE_ABI,
    functionName: "deployedContentsLength",
    chainId: base.id,
    query: {
      refetchInterval: 30_000,
    },
  });

  return {
    count: count as bigint | undefined,
    isLoading,
    error,
    refetch,
  };
}

// Hook to get all community addresses from the Core contract
export function useAllCommunityAddresses() {
  const { count } = useDeployedCommunitiesCount();

  const communityCount = count ? Number(count) : 0;

  // Create array of indices for multicall
  const indices = Array.from({ length: communityCount }, (_, i) => i);

  const contracts = indices.map((index) => ({
    address: CONTRACT_ADDRESSES.core as `0x${string}`,
    abi: CORE_ABI,
    functionName: "deployedContents" as const,
    args: [BigInt(index)] as const,
    chainId: base.id,
  }));

  const { data: communityAddresses, isLoading, error } = useReadContracts({
    contracts,
    query: {
      enabled: communityCount > 0,
    },
  });

  const addresses = communityAddresses
    ?.map((result) => result.result as `0x${string}` | undefined)
    .filter((addr): addr is `0x${string}` => !!addr);

  return {
    addresses: addresses ?? [],
    isLoading: isLoading || (communityCount > 0 && !addresses),
    error,
  };
}

// Hook to get on-chain community states for a list of addresses
export function useCommunityStates(
  communityAddresses: `0x${string}`[],
  account: `0x${string}` | undefined
) {
  const contracts = communityAddresses.map((address) => ({
    address: CONTRACT_ADDRESSES.multicall as `0x${string}`,
    abi: MULTICALL_ABI,
    functionName: "getContent" as const,
    args: [address, account ?? zeroAddress] as const,
    chainId: base.id,
  }));

  const { data: states, isLoading, error, refetch } = useReadContracts({
    contracts,
    query: {
      enabled: communityAddresses.length > 0,
      refetchInterval: 10_000,
    },
  });

  const communityStates = states
    ?.map((result, index) => ({
      address: communityAddresses[index],
      state: result.result as ContentState | undefined,
    }))
    .filter((item) => item.state);

  return {
    communityStates: communityStates ?? [],
    isLoading,
    error,
    refetch,
  };
}

// Hook to get community info (token name/symbol) for multiple communities
export function useCommunityTokenInfo(communityAddresses: `0x${string}`[]) {
  // Get unit addresses for all communities
  const unitContracts = communityAddresses.map((address) => ({
    address: CONTRACT_ADDRESSES.core as `0x${string}`,
    abi: CORE_ABI,
    functionName: "contentToUnit" as const,
    args: [address] as const,
    chainId: base.id,
  }));

  const { data: unitAddresses } = useReadContracts({
    contracts: unitContracts,
    query: {
      enabled: communityAddresses.length > 0,
    },
  });

  // Get launcher addresses
  const launcherContracts = communityAddresses.map((address) => ({
    address: CONTRACT_ADDRESSES.core as `0x${string}`,
    abi: CORE_ABI,
    functionName: "contentToLauncher" as const,
    args: [address] as const,
    chainId: base.id,
  }));

  const { data: launcherAddresses } = useReadContracts({
    contracts: launcherContracts,
    query: {
      enabled: communityAddresses.length > 0,
    },
  });

  // Get token names and symbols
  const validUnitAddresses = (unitAddresses ?? [])
    .map((result, index) => ({
      communityAddress: communityAddresses[index],
      unitAddress: result.result as `0x${string}` | undefined,
      launcher: launcherAddresses?.[index]?.result as `0x${string}` | undefined,
    }))
    .filter((item) => item.unitAddress);

  const nameContracts = validUnitAddresses.map((item) => ({
    address: item.unitAddress!,
    abi: ERC20_ABI,
    functionName: "name" as const,
    chainId: base.id,
  }));

  const symbolContracts = validUnitAddresses.map((item) => ({
    address: item.unitAddress!,
    abi: ERC20_ABI,
    functionName: "symbol" as const,
    chainId: base.id,
  }));

  const { data: names } = useReadContracts({
    contracts: nameContracts,
    query: {
      enabled: validUnitAddresses.length > 0,
    },
  });

  const { data: symbols } = useReadContracts({
    contracts: symbolContracts,
    query: {
      enabled: validUnitAddresses.length > 0,
    },
  });

  const tokenInfo = validUnitAddresses.map((item, index) => ({
    communityAddress: item.communityAddress,
    unitAddress: item.unitAddress!,
    launcher: item.launcher ?? zeroAddress,
    tokenName: (names?.[index]?.result as string) ?? "",
    tokenSymbol: (symbols?.[index]?.result as string) ?? "",
  }));

  return { tokenInfo };
}

// Combined hook for explore page - all data from on-chain
export function useExploreCommunities(
  sortBy: SortOption = "top",
  searchQuery = "",
  account: `0x${string}` | undefined
) {
  // Get all community addresses from on-chain
  const { addresses, isLoading: isLoadingAddresses } = useAllCommunityAddresses();

  // Get on-chain states for these communities
  const { communityStates, isLoading: isLoadingStates } = useCommunityStates(
    addresses,
    account
  );

  // Get token info
  const { tokenInfo } = useCommunityTokenInfo(addresses);

  // Combine data
  let combinedCommunities: CommunityListItem[] = addresses.map((address) => {
    const onChainState = communityStates.find(
      (s) => s.address.toLowerCase() === address.toLowerCase()
    )?.state;
    const info = tokenInfo.find(
      (t) => t.communityAddress.toLowerCase() === address.toLowerCase()
    );

    return {
      address,
      unitAddress: info?.unitAddress ?? onChainState?.unit ?? zeroAddress,
      tokenName: info?.tokenName ?? "Unknown",
      tokenSymbol: info?.tokenSymbol ?? "???",
      uri: onChainState?.uri ?? "",
      launcher: info?.launcher ?? onChainState?.launcher ?? zeroAddress,
      totalContent: onChainState?.totalSupply ?? 0n,
      unitPrice: onChainState?.unitPrice ?? 0n,
      totalSupply: onChainState?.totalSupply ?? 0n,
      minInitPrice: onChainState?.minInitPrice ?? 0n,
      isModerated: onChainState?.isModerated ?? false,
      unitBalance: onChainState?.unitBalance,
    };
  });

  // Filter by search query (client-side search)
  if (searchQuery.length >= 2) {
    const query = searchQuery.toLowerCase();
    combinedCommunities = combinedCommunities.filter(
      (c) =>
        c.tokenName.toLowerCase().includes(query) ||
        c.tokenSymbol.toLowerCase().includes(query) ||
        c.address.toLowerCase().includes(query)
    );
  }

  // Sort communities
  if (sortBy === "top") {
    // Sort by total content (most active communities first)
    combinedCommunities.sort((a, b) =>
      a.totalContent > b.totalContent ? -1 : 1
    );
  } else if (sortBy === "new") {
    // Reverse order (newest first - assuming addresses are in deployment order)
    combinedCommunities.reverse();
  } else if (sortBy === "active") {
    // Sort by unit price (higher price = more activity)
    combinedCommunities.sort((a, b) => (a.unitPrice > b.unitPrice ? -1 : 1));
  }

  // Filter out communities without valid metadata (must have ipfs:// URI)
  const filteredCommunities = combinedCommunities.filter(
    (c) => c.uri && c.uri.startsWith("ipfs://")
  );

  // Loading until we have actual data ready to display
  const hasData = filteredCommunities.length > 0 || addresses.length === 0;
  const isLoading =
    isLoadingAddresses ||
    isLoadingStates ||
    (addresses.length > 0 && !hasData);

  return {
    communities: isLoading ? [] : filteredCommunities,
    isLoading,
    totalCount: addresses.length,
  };
}
