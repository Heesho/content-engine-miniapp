"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowDownUp,
  Copy,
  Check,
  Share2,
  Plus,
  Coins,
} from "lucide-react";
import Link from "next/link";
import {
  useBalance,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatEther, formatUnits, parseUnits, type Address } from "viem";

import { NavBar } from "@/components/nav-bar";
import { ContentFeed } from "@/components/content-feed";
import { useCreateContent } from "@/hooks/useCreateContent";
import { Image, FileText, Link2, Upload, X, Loader2, CheckCircle2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCommunityState, useCommunityInfo } from "@/hooks/useCommunityState";
import { useDexScreener } from "@/hooks/useDexScreener";
import { useFarcaster, viewProfile } from "@/hooks/useFarcaster";
import { usePrices } from "@/hooks/usePrices";
import { useTokenMetadata } from "@/hooks/useMetadata";
import { useProfile } from "@/hooks/useBatchProfiles";
import { useClaimRewards } from "@/hooks/useRewards";
import {
  useBatchedTransaction,
  encodeApproveCall,
  type Call,
} from "@/hooks/useBatchedTransaction";
import { CONTRACT_ADDRESSES, ERC20_ABI, NATIVE_ETH_ADDRESS } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { useSwapPrice, useSwapQuote, formatBuyAmount } from "@/hooks/useSwapQuote";
import {
  DEFAULT_CHAIN_ID,
  TOKEN_DECIMALS,
  USDC_DECIMALS,
} from "@/lib/constants";

