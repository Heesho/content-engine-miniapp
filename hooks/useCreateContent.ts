import { useState, useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTENT_ABI, type ContentMetadata } from "@/lib/contracts";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

type CreateContentState = "idle" | "uploading" | "pending" | "confirming" | "success" | "error";

type UseCreateContentReturn = {
  createContent: (
    contentAddress: `0x${string}`,
    creatorAddress: `0x${string}`,
    metadata: ContentMetadata,
    imageFile?: File
  ) => Promise<void>;
  state: CreateContentState;
  error: Error | null;
  reset: () => void;
};

/**
 * Hook for creating new content in a community.
 * Handles:
 * 1. Image upload to IPFS (if provided)
 * 2. Metadata upload to IPFS
 * 3. Content.create() transaction
 */
export function useCreateContent(): UseCreateContentReturn {
  const [state, setState] = useState<CreateContentState>("idle");
  const [error, setError] = useState<Error | null>(null);

  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: DEFAULT_CHAIN_ID,
  });

  // Update state based on transaction status
  if (isPending && state !== "pending") {
    setState("pending");
  }
  if (isConfirming && state !== "confirming") {
    setState("confirming");
  }
  if (isSuccess && state !== "success") {
    setState("success");
  }
  if (writeError && state !== "error") {
    setError(writeError);
    setState("error");
  }

  const createContent = useCallback(
    async (
      contentAddress: `0x${string}`,
      creatorAddress: `0x${string}`,
      metadata: ContentMetadata,
      imageFile?: File
    ) => {
      try {
        setError(null);
        setState("uploading");

        let imageUrl: string | undefined;

        // 1. Upload image to IPFS if provided
        if (imageFile) {
          const formData = new FormData();
          formData.append("file", imageFile);
          formData.append("name", metadata.name ?? "content");

          const uploadResponse = await fetch("/api/pinata/upload", {
            method: "POST",
            body: formData,
          });

          if (!uploadResponse.ok) {
            throw new Error("Failed to upload image");
          }

          const uploadData = await uploadResponse.json();
          imageUrl = uploadData.ipfsUrl;
        }

        // 2. Upload metadata to IPFS
        const metadataToUpload: ContentMetadata = {
          ...metadata,
          image: imageUrl ?? metadata.image,
        };

        const metadataResponse = await fetch("/api/pinata/content-metadata", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(metadataToUpload),
        });

        if (!metadataResponse.ok) {
          throw new Error("Failed to upload metadata");
        }

        const metadataData = await metadataResponse.json();
        const tokenUri = metadataData.ipfsUrl;

        // 3. Call Content.create()
        setState("pending");

        writeContract({
          address: contentAddress,
          abi: CONTENT_ABI,
          functionName: "create",
          args: [creatorAddress, tokenUri],
          chainId: DEFAULT_CHAIN_ID,
        });
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to create content"));
        setState("error");
      }
    },
    [writeContract]
  );

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
    resetWrite();
  }, [resetWrite]);

  return {
    createContent,
    state,
    error,
    reset,
  };
}
