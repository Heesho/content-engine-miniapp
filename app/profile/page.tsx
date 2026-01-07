"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { formatEther, formatUnits, parseUnits } from "viem";
import { Coins, Droplets } from "lucide-react";
import { useBalance, useWriteContract, useWaitForTransactionReceipt } from "wagmi";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { useFarcaster, getUserDisplayName, getUserHandle, initialsFrom } from "@/hooks/useFarcaster";
import { useExploreCommunities } from "@/hooks/useAllCommunities";
import { useAllPendingRewards, useClaimRewards } from "@/hooks/useRewards";
import { cn, getDonutPrice } from "@/lib/utils";
import { DEFAULT_DONUT_PRICE_USD, PRICE_REFETCH_INTERVAL_MS, ipfsToHttp, USDC_DECIMALS, TOKEN_DECIMALS, DEFAULT_CHAIN_ID } from "@/lib/constants";
import { CONTRACT_ADDRESSES, MOCK_TOKEN_ABI } from "@/lib/contracts";

type TabOption = "collected" | "launched";

const formatTokenAmount = (value: bigint, maximumFractionDigits = 2) => {
  if (value === 0n) return "0";
  const asNumber = Number(formatEther(value));
  if (!Number.isFinite(asNumber)) {
    return formatEther(value);
  }
  return asNumber.toLocaleString(undefined, {
    maximumFractionDigits,
  });
};

