"use client";

import { useEffect, useState, useRef } from "react";
import { Search } from "lucide-react";

import { NavBar } from "@/components/nav-bar";
import { CommunityCard } from "@/components/community-card";
import { useExploreCommunities, type SortOption } from "@/hooks/useAllCommunities";
import { useFarcaster } from "@/hooks/useFarcaster";
import { cn, getDonutPrice } from "@/lib/utils";
import { DEFAULT_DONUT_PRICE_USD, PRICE_REFETCH_INTERVAL_MS } from "@/lib/constants";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "new", label: "New" },
  { value: "top", label: "Top" },
];

export default function ExplorePage() {
  const [sortBy, setSortBy] = useState<SortOption>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [donutUsdPrice, setDonutUsdPrice] = useState<number>(DEFAULT_DONUT_PRICE_USD);
  const [newActivityAddress, setNewActivityAddress] = useState<string | null>(null);
  const prevTopCommunityRef = useRef<string | null>(null);

  // Farcaster context and wallet connection
  const { address } = useFarcaster();

  // Get communities data
  const { communities, isLoading } = useExploreCommunities(sortBy, searchQuery, address);

  // Track when a new community moves to the top
  useEffect(() => {
    if (sortBy !== "active" || communities.length === 0) {
      prevTopCommunityRef.current = null;
      setNewActivityAddress(null);
      return;
    }

    const currentTopCommunity = communities[0].address;

    // If this is a different community than before, it's new activity
    if (prevTopCommunityRef.current && prevTopCommunityRef.current !== currentTopCommunity) {
      setNewActivityAddress(currentTopCommunity);
      // Clear the "new" animation after it plays
      const timer = setTimeout(() => {
        setNewActivityAddress(null);
      }, 3000);
      return () => clearTimeout(timer);
    }

    prevTopCommunityRef.current = currentTopCommunity;
  }, [communities, sortBy]);

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
          <div className="mb-2">
            <h1 className="text-2xl font-bold tracking-wide">EXPLORE</h1>
          </div>

          {/* Search Bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, symbol, or address..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-10 pr-4 py-2.5 text-sm font-mono text-white placeholder-gray-500 focus:outline-none focus:border-zinc-600"
            />
          </div>

          {/* Sort Tabs */}
          <div className="flex gap-1 mb-3">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSortBy(option.value)}
                className={cn(
                  "flex-1 py-1.5 px-3 rounded-lg text-sm font-semibold transition-colors",
                  sortBy === option.value
                    ? "bg-teal-500 text-black"
                    : "bg-zinc-900 text-gray-400 hover:text-white"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Community List */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {isLoading ? null : communities.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                <p className="text-lg font-semibold">No communities found</p>
                <p className="text-sm mt-1">
                  {searchQuery
                    ? "Try a different search term"
                    : "Be the first to launch a community!"}
                </p>
              </div>
            ) : (
              communities.map((community, index) => (
                <CommunityCard
                  key={community.address}
                  community={community}
                  donutUsdPrice={donutUsdPrice}
                  isActive={sortBy === "active" && index === 0}
                  isNew={community.address === newActivityAddress}
                />
              ))
            )}
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}
