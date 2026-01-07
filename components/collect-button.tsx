"use client";

import { formatUnits } from "viem";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { USDC_DECIMALS } from "@/lib/constants";

type CollectButtonProps = {
  price: bigint;
  onClick?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  variant?: "default" | "large";
  className?: string;
};

const formatUsdc = (value: bigint) => {
  const num = Number(formatUnits(value, USDC_DECIMALS));
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  if (num >= 1) return `$${num.toFixed(2)}`;
  if (num >= 0.01) return `$${num.toFixed(2)}`;
  return `$${num.toFixed(4)}`;
};

export function CollectButton({
  price,
  onClick,
  isLoading = false,
  disabled = false,
  variant = "default",
  className,
}: CollectButtonProps) {
  const isLarge = variant === "large";

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        "flex items-center justify-center gap-2 font-semibold rounded-lg transition-all",
        isLarge
          ? "px-6 py-3 text-base"
          : "px-3 py-1.5 text-sm",
        disabled || isLoading
          ? "bg-zinc-700 text-gray-400 cursor-not-allowed"
          : "bg-purple-600 hover:bg-purple-500 text-white active:scale-95",
        className
      )}
    >
      {isLoading ? (
        <>
          <Loader2 className={cn("animate-spin", isLarge ? "w-5 h-5" : "w-4 h-4")} />
          <span>Collecting...</span>
        </>
      ) : (
        <>
          <span>Collect</span>
          <span className="opacity-75">{formatUsdc(price)}</span>
        </>
      )}
    </button>
  );
}

// Variant that shows just the price (for compact displays)
export function CollectPriceBadge({ price }: { price: bigint }) {
  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 bg-purple-600/20 text-purple-400 rounded-md text-sm font-medium">
      <span>{formatUsdc(price)}</span>
    </div>
  );
}