function CommunityCard({ community, donutUsdPrice, showRewards }: {
  community: {
    address: `0x${string}`;
    tokenName: string;
    tokenSymbol: string;
    uri?: string;
    unitPrice: bigint;
    totalSupply: bigint;
    unitBalance?: bigint;
    earnedUnit?: bigint;
    earnedQuote?: bigint;
  };
  donutUsdPrice: number;
  showRewards?: boolean;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!community.uri) return;
    const metadataUrl = ipfsToHttp(community.uri);
    if (!metadataUrl) return;

    fetch(metadataUrl)
      .then((res) => res.json())
      .then((metadata) => {
        if (metadata.image) {
          setLogoUrl(ipfsToHttp(metadata.image));
        }
      })
      .catch(() => {});
  }, [community.uri]);

  // Calculate balance value
  const tokenPriceUsd = community.unitPrice > 0n ? Number(formatEther(community.unitPrice)) * donutUsdPrice : 0;
  const balanceValue = community.unitBalance
    ? Number(formatUnits(community.unitBalance, TOKEN_DECIMALS)) * tokenPriceUsd
    : 0;

  // Calculate pending rewards
  const pendingUnit = community.earnedUnit ?? 0n;
  const pendingQuote = community.earnedQuote ?? 0n;
  const pendingUnitUsd = pendingUnit > 0n ? Number(formatUnits(pendingUnit, TOKEN_DECIMALS)) * tokenPriceUsd : 0;
  const pendingQuoteUsd = pendingQuote > 0n ? Number(formatUnits(pendingQuote, USDC_DECIMALS)) : 0;
  const totalPendingUsd = pendingUnitUsd + pendingQuoteUsd;

  return (
    <Link href={`/community/${community.address}`} className="block mb-1.5">
      <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center overflow-hidden">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={community.tokenSymbol}
              className="w-12 h-12 object-cover rounded-xl"
            />
          ) : (
            <span className="text-teal-500 font-bold text-lg">
              {community.tokenSymbol.slice(0, 2)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">
            {community.tokenName}
          </div>
          <div className="text-sm text-gray-500">
            {community.tokenSymbol}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          {showRewards && totalPendingUsd > 0 ? (
            <>
              <div className="text-sm font-semibold text-teal-400">
                +${totalPendingUsd.toFixed(2)}
              </div>
              <div className="text-xs text-gray-500">
                pending rewards
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-teal-500">
                {community.unitBalance ? formatTokenAmount(community.unitBalance) : "0"}
              </div>
              <div className="text-xs text-gray-500">
                ${balanceValue.toFixed(2)}
              </div>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

function LaunchedCommunityCard({ community, donutUsdPrice }: {
  community: {
    address: `0x${string}`;
    tokenName: string;
    tokenSymbol: string;
    uri?: string;
    unitPrice: bigint;
    totalSupply: bigint;
  };
  donutUsdPrice: number;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!community.uri) return;
    const metadataUrl = ipfsToHttp(community.uri);
    if (!metadataUrl) return;

    fetch(metadataUrl)
      .then((res) => res.json())
      .then((metadata) => {
        if (metadata.image) {
          setLogoUrl(ipfsToHttp(metadata.image));
        }
      })
      .catch(() => {});
  }, [community.uri]);

  // Calculate market cap
  const tokenPriceUsd = community.unitPrice > 0n ? Number(formatEther(community.unitPrice)) * donutUsdPrice : 0;
  const totalSupplyNum = Number(formatUnits(community.totalSupply, TOKEN_DECIMALS));
  const marketCapUsd = totalSupplyNum * tokenPriceUsd;

  const formatUsd = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  return (
    <Link href={`/community/${community.address}`} className="block mb-1.5">
      <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center overflow-hidden">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={community.tokenSymbol}
              className="w-12 h-12 object-cover rounded-xl"
            />
          ) : (
            <span className="text-teal-500 font-bold text-lg">
              {community.tokenSymbol.slice(0, 2)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">
            {community.tokenName}
          </div>
          <div className="text-sm text-gray-500">
            {community.tokenSymbol}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-sm font-semibold text-teal-500">
            {formatUsd(marketCapUsd)} mcap
          </div>
          <div className="text-xs text-gray-500">
            {Number(community.totalSupply).toLocaleString()} content
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<TabOption>("collected");
  const [donutUsdPrice, setDonutUsdPrice] = useState<number>(DEFAULT_DONUT_PRICE_USD);

  const { user, address } = useFarcaster();
  const { communities, isLoading } = useExploreCommunities("active", "", address);

  // Token balances for faucet
  const { data: usdcBalance, refetch: refetchUsdc } = useBalance({
    address,
    token: CONTRACT_ADDRESSES.usdc as `0x${string}`,
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: !!address },
  });

  const { data: donutBalance, refetch: refetchDonut } = useBalance({
    address,
    token: CONTRACT_ADDRESSES.donut as `0x${string}`,
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: !!address },
  });

  // Mint USDC
  const {
    writeContract: mintUsdc,
    data: usdcTxHash,
    isPending: isUsdcPending,
    reset: resetUsdcMint,
  } = useWriteContract();

  const { isLoading: isUsdcConfirming, isSuccess: isUsdcSuccess } = useWaitForTransactionReceipt({
    hash: usdcTxHash,
  });

  // Mint DONUT
  const {
    writeContract: mintDonut,
    data: donutTxHash,
    isPending: isDonutPending,
    reset: resetDonutMint,
  } = useWriteContract();

  const { isLoading: isDonutConfirming, isSuccess: isDonutSuccess } = useWaitForTransactionReceipt({
    hash: donutTxHash,
  });

  // Handle USDC mint success
  useEffect(() => {
    if (isUsdcSuccess) {
      refetchUsdc();
      setTimeout(() => resetUsdcMint(), 2000);
    }
  }, [isUsdcSuccess, refetchUsdc, resetUsdcMint]);

  // Handle DONUT mint success
  useEffect(() => {
    if (isDonutSuccess) {
      refetchDonut();
      setTimeout(() => resetDonutMint(), 2000);
    }
  }, [isDonutSuccess, refetchDonut, resetDonutMint]);

  const handleMintUsdc = useCallback(() => {
    if (!address) return;
    mintUsdc({
      address: CONTRACT_ADDRESSES.usdc as `0x${string}`,
      abi: MOCK_TOKEN_ABI,
      functionName: "mint",
      args: [address, parseUnits("1000", USDC_DECIMALS)], // Mint 1000 USDC
      chainId: DEFAULT_CHAIN_ID,
    });
  }, [address, mintUsdc]);

  const handleMintDonut = useCallback(() => {
    if (!address) return;
    mintDonut({
      address: CONTRACT_ADDRESSES.donut as `0x${string}`,
      abi: MOCK_TOKEN_ABI,
      functionName: "mint",
      args: [address, parseUnits("10000", TOKEN_DECIMALS)], // Mint 10000 DONUT
      chainId: DEFAULT_CHAIN_ID,
    });
  }, [address, mintDonut]);

  // Get addresses of communities user has launched
  const launchedCommunities = useMemo(() => {
    if (!address || !communities) return [];
    return communities.filter(c =>
      c.launcher && c.launcher.toLowerCase() === address.toLowerCase()
    );
  }, [communities, address]);

  // Get communities where user has a balance (collected)
  const collectedCommunities = useMemo(() => {
    if (!address || !communities) return [];
    return communities.filter(c => c.unitBalance && c.unitBalance > 0n);
  }, [communities, address]);

  // Get community addresses for rewards lookup
  const communityAddresses = useMemo(() => {
    return communities.map(c => c.address);
  }, [communities]);

  // Get pending rewards across all communities
  const { pendingRewards, totalPendingUsd, refetch: refetchRewards } = useAllPendingRewards(
    communityAddresses,
    address
  );

  // Claim rewards hook
  const { claimRewards, state: claimState, reset: resetClaim } = useClaimRewards();

  const handleClaimAll = useCallback(async () => {
    if (!address || !pendingRewards) return;

    // Find communities with pending rewards
    const communitiesWithRewards = Object.entries(pendingRewards)
      .filter(([_, reward]) => reward.earnedUnit > 0n || reward.earnedQuote > 0n)
      .map(([addr]) => addr as `0x${string}`);

    // Claim from first community with rewards (could batch in future)
    if (communitiesWithRewards.length > 0) {
      await claimRewards(communitiesWithRewards[0]);
      setTimeout(() => {
        refetchRewards();
        resetClaim();
      }, 2000);
    }
  }, [address, pendingRewards, claimRewards, refetchRewards, resetClaim]);

  // Fetch DONUT price
  useEffect(() => {
    const fetchPrice = async () => {
      const price = await getDonutPrice();
      setDonutUsdPrice(price);
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, PRICE_REFETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const userDisplayName = getUserDisplayName(user);
  const userHandle = getUserHandle(user);
  const userAvatarUrl = user?.pfpUrl ?? null;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold tracking-wide">PROFILE</h1>
          </div>

          {/* User Info */}
          {user ? (
            <div className="flex items-center gap-3 mb-4 px-1">
              <Avatar className="h-14 w-14 border-2 border-teal-500">
                <AvatarImage
                  src={userAvatarUrl || undefined}
                  alt={userDisplayName}
                  className="object-cover"
                />
                <AvatarFallback className="bg-zinc-800 text-white text-lg">
                  {initialsFrom(userDisplayName)}
                </AvatarFallback>
              </Avatar>
              <div className="leading-tight text-left">
                <div className="text-lg font-bold">{userDisplayName}</div>
                {userHandle ? (
                  <div className="text-sm text-gray-400">{userHandle}</div>
                ) : null}
                {address && (
                  <div className="text-xs text-gray-600 font-mono">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-6 mb-4 rounded-xl bg-zinc-900">
              <p className="text-gray-500">Connect wallet to view your profile</p>
            </div>
          )}

          {/* Faucet Section */}
          {user && address && (
            <div className="mx-0.5 mb-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
              <div className="flex items-center gap-2 mb-3">
                <Droplets className="w-4 h-4 text-teal-400" />
                <span className="text-sm font-semibold text-white">Test Token Faucet</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* USDC */}
                <div className="p-2 rounded-lg bg-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400">USDC</span>
                    <span className="text-xs font-mono text-white">
                      {usdcBalance ? Number(formatUnits(usdcBalance.value, USDC_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0"}
                    </span>
                  </div>
                  <button
                    onClick={handleMintUsdc}
                    disabled={isUsdcPending || isUsdcConfirming}
                    className="w-full py-1.5 rounded-md bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUsdcSuccess ? "Minted!" : isUsdcPending || isUsdcConfirming ? "Minting..." : "Mint 1,000"}
                  </button>
                </div>
                {/* DONUT */}
                <div className="p-2 rounded-lg bg-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400">DONUT</span>
                    <span className="text-xs font-mono text-white">
                      {donutBalance ? Number(formatUnits(donutBalance.value, TOKEN_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0"}
                    </span>
                  </div>
                  <button
                    onClick={handleMintDonut}
                    disabled={isDonutPending || isDonutConfirming}
                    className="w-full py-1.5 rounded-md bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDonutSuccess ? "Minted!" : isDonutPending || isDonutConfirming ? "Minting..." : "Mint 10,000"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Pending Rewards Banner */}
          {user && totalPendingUsd > 0 && (
            <div className="mx-0.5 mb-3 p-3 rounded-xl bg-teal-500/10 border border-teal-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-teal-400">Pending Rewards</div>
                  <div className="text-lg font-bold text-teal-400">+${totalPendingUsd.toFixed(2)}</div>
                </div>
                <button
                  onClick={handleClaimAll}
                  disabled={claimState === "pending" || claimState === "confirming"}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500 text-black font-semibold hover:bg-teal-400 transition-colors disabled:opacity-50"
                >
                  <Coins className="w-4 h-4" />
                  {claimState === "success" ? "Claimed!" : claimState === "pending" || claimState === "confirming" ? "Claiming..." : "Claim"}
                </button>
              </div>
            </div>
          )}

          {/* Stats/Tabs */}
          {user && (
            <div className="grid grid-cols-2 gap-2 mb-3 px-0.5">
              <button
                onClick={() => setActiveTab("collected")}
                className={cn(
                  "p-3 rounded-xl text-center transition-colors",
                  activeTab === "collected"
                    ? "bg-teal-500/20 ring-2 ring-teal-500"
                    : "bg-zinc-900 hover:bg-zinc-800"
                )}
              >
                <div className="text-2xl font-bold text-teal-500">{collectedCommunities.length}</div>
                <div className="text-xs text-gray-500">Communities</div>
              </button>
              <button
                onClick={() => setActiveTab("launched")}
                className={cn(
                  "p-3 rounded-xl text-center transition-colors",
                  activeTab === "launched"
                    ? "bg-teal-500/20 ring-2 ring-teal-500"
                    : "bg-zinc-900 hover:bg-zinc-800"
                )}
              >
                <div className="text-2xl font-bold text-teal-500">{launchedCommunities.length}</div>
                <div className="text-xs text-gray-500">Launched</div>
            </button>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {!user ? null : !address ? (
              <div className="flex flex-col items-center justify-center h-32 text-center text-gray-500">
                <p className="text-lg font-semibold">Wallet not connected</p>
                <p className="text-sm mt-1">Please connect your wallet to see your communities</p>
              </div>
            ) : isLoading ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                <p className="text-sm">Loading...</p>
              </div>
            ) : activeTab === "collected" ? (
              collectedCommunities.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center text-gray-500">
                  <p className="text-lg font-semibold">No communities yet</p>
                  <p className="text-sm mt-1">Collect content to join communities!</p>
                </div>
              ) : (
                collectedCommunities.map((community) => (
                  <CommunityCard
                    key={community.address}
                    community={{
                      ...community,
                      earnedUnit: pendingRewards?.[community.address]?.earnedUnit,
                      earnedQuote: pendingRewards?.[community.address]?.earnedQuote,
                    }}
                    donutUsdPrice={donutUsdPrice}
                    showRewards={!!pendingRewards?.[community.address]}
                  />
                ))
              )
            ) : launchedCommunities.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center text-gray-500">
                <p className="text-lg font-semibold">No communities launched</p>
                <p className="text-sm mt-1">Launch your first community!</p>
              </div>
            ) : (
              launchedCommunities.map((community) => (
                <LaunchedCommunityCard key={community.address} community={community} donutUsdPrice={donutUsdPrice} />
              ))
            )}
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}