const formatUsd = (value: number, compact = false) => {
  if (compact) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Animated dots component for loading state
function LoadingDots() {
  return (
    <span className="inline-flex">
      <span className="animate-bounce-dot-1">.</span>
      <span className="animate-bounce-dot-2">.</span>
      <span className="animate-bounce-dot-3">.</span>
    </span>
  );
}


export default function CommunityDetailPage() {
  const params = useParams();
  const contentAddress = params.address as `0x${string}`;

  const [mode, setMode] = useState<"feed" | "trade" | "create">("feed");
  const [tradeDirection, setTradeDirection] = useState<"buy" | "sell">("buy");
  const [tradeAmount, setTradeAmount] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [tradeResult, setTradeResult] = useState<"success" | "failure" | null>(null);

  // Create content state
  const [contentType, setContentType] = useState<"image" | "text" | "link">("image");
  const [createDescription, setCreateDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [textContent, setTextContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const tradeResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create content hook
  const { createContent, state: createState, error: createError, reset: resetCreate } = useCreateContent();

  // Use shared price hook
  const { ethUsdPrice, donutUsdPrice } = usePrices();

  // Farcaster context and wallet connection
  const { address, isConnected, connect, user: farcasterUser } = useFarcaster();

  // Community data
  const { unitState, refetch: refetchCommunityState } = useCommunityState(contentAddress, address);
  const { communityInfo } = useCommunityInfo(contentAddress);

  // DexScreener data for token price/market stats
  const { pairData, lpAddress } = useDexScreener(contentAddress, communityInfo?.unitAddress);

  // Use cached metadata hook
  const { metadata: tokenMetadata, logoUrl: tokenLogoUrl } = useTokenMetadata(unitState?.uri);

  // Token total supply
  const { data: totalSupplyRaw } = useReadContract({
    address: communityInfo?.unitAddress,
    abi: ERC20_ABI,
    functionName: "totalSupply",
    chainId: DEFAULT_CHAIN_ID,
    query: {
      enabled: !!communityInfo?.unitAddress,
    },
  });

  // Claim rewards hook
  const { claimRewards, state: claimState, reset: resetClaim } = useClaimRewards();

  // Trade transaction handling - for buys (ETH -> Token, no approval needed)
  const { sendTransaction, isPending: isSwapping, data: swapTxHash } = useSendTransaction();
  const { isLoading: isWaitingSwap, isSuccess: swapSuccess, isError: swapError } = useWaitForTransactionReceipt({ hash: swapTxHash });

  // Batched transaction handling - for sells (Token -> ETH, needs approval)
  const {
    execute: executeBatch,
    state: batchState,
    reset: resetBatch,
  } = useBatchedTransaction();

  // Trade balances
  const { data: ethBalanceData, refetch: refetchEthBalance } = useBalance({
    address,
    chainId: DEFAULT_CHAIN_ID,
  });

  const { data: unitBalanceData, refetch: refetchUnitBalance } = useBalance({
    address,
    token: communityInfo?.unitAddress as Address,
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: !!communityInfo?.unitAddress },
  });

  const refetchBalances = useCallback(() => {
    refetchEthBalance();
    refetchUnitBalance();
  }, [refetchEthBalance, refetchUnitBalance]);

  // Swap tokens for trading
  const sellToken = tradeDirection === "buy" ? NATIVE_ETH_ADDRESS : (communityInfo?.unitAddress || "");
  const buyToken = tradeDirection === "buy" ? (communityInfo?.unitAddress || "") : NATIVE_ETH_ADDRESS;
  const sellDecimals = tradeDirection === "buy" ? 18 : 18;

  // Get price quote
  const { data: tradePriceQuote, isLoading: isLoadingTradePrice, error: tradePriceError } = useSwapPrice({
    sellToken,
    buyToken,
    sellAmount: tradeAmount || "0",
    sellTokenDecimals: sellDecimals,
    enabled: mode === "trade" && !!communityInfo?.unitAddress && !!tradeAmount && parseFloat(tradeAmount) > 0,
  });

  // Calculate output amount and price impact for auto slippage
  const tradeOutputAmountForSlippage = tradePriceQuote?.buyAmount
    ? formatBuyAmount(tradePriceQuote.buyAmount, 18)
    : "0";

  // Auto slippage: price impact + 1%, minimum 1%, maximum 49%
  const slippage = useMemo(() => {
    if (!tradePriceQuote?.buyAmount || !tradeAmount || parseFloat(tradeAmount) === 0) return 1;

    let inputUsd = tradePriceQuote?.sellAmountUsd ? parseFloat(tradePriceQuote.sellAmountUsd) : 0;
    let outputUsd = tradePriceQuote?.buyAmountUsd ? parseFloat(tradePriceQuote.buyAmountUsd) : 0;

    if (inputUsd === 0 || outputUsd === 0) {
      const dexPrice = pairData?.priceUsd ? parseFloat(pairData.priceUsd) : null;
      const onChainPrice = unitState?.priceInDonut && unitState.priceInDonut > 0n
        ? Number(formatEther(unitState.priceInDonut)) * donutUsdPrice
        : 0;
      const tokenPrice = dexPrice ?? onChainPrice;

      inputUsd = parseFloat(tradeAmount) * (tradeDirection === "buy" ? ethUsdPrice : tokenPrice);
      outputUsd = parseFloat(tradeOutputAmountForSlippage) * (tradeDirection === "buy" ? tokenPrice : ethUsdPrice);
    }

    if (inputUsd === 0) return 2;

    const impact = ((inputUsd - outputUsd) / inputUsd) * 100;
    return Math.min(49, Math.max(2, Math.ceil(Math.max(0, impact)) + 2));
  }, [tradePriceQuote, tradeAmount, tradeOutputAmountForSlippage, tradeDirection, ethUsdPrice, pairData?.priceUsd, unitState?.priceInDonut, donutUsdPrice]);

  // Get full quote for trading
  const { data: tradeQuote, isLoading: isLoadingTradeQuote, refetch: refetchTradeQuote } = useSwapQuote({
    sellToken,
    buyToken,
    sellAmount: tradeAmount || "0",
    sellTokenDecimals: sellDecimals,
    taker: address,
    slippageBps: Math.round(slippage * 100),
    enabled: mode === "trade" && !!communityInfo?.unitAddress && !!tradeAmount && parseFloat(tradeAmount) > 0 && !!address,
  });

  // Handle claim rewards success
  useEffect(() => {
    if (claimState === "success") {
      refetchCommunityState();
      refetchBalances();
      setTimeout(() => resetClaim(), 2000);
    } else if (claimState === "error") {
      setTimeout(() => resetClaim(), 2000);
    }
  }, [claimState, resetClaim, refetchCommunityState, refetchBalances]);

  // Track last processed swap hash to detect new successful swaps
  const lastProcessedSwapHash = useRef<string | null>(null);

  // Handle swap result (for buys via sendTransaction)
  useEffect(() => {
    if (swapSuccess && swapTxHash && swapTxHash !== lastProcessedSwapHash.current) {
      lastProcessedSwapHash.current = swapTxHash;
      setTradeAmount("");
      refetchBalances();
      refetchCommunityState();
      setTimeout(() => {
        refetchBalances();
        refetchCommunityState();
      }, 2000);
      if (tradeResultTimeoutRef.current) clearTimeout(tradeResultTimeoutRef.current);
      setTradeResult("success");
      tradeResultTimeoutRef.current = setTimeout(() => {
        setTradeResult(null);
        tradeResultTimeoutRef.current = null;
      }, 3000);
    }
  }, [swapSuccess, swapTxHash, refetchBalances, refetchCommunityState]);

  // Track last processed error hash
  const lastProcessedErrorHash = useRef<string | null>(null);

  // Handle swap failure
  useEffect(() => {
    if (swapError && swapTxHash && swapTxHash !== lastProcessedErrorHash.current) {
      lastProcessedErrorHash.current = swapTxHash;
      if (tradeResultTimeoutRef.current) clearTimeout(tradeResultTimeoutRef.current);
      setTradeResult("failure");
      tradeResultTimeoutRef.current = setTimeout(() => {
        setTradeResult(null);
        tradeResultTimeoutRef.current = null;
      }, 3000);
    }
  }, [swapError, swapTxHash]);

  // Handle batched transaction result (for sells)
  useEffect(() => {
    if (batchState === "success") {
      setTradeAmount("");
      resetBatch();
      refetchBalances();
      refetchCommunityState();
      setTimeout(() => {
        refetchBalances();
        refetchCommunityState();
      }, 2000);
      if (tradeResultTimeoutRef.current) clearTimeout(tradeResultTimeoutRef.current);
      setTradeResult("success");
      tradeResultTimeoutRef.current = setTimeout(() => {
        setTradeResult(null);
        tradeResultTimeoutRef.current = null;
      }, 3000);
    } else if (batchState === "error") {
      resetBatch();
      if (tradeResultTimeoutRef.current) clearTimeout(tradeResultTimeoutRef.current);
      setTradeResult("failure");
      tradeResultTimeoutRef.current = setTimeout(() => {
        setTradeResult(null);
        tradeResultTimeoutRef.current = null;
      }, 3000);
    }
  }, [batchState, resetBatch, refetchBalances, refetchCommunityState]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (tradeResultTimeoutRef.current) clearTimeout(tradeResultTimeoutRef.current);
    };
  }, []);

  // Trade handlers
  const handleTrade = useCallback(async () => {
    if (!tradeQuote?.transaction || !address || !tradeAmount) return;

    if (tradeDirection === "sell" && communityInfo?.unitAddress) {
      const sellAmountWei = parseUnits(tradeAmount, 18);
      const approveCall = encodeApproveCall(
        communityInfo.unitAddress as Address,
        tradeQuote.transaction.to as Address,
        sellAmountWei
      );

      const swapCall: Call = {
        to: tradeQuote.transaction.to as Address,
        data: tradeQuote.transaction.data as `0x${string}`,
        value: BigInt(tradeQuote.transaction.value || "0"),
      };

      try {
        await executeBatch([approveCall, swapCall]);
      } catch (error) {
        console.error("Trade failed:", error);
      }
    } else {
      sendTransaction({
        to: tradeQuote.transaction.to as Address,
        data: tradeQuote.transaction.data as `0x${string}`,
        value: BigInt(tradeQuote.transaction.value || "0"),
        chainId: DEFAULT_CHAIN_ID,
      });
    }
  }, [tradeQuote, address, tradeAmount, tradeDirection, communityInfo?.unitAddress, executeBatch, sendTransaction]);

  // Handle claim
  const handleClaim = useCallback(async () => {
    if (!address) {
      try {
        await connect();
      } catch {
        return;
      }
    }
    await claimRewards(contentAddress);
  }, [address, connect, claimRewards, contentAddress]);

  // Create content handlers
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be less than 5MB");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (event) => setImagePreview(event.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const resetCreateState = useCallback(() => {
    setContentType("image");
    setCreateDescription("");
    setImageFile(null);
    setImagePreview(null);
    setTextContent("");
    setLinkUrl("");
    resetCreate();
  }, [resetCreate]);

  const handleCreateSubmit = useCallback(async () => {
    if (!address) return;

    const metadata: { description?: string; contentType: "image" | "text" | "link"; text?: string; link?: string } = {
      description: createDescription || undefined,
      contentType,
    };

    if (contentType === "image") {
      if (!imageFile) {
        alert("Please select an image");
        return;
      }
    } else if (contentType === "text") {
      if (!textContent.trim()) {
        alert("Please enter some text");
        return;
      }
      metadata.text = textContent;
    } else if (contentType === "link") {
      if (!linkUrl) {
        alert("Please enter a URL");
        return;
      }
      metadata.link = linkUrl;
    }

    await createContent(
      contentAddress,
      address,
      metadata,
      contentType === "image" ? imageFile ?? undefined : undefined
    );
  }, [address, contentAddress, contentType, createDescription, imageFile, textContent, linkUrl, createContent]);

  // Handle create success
  useEffect(() => {
    if (createState === "success") {
      const timer = setTimeout(() => {
        resetCreateState();
        setMode("feed");
        refetchCommunityState();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [createState, resetCreateState, refetchCommunityState]);

  // Trade calculations
  const tradeBalance = tradeDirection === "buy" ? ethBalanceData : unitBalanceData;
  const tradeOutputAmount = tradePriceQuote?.buyAmount
    ? formatBuyAmount(tradePriceQuote.buyAmount, 18)
    : "0";
  const formattedTradeOutput = parseFloat(tradeOutputAmount).toLocaleString(undefined, { maximumFractionDigits: 6 });

  // Calculate price impact for display
  const priceImpact = useMemo(() => {
    if (!tradePriceQuote?.buyAmount || !tradeAmount || parseFloat(tradeAmount) === 0) return null;

    let inputUsd = tradePriceQuote?.sellAmountUsd ? parseFloat(tradePriceQuote.sellAmountUsd) : 0;
    let outputUsd = tradePriceQuote?.buyAmountUsd ? parseFloat(tradePriceQuote.buyAmountUsd) : 0;

    if (inputUsd === 0 || outputUsd === 0) {
      const dexPrice = pairData?.priceUsd ? parseFloat(pairData.priceUsd) : null;
      const onChainPrice = unitState?.priceInDonut && unitState.priceInDonut > 0n
        ? Number(formatEther(unitState.priceInDonut)) * donutUsdPrice
        : 0;
      const tokenPrice = dexPrice ?? onChainPrice;

      inputUsd = parseFloat(tradeAmount) * (tradeDirection === "buy" ? ethUsdPrice : tokenPrice);
      outputUsd = parseFloat(tradeOutputAmount) * (tradeDirection === "buy" ? tokenPrice : ethUsdPrice);
    }

    if (inputUsd === 0) return null;

    const impact = ((inputUsd - outputUsd) / inputUsd) * 100;
    return Math.max(0, impact);
  }, [tradePriceQuote, tradeAmount, tradeOutputAmount, tradeDirection, ethUsdPrice, pairData?.priceUsd, unitState?.priceInDonut, donutUsdPrice]);

  const tradeInsufficientBalance = useMemo(() => {
    if (!tradeAmount || !tradeBalance) return false;
    try {
      const sellAmountWei = parseUnits(tradeAmount, 18);
      return sellAmountWei > tradeBalance.value;
    } catch {
      return false;
    }
  }, [tradeAmount, tradeBalance]);

  const isTradeLoading = isLoadingTradePrice || isLoadingTradeQuote;
  const isBatchPending = batchState === "pending" || batchState === "confirming";
  const isTradePending = isBatchPending || isSwapping || isWaitingSwap;
  const hasNoLiquidity = tradePriceError || (tradeAmount && parseFloat(tradeAmount) > 0 && !isLoadingTradePrice && !tradePriceQuote?.buyAmount);

  const tokenSymbol = communityInfo?.tokenSymbol ?? "TOKEN";
  const tokenName = communityInfo?.tokenName ?? "Loading...";

  // Calculate values
  const unitPrice = unitState?.priceInDonut ?? 0n;
  const tokenPriceUsd = unitPrice > 0n ? Number(formatEther(unitPrice)) * donutUsdPrice : 0;

  // Token stats - prefer DexScreener data when available
  const totalSupply = totalSupplyRaw ? Number(formatUnits(totalSupplyRaw as bigint, TOKEN_DECIMALS)) : 0;
  const dexPriceUsd = pairData?.priceUsd ? parseFloat(pairData.priceUsd) : null;
  const displayPriceUsd = dexPriceUsd ?? tokenPriceUsd;
  const marketCap = pairData?.marketCap ?? (totalSupply * displayPriceUsd);
  const liquidity = pairData?.liquidity?.usd ?? 0;

  // User balances
  const unitBalance = unitState?.accountUnitBalance ? Number(formatUnits(unitState.accountUnitBalance, TOKEN_DECIMALS)) : 0;
  const unitBalanceUsd = unitPrice > 0n ? unitBalance * Number(formatEther(unitPrice)) * donutUsdPrice : 0;

  // Pending rewards (from unitState)
  const pendingUnit = unitState?.accountUnitEarned ?? 0n;
  const pendingQuote = 0n; // No longer available in new contract
  const pendingUnitUsd = pendingUnit > 0n ? Number(formatUnits(pendingUnit, TOKEN_DECIMALS)) * displayPriceUsd : 0;
  const pendingQuoteUsd = 0; // No longer available
  const hasPendingRewards = pendingUnit > 0n;

  // Trade button text
  const tradeButtonText = useMemo(() => {
    if (tradeResult === "success") return "Trade successful!";
    if (tradeResult === "failure") return "Trade failed";
    if (!isConnected) return "Connect Wallet";
    if (!tradeAmount || parseFloat(tradeAmount) === 0) return "Enter amount";
    if (tradeInsufficientBalance) return "Insufficient balance";
    if (hasNoLiquidity) return "No liquidity";
    if (isBatchPending) return batchState === "confirming" ? "Confirming..." : "Swapping...";
    if (isSwapping || isWaitingSwap) return "Swapping...";
    if (isLoadingTradeQuote) return "Loading...";
    return tradeDirection === "buy" ? "Buy" : "Sell";
  }, [tradeResult, isConnected, tradeAmount, tradeInsufficientBalance, hasNoLiquidity, isBatchPending, batchState, isSwapping, isWaitingSwap, isLoadingTradeQuote, tradeDirection]);

  const canTrade = isConnected && tradeAmount && parseFloat(tradeAmount) > 0 && !tradeInsufficientBalance && !isTradeLoading && !hasNoLiquidity && !!tradeQuote?.transaction?.to;

  // Launcher info
  const launcherAddress = unitState?.launcher as `0x${string}` | undefined;
  const hasLauncher = launcherAddress && launcherAddress !== "0x0000000000000000000000000000000000000000";
  const {
    displayName: launcherDisplayName,
    avatarUrl: launcherAvatarUrl,
    fid: launcherFid,
  } = useProfile(hasLauncher ? launcherAddress : undefined);

  // Show nothing until essential data is ready
  const isPageLoading = !communityInfo || !unitState;

  if (isPageLoading) {
    return (
      <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
        <div
          className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
          }}
        />
        <NavBar />
      </main>
    );
  }

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
        }}
      >
        {/* Fixed Header */}
        <div className="px-2 pb-2">
          <div className="relative flex items-center justify-between">
            <Link href="/explore" className="p-1 -ml-1 hover:opacity-70 transition-opacity z-10">
              <ArrowLeft className="h-5 w-5 text-teal-500" />
            </Link>
            <div className="w-6" /> {/* Spacer */}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Token Info + Price */}
          <div className="px-2 flex gap-3">
            <div className="flex-1">
              <div className="text-xs text-zinc-500 font-medium">{tokenSymbol}</div>
              <h1 className="text-xl font-bold">{tokenName}</h1>
              <div className="mt-1">
                <span className="text-2xl font-bold">${displayPriceUsd.toFixed(6)}</span>
              </div>
            </div>
            {/* Token Logo */}
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-900 flex items-center justify-center flex-shrink-0">
              {tokenLogoUrl ? (
                <img src={tokenLogoUrl} alt={tokenSymbol} className="w-12 h-12 object-cover rounded-xl" />
              ) : (
                <span className="text-lg font-bold text-teal-500">{tokenSymbol.slice(0, 2)}</span>
              )}
            </div>
          </div>

          {/* Stats Row */}
          <div className="px-2 mt-4 grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-zinc-500">Market Cap</div>
              <div className="text-sm font-semibold">{formatUsd(marketCap, true)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Liquidity</div>
              <div className="text-sm font-semibold">{formatUsd(liquidity, true)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Content</div>
              <div className="text-sm font-semibold">{Number(unitState.totalSupply).toLocaleString()}</div>
            </div>
          </div>

          {/* Your Position */}
          {address && (
            <div className="px-2 mt-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold">Your Position</h2>
                <button
                  onClick={async () => {
                    const communityUrl = `${window.location.origin}/community/${contentAddress}`;
                    try {
                      await navigator.clipboard.writeText(communityUrl);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    } catch {
                      setCopiedLink(false);
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-xs text-zinc-400"
                  title="Copy link"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLink ? "Copied" : "Share"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-zinc-500">Balance</div>
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    {tokenLogoUrl ? (
                      <img src={tokenLogoUrl} alt={tokenSymbol} className="w-4 h-4 rounded-full" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-teal-500 flex items-center justify-center text-[8px] text-black font-bold">
                        {tokenSymbol.slice(0, 2)}
                      </span>
                    )}
                    <span>{unitBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="text-[10px] text-zinc-600">{formatUsd(unitBalanceUsd)}</div>
                </div>
                {hasPendingRewards && (
                  <div>
                    <div className="text-xs text-zinc-500">Pending Rewards</div>
                    <div className="text-sm font-semibold text-teal-400">
                      +{formatUsd(pendingUnitUsd + pendingQuoteUsd)}
                    </div>
                    <button
                      onClick={handleClaim}
                      disabled={claimState === "pending" || claimState === "confirming"}
                      className="mt-1 flex items-center gap-1 text-[10px] text-teal-400 hover:text-teal-300"
                    >
                      <Coins className="w-3 h-3" />
                      {claimState === "success" ? "Claimed!" : claimState === "pending" || claimState === "confirming" ? "Claiming..." : "Claim"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* About Section */}
          {(tokenMetadata?.description || hasLauncher) && (
            <div className="px-2 mt-4">
              <h2 className="text-sm font-bold mb-2">About</h2>
              {hasLauncher && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-zinc-500">Launched by</span>
                  <button
                    onClick={() => launcherFid && viewProfile(launcherFid)}
                    disabled={!launcherFid}
                    className={`flex items-center gap-2 ${launcherFid ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={launcherAvatarUrl} alt={launcherDisplayName} />
                      <AvatarFallback className="bg-zinc-800 text-white text-[8px]">
                        {(launcherAddress as string).slice(2, 4).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className={`text-xs font-medium text-white ${launcherFid ? "hover:text-teal-400" : ""}`}>
                      {launcherDisplayName}
                    </span>
                  </button>
                </div>
              )}
              {tokenMetadata?.description && (
                <p className="text-xs text-zinc-400">{tokenMetadata.description}</p>
              )}
            </div>
          )}

          {mode === "feed" && (
            <>
              {/* Content Feed Section */}
              <div className="px-2 mt-4">
                <h2 className="text-sm font-bold mb-3">Content Feed</h2>
                <ContentFeed
                  contentAddress={contentAddress}
                  userAddress={address as `0x${string}` | undefined}
                />
              </div>

              {/* Spacer for bottom bar */}
              <div className="h-24" />
            </>
          )}

          {(mode === "trade" || mode === "create") && (
            <>
              {/* Trade/Create Mode - Spacer */}
              <div className="h-96" />
            </>
          )}
        </div>

        {/* Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-sm">
          <div className="max-w-[520px] mx-auto px-2 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+72px)]">
            {mode === "feed" && (
              /* Feed Mode - Create & Trade Buttons */
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    resetCreateState();
                    setMode("create");
                  }}
                  disabled={!isConnected}
                  className={cn(
                    "flex-1 py-3 rounded-lg font-semibold transition-all text-sm flex items-center justify-center gap-2",
                    isConnected
                      ? "bg-teal-500 text-black hover:bg-teal-600 active:scale-[0.98]"
                      : "bg-zinc-700 text-gray-400 cursor-not-allowed"
                  )}
                >
                  <Plus className="w-5 h-5" />
                  Create
                </button>
                <button
                  onClick={() => {
                    setMode("trade");
                    setTradeAmount("");
                  }}
                  className="flex-1 py-3 rounded-lg font-semibold transition-all text-sm flex items-center justify-center gap-2 bg-zinc-800 text-white hover:bg-zinc-700 active:scale-[0.98]"
                >
                  <ArrowDownUp className="w-5 h-5" />
                  Trade
                </button>
              </div>
            )}

            {mode === "create" && (
              <>
                {/* Create Mode UI */}
                {/* Content type selector */}
                <div className="flex gap-2 mb-3">
                  {[
                    { type: "image" as const, icon: Image, label: "Image" },
                    { type: "text" as const, icon: FileText, label: "Text" },
                    { type: "link" as const, icon: Link2, label: "Link" },
                  ].map(({ type, icon: Icon, label }) => (
                    <button
                      key={type}
                      onClick={() => setContentType(type)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors",
                        contentType === type
                          ? "bg-teal-600 text-white"
                          : "bg-zinc-800 text-gray-400 hover:bg-zinc-700"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-sm">{label}</span>
                    </button>
                  ))}
                </div>

                {/* Content input area */}
                <div className="bg-zinc-900 rounded-xl p-3 mb-3">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />

                  {contentType === "image" && (
                    imagePreview ? (
                      <div className="relative">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full aspect-square object-cover rounded-lg"
                        />
                        <button
                          onClick={() => {
                            setImageFile(null);
                            setImagePreview(null);
                          }}
                          className="absolute top-2 right-2 p-1 bg-black/50 rounded-full hover:bg-black/70"
                        >
                          <X className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full aspect-video bg-zinc-800 rounded-lg border-2 border-dashed border-zinc-700 hover:border-teal-500 transition-colors flex flex-col items-center justify-center gap-2"
                      >
                        <Upload className="w-8 h-8 text-gray-500" />
                        <span className="text-gray-500 text-sm">Click to upload an image</span>
                        <span className="text-gray-600 text-xs">Max 5MB</span>
                      </button>
                    )
                  )}

                  {contentType === "text" && (
                    <textarea
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      placeholder="What's on your mind?"
                      className="w-full h-32 bg-zinc-800 rounded-lg p-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                      maxLength={2000}
                    />
                  )}

                  {contentType === "link" && (
                    <input
                      type="url"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full bg-zinc-800 rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    />
                  )}
                </div>

                {/* Description input */}
                <div className="bg-zinc-900 rounded-xl p-3 mb-3">
                  <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
                  <input
                    type="text"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    placeholder="Add a description..."
                    className="w-full bg-zinc-800 rounded-lg p-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    maxLength={280}
                  />
                </div>

                {/* Error/Success messages */}
                {createError && (
                  <div className="p-3 mb-3 bg-teal-500/20 border border-teal-500/50 rounded-lg text-teal-400 text-sm">
                    {createError.message}
                  </div>
                )}
                {createState === "success" && (
                  <div className="p-3 mb-3 bg-teal-500/20 border border-teal-500/50 rounded-lg text-teal-400 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Content created successfully!
                  </div>
                )}

                {/* Create Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      resetCreateState();
                      setMode("feed");
                    }}
                    className="flex-1 py-3 rounded-lg font-semibold transition-all text-sm bg-zinc-800 text-white hover:bg-zinc-700 active:scale-[0.98]"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCreateSubmit}
                    disabled={createState === "uploading" || createState === "pending" || createState === "confirming" || createState === "success"}
                    className={cn(
                      "flex-1 py-3 rounded-lg font-semibold transition-all text-sm flex items-center justify-center gap-2",
                      createState === "uploading" || createState === "pending" || createState === "confirming" || createState === "success"
                        ? "bg-zinc-700 text-gray-400 cursor-not-allowed"
                        : "bg-teal-500 text-black hover:bg-teal-600 active:scale-[0.98]"
                    )}
                  >
                    {createState === "uploading" && (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    )}
                    {createState === "pending" && (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Confirm...
                      </>
                    )}
                    {createState === "confirming" && (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    )}
                    {createState === "success" && (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Created!
                      </>
                    )}
                    {(createState === "idle" || createState === "error") && "Create"}
                  </button>
                </div>
              </>
            )}

            {mode === "trade" && (
              <>
                {/* Trade Mode UI */}
                {/* Trade Input */}
                <div className="bg-zinc-900 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-500">You pay</span>
                    {tradeBalance && (
                      <button
                        onClick={() => {
                          if (tradeDirection === "buy" && ethBalanceData) {
                            const maxEth = parseFloat(formatUnits(ethBalanceData.value, 18)) - 0.001;
                            setTradeAmount(Math.max(0, maxEth).toString());
                          } else if (tradeDirection === "sell" && unitBalanceData) {
                            setTradeAmount(formatUnits(unitBalanceData.value, 18));
                          }
                        }}
                        className="text-xs text-zinc-500 hover:text-zinc-400"
                      >
                        Balance: {parseFloat(formatUnits(tradeBalance.value, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-zinc-800 flex items-center justify-center">
                      {tradeDirection === "buy" ? (
                        <img src="https://assets.coingecko.com/coins/images/279/small/ethereum.png" alt="ETH" className="w-full h-full object-cover" />
                      ) : tokenLogoUrl ? (
                        <img src={tokenLogoUrl} alt={tokenSymbol} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-teal-500">{tokenSymbol.slice(0, 2)}</span>
                      )}
                    </div>
                    <input
                      type="number"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      placeholder="0"
                      className="flex-1 min-w-0 bg-transparent text-xl font-semibold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="shrink-0 text-sm font-semibold text-zinc-400">
                      {tradeDirection === "buy" ? "ETH" : tokenSymbol}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600 mt-1">
                    {tradeAmount && parseFloat(tradeAmount) > 0
                      ? `$${(parseFloat(tradeAmount) * (tradeDirection === "buy" ? ethUsdPrice : displayPriceUsd)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "$0.00"}
                  </div>
                </div>

                {/* Swap Direction Button */}
                <div className="flex justify-center -my-4 relative z-10">
                  <button
                    onClick={() => {
                      setTradeDirection(tradeDirection === "buy" ? "sell" : "buy");
                      setTradeAmount("");
                    }}
                    className="bg-zinc-700 hover:bg-zinc-600 p-2 rounded-xl border-4 border-black transition-colors"
                  >
                    <ArrowDownUp className="w-4 h-4" />
                  </button>
                </div>

                {/* Trade Output */}
                <div className="bg-zinc-900/50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-500">You receive</span>
                    <span className="text-xs text-zinc-500">
                      Balance: {tradeDirection === "buy"
                        ? (unitBalanceData ? parseFloat(formatUnits(unitBalanceData.value, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0")
                        : (ethBalanceData ? parseFloat(formatUnits(ethBalanceData.value, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0")
                      }
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-zinc-800 flex items-center justify-center">
                      {tradeDirection === "buy" ? (
                        tokenLogoUrl ? (
                          <img src={tokenLogoUrl} alt={tokenSymbol} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold text-teal-500">{tokenSymbol.slice(0, 2)}</span>
                        )
                      ) : (
                        <img src="https://assets.coingecko.com/coins/images/279/small/ethereum.png" alt="ETH" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 text-xl font-semibold text-zinc-300">
                      {isTradeLoading && tradeAmount ? (
                        <span className="inline-flex items-center gap-0.5">
                          <span className="animate-bounce-dot-1">•</span>
                          <span className="animate-bounce-dot-2">•</span>
                          <span className="animate-bounce-dot-3">•</span>
                        </span>
                      ) : formattedTradeOutput}
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-zinc-400">
                      {tradeDirection === "buy" ? tokenSymbol : "ETH"}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600 mt-1">
                    {parseFloat(tradeOutputAmount) > 0
                      ? `$${(parseFloat(tradeOutputAmount) * (tradeDirection === "buy" ? displayPriceUsd : ethUsdPrice)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "$0.00"}
                  </div>
                </div>

                {/* Trade Info */}
                <div className="flex justify-between text-xs text-zinc-500 px-1 py-2">
                  <span>Min. received</span>
                  <span>
                    {tradePriceQuote?.buyAmount
                      ? (parseFloat(formatBuyAmount(tradePriceQuote.buyAmount, 18)) * (1 - slippage / 100)).toLocaleString(undefined, { maximumFractionDigits: 6 })
                      : "0"
                    } {tradeDirection === "buy" ? tokenSymbol : "ETH"}
                  </span>
                </div>
                <div className="flex justify-between text-xs px-1 pb-3">
                  <span className="text-zinc-500">Price impact / Slippage</span>
                  <span className={cn(
                    priceImpact !== null && priceImpact > 10 ? "text-teal-500" :
                    priceImpact !== null && priceImpact > 5 ? "text-teal-500" : "text-zinc-500"
                  )}>
                    {priceImpact !== null && priceImpact > 5 && "⚠️ "}
                    {priceImpact !== null ? `${priceImpact.toFixed(2)}%` : "—"} / {slippage}%
                  </span>
                </div>

                {/* Trade Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setMode("feed");
                      setTradeAmount("");
                    }}
                    className="flex-1 py-3 rounded-lg font-semibold transition-all text-sm bg-zinc-800 text-white hover:bg-zinc-700 active:scale-[0.98]"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleTrade}
                    disabled={!canTrade || isTradePending || tradeResult !== null}
                    className={cn(
                      "flex-1 py-3 rounded-lg font-semibold transition-all text-sm bg-teal-500 text-black hover:bg-teal-600",
                      (!canTrade || isTradePending || tradeResult !== null) && "cursor-not-allowed",
                      (!canTrade || isTradePending) && tradeResult === null && "opacity-40"
                    )}
                  >
                    {tradeButtonText}
                  </button>
                </div>

                {/* No Liquidity Message */}
                {hasNoLiquidity && tradeAmount && parseFloat(tradeAmount) > 0 && (
                  <div className="mt-2 text-center text-xs text-zinc-500">
                    This token may only be tradeable on its native DEX
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <NavBar />
    </main>
  );
}
