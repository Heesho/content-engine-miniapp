import { useReadContract, useReadContracts } from "wagmi";
import { base } from "wagmi/chains";
import { zeroAddress } from "viem";
import {
  CONTRACT_ADDRESSES,
  MULTICALL_ABI,
  type AuctionState,
} from "@/lib/contracts";

export function useAuctionState(
  contentAddress: `0x${string}` | undefined,
  account: `0x${string}` | undefined
) {
  const { data: rawAuctionState, refetch, isLoading, error } = useReadContract({
    address: CONTRACT_ADDRESSES.multicall as `0x${string}`,
    abi: MULTICALL_ABI,
    functionName: "getAuction",
    args: contentAddress ? [contentAddress, account ?? zeroAddress] : undefined,
    chainId: base.id,
    query: {
      enabled: !!contentAddress,
      refetchInterval: 3_000,
    },
  });

  const auctionState = rawAuctionState as AuctionState | undefined;

  return {
    auctionState,
    refetch,
    isLoading,
    error,
  };
}

export type AuctionListItem = {
  communityAddress: `0x${string}`;
  auctionState: AuctionState;
  profitLoss: bigint; // USDC value - LP cost in USDC equivalent
  isProfitable: boolean;
};

export function useAllAuctionStates(
  communityAddresses: `0x${string}`[],
  account: `0x${string}` | undefined
) {
  const contracts = communityAddresses.map((address) => ({
    address: CONTRACT_ADDRESSES.multicall as `0x${string}`,
    abi: MULTICALL_ABI,
    functionName: "getAuction" as const,
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

  const auctionItems: AuctionListItem[] = (states ?? [])
    .map((result, index) => {
      const state = result.result as AuctionState | undefined;
      if (!state) return null;

      // Calculate profit/loss in USDC (6 decimals)
      // LP cost = price * paymentTokenPrice (LP token value in DONUT)
      // Quote value = quoteAccumulated (USDC)
      // For simplicity, compare USDC accumulated vs LP price in USDC equivalent
      // Note: This is a rough approximation since LP price is in DONUT terms
      const lpCostInDonut =
        (state.price * state.paymentTokenPrice) / BigInt(1e18);
      // Convert DONUT to USDC equivalent (using quoteAccumulated directly as baseline)
      const profitLoss = state.quoteAccumulated - lpCostInDonut;
      const isProfitable = profitLoss > 0n;

      return {
        communityAddress: communityAddresses[index],
        auctionState: state,
        profitLoss,
        isProfitable,
      };
    })
    .filter((item): item is AuctionListItem => item !== null);

  // Sort by profitability (most profitable first)
  auctionItems.sort((a, b) => {
    if (a.profitLoss > b.profitLoss) return -1;
    if (a.profitLoss < b.profitLoss) return 1;
    return 0;
  });

  return {
    auctions: auctionItems,
    isLoading,
    error,
    refetch,
  };
}
