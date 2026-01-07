import { useCallback } from "react";
import { encodeFunctionData } from "viem";
import { CONTRACT_ADDRESSES, MULTICALL_ABI } from "@/lib/contracts";
import { DEADLINE_BUFFER_SECONDS, USDC_DECIMALS } from "@/lib/constants";
import {
  useBatchedTransaction,
  encodeApproveCall,
  type Call,
} from "./useBatchedTransaction";

type UseCollectReturn = {
  collect: (
    contentAddress: `0x${string}`,
    tokenId: bigint,
    epochId: bigint,
    price: bigint,
    slippagePercent?: number
  ) => Promise<void>;
  state: "idle" | "pending" | "confirming" | "success" | "error";
  error: Error | null;
  reset: () => void;
};

/**
 * Hook for collecting content.
 * Handles USDC approval + Multicall.collect() in a batched transaction.
 */
export function useCollect(): UseCollectReturn {
  const { execute, state, error, reset } = useBatchedTransaction();

  const collect = useCallback(
    async (
      contentAddress: `0x${string}`,
      tokenId: bigint,
      epochId: bigint,
      price: bigint,
      slippagePercent = 5
    ) => {
      // Calculate max price with slippage
      const slippageMultiplier = BigInt(100 + slippagePercent);
      const maxPrice = (price * slippageMultiplier) / 100n;

      // Calculate deadline (current time + buffer)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS);

      // Build transaction calls
      const calls: Call[] = [];

      // 1. Approve USDC to Multicall contract
      const approveCall = encodeApproveCall(
        CONTRACT_ADDRESSES.usdc as `0x${string}`,
        CONTRACT_ADDRESSES.multicall as `0x${string}`,
        maxPrice
      );
      calls.push(approveCall);

      // 2. Call Multicall.collect()
      const collectData = encodeFunctionData({
        abi: MULTICALL_ABI,
        functionName: "collect",
        args: [contentAddress, tokenId, epochId, deadline, maxPrice],
      });

      calls.push({
        to: CONTRACT_ADDRESSES.multicall as `0x${string}`,
        data: collectData,
        value: 0n,
      });

      // Execute batched transaction
      await execute(calls);
    },
    [execute]
  );

  return {
    collect,
    state,
    error,
    reset,
  };
}

/**
 * Helper to format USDC amount for display
 */
export function formatUSDC(amount: bigint): string {
  const value = Number(amount) / 10 ** USDC_DECIMALS;
  if (value < 0.01) {
    return value.toFixed(6);
  }
  return value.toFixed(2);
}

/**
 * Parse USDC string input to bigint
 */
export function parseUSDC(value: string): bigint {
  const num = parseFloat(value);
  if (isNaN(num) || num < 0) return 0n;
  return BigInt(Math.floor(num * 10 ** USDC_DECIMALS));
}
