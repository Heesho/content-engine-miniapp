import { useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { zeroAddress } from "viem";
import {
  CONTRACT_ADDRESSES,
  MULTICALL_ABI,
  CORE_ABI,
  ERC20_ABI,
  type UnitState,
} from "@/lib/contracts";

export type CommunityInfo = {
  address: `0x${string}`;
  unitAddress: `0x${string}`;
  auctionAddress: `0x${string}`;
  minterAddress: `0x${string}`;
  rewarderAddress: `0x${string}`;
  lpAddress: `0x${string}`;
  launcher: `0x${string}`;
  tokenName: string;
  tokenSymbol: string;
};

// Hook to get community state from Multicall.getUnitState()
export function useCommunityState(
  contentAddress: `0x${string}` | undefined,
  account: `0x${string}` | undefined
) {
  const { data: rawUnitState, refetch, isLoading, error } = useReadContract({
    address: CONTRACT_ADDRESSES.multicall as `0x${string}`,
    abi: MULTICALL_ABI,
    functionName: "getUnitState",
    args: contentAddress ? [contentAddress, account ?? zeroAddress] : undefined,
    chainId: base.id,
    query: {
      enabled: !!contentAddress,
      refetchInterval: 5_000,
    },
  });

  const unitState = rawUnitState as UnitState | undefined;

  return {
    unitState,
    refetch,
    isLoading,
    error,
  };
}

// Hook to get comprehensive community info
export function useCommunityInfo(contentAddress: `0x${string}` | undefined) {
  // Get unit token address
  const { data: unitAddress } = useReadContract({
    address: CONTRACT_ADDRESSES.core as `0x${string}`,
    abi: CORE_ABI,
    functionName: "contentToUnit",
    args: contentAddress ? [contentAddress] : undefined,
    chainId: base.id,
    query: {
      enabled: !!contentAddress,
    },
  });

  // Get auction address
  const { data: auctionAddress } = useReadContract({
    address: CONTRACT_ADDRESSES.core as `0x${string}`,
    abi: CORE_ABI,
    functionName: "contentToAuction",
    args: contentAddress ? [contentAddress] : undefined,
    chainId: base.id,
    query: {
      enabled: !!contentAddress,
    },
  });

  // Get minter address
  const { data: minterAddress } = useReadContract({
    address: CONTRACT_ADDRESSES.core as `0x${string}`,
    abi: CORE_ABI,
    functionName: "contentToMinter",
    args: contentAddress ? [contentAddress] : undefined,
    chainId: base.id,
    query: {
      enabled: !!contentAddress,
    },
  });

  // Get rewarder address
  const { data: rewarderAddress } = useReadContract({
    address: CONTRACT_ADDRESSES.core as `0x${string}`,
    abi: CORE_ABI,
    functionName: "contentToRewarder",
    args: contentAddress ? [contentAddress] : undefined,
    chainId: base.id,
    query: {
      enabled: !!contentAddress,
    },
  });

  // Get LP token address
  const { data: lpAddress } = useReadContract({
    address: CONTRACT_ADDRESSES.core as `0x${string}`,
    abi: CORE_ABI,
    functionName: "contentToLP",
    args: contentAddress ? [contentAddress] : undefined,
    chainId: base.id,
    query: {
      enabled: !!contentAddress,
    },
  });

  // Get launcher address
  const { data: launcher } = useReadContract({
    address: CONTRACT_ADDRESSES.core as `0x${string}`,
    abi: CORE_ABI,
    functionName: "contentToLauncher",
    args: contentAddress ? [contentAddress] : undefined,
    chainId: base.id,
    query: {
      enabled: !!contentAddress,
    },
  });

  // Get token name
  const { data: tokenName } = useReadContract({
    address: unitAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "name",
    chainId: base.id,
    query: {
      enabled: !!unitAddress,
    },
  });

  // Get token symbol
  const { data: tokenSymbol } = useReadContract({
    address: unitAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "symbol",
    chainId: base.id,
    query: {
      enabled: !!unitAddress,
    },
  });

  const communityInfo: CommunityInfo | undefined =
    contentAddress &&
    unitAddress &&
    auctionAddress &&
    minterAddress &&
    rewarderAddress &&
    lpAddress &&
    launcher
      ? {
          address: contentAddress,
          unitAddress: unitAddress as `0x${string}`,
          auctionAddress: auctionAddress as `0x${string}`,
          minterAddress: minterAddress as `0x${string}`,
          rewarderAddress: rewarderAddress as `0x${string}`,
          lpAddress: lpAddress as `0x${string}`,
          launcher: launcher as `0x${string}`,
          tokenName: (tokenName as string) ?? "",
          tokenSymbol: (tokenSymbol as string) ?? "",
        }
      : undefined;

  return {
    communityInfo,
    isLoading: !communityInfo && !!contentAddress,
  };
}
