import { useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useReadContracts } from "wagmi";
import { zeroAddress } from "viem";
import { base } from "wagmi/chains";
import {
  CONTRACT_ADDRESSES,
  MULTICALL_ABI,
  type UnitState,
} from "@/lib/contracts";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

type ClaimState = "idle" | "pending" | "confirming" | "success" | "error";

type UseClaimRewardsReturn = {
  claimRewards: (contentAddress: `0x${string}`) => void;
  state: ClaimState;
  error: Error | null;
  reset: () => void;
};

/**
 * Hook for claiming rewards from a single community's rewarder.
 */
export function useClaimRewards(): UseClaimRewardsReturn {
  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: DEFAULT_CHAIN_ID,
  });

  const state: ClaimState = isPending
    ? "pending"
    : isConfirming
      ? "confirming"
      : isSuccess
        ? "success"
        : writeError || isError
          ? "error"
          : "idle";

  const claimRewards = useCallback(
    (contentAddress: `0x${string}`) => {
      writeContract({
        address: CONTRACT_ADDRESSES.multicall as `0x${string}`,
        abi: MULTICALL_ABI,
        functionName: "claimRewards",
        args: [contentAddress],
        chainId: DEFAULT_CHAIN_ID,
      });
    },
    [writeContract]
  );

  return {
    claimRewards,
    state,
    error: writeError ?? null,
    reset: resetWrite,
  };
}

/**
 * Hook to get pending rewards across multiple communities.
 * Uses getUnitState which includes accountUnitEarned and accountContentStaked.
 */
export function useAllPendingRewards(
  communityAddresses: `0x${string}`[],
  account: `0x${string}` | undefined
) {
  const contracts = communityAddresses.map((address) => ({
    address: CONTRACT_ADDRESSES.multicall as `0x${string}`,
    abi: MULTICALL_ABI,
    functionName: "getUnitState" as const,
    args: [address, account ?? zeroAddress] as const,
    chainId: base.id,
  }));

  const { data: unitStates, isLoading, error, refetch } = useReadContracts({
    contracts,
    query: {
      enabled: communityAddresses.length > 0 && !!account,
      refetchInterval: 30_000,
    },
  });

  const rewards = (unitStates ?? [])
    .map((result, index) => {
      const state = result.result as UnitState | undefined;
      if (!state) return null;

      return {
        contentAddress: communityAddresses[index],
        earnedUnit: state.accountUnitEarned,
        earnedQuote: 0n, // No longer available in new contract
        accountBalance: state.accountContentStaked,
        totalSupply: state.totalSupply,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Calculate totals
  const totalEarnedUnit = rewards.reduce((sum, r) => sum + r.earnedUnit, 0n);
  const totalEarnedQuote = rewards.reduce((sum, r) => sum + r.earnedQuote, 0n);
  const totalStake = rewards.reduce((sum, r) => sum + r.accountBalance, 0n);

  // Filter to only communities with pending rewards
  const communitiesWithRewards = rewards.filter(
    (r) => r.earnedUnit > 0n
  );

  // Create a map of community address to rewards for easy lookup
  const pendingRewards: Record<string, { earnedUnit: bigint; earnedQuote: bigint }> = {};
  for (const r of rewards) {
    pendingRewards[r.contentAddress] = {
      earnedUnit: r.earnedUnit,
      earnedQuote: r.earnedQuote,
    };
  }

  // Calculate total pending USD (Quote is USDC with 6 decimals)
  // For unit tokens, we'd need the price, so just use quote for now
  const totalPendingUsd = Number(totalEarnedQuote) / 1e6;

  return {
    rewards,
    pendingRewards,
    communitiesWithRewards,
    totalEarnedUnit,
    totalEarnedQuote,
    totalPendingUsd,
    totalStake,
    isLoading,
    error,
    refetch,
  };
}
