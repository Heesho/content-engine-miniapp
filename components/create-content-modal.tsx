"use client";

import { useState, useCallback, useRef } from "react";
import { X, Image, FileText, Link2, Upload, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreateContent } from "@/hooks/useCreateContent";
import type { ContentMetadata } from "@/lib/contracts";

type ContentType = "image" | "text" | "link";

type CreateContentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  contentAddress: `0x${string}`;
  userAddress: `0x${string}`;
  onSuccess?: () => void;
};

export function CreateContentModal({
  isOpen,
  onClose,
  contentAddress,
  userAddress,
  onSuccess,
}: CreateContentModalProps) {
  const [contentType, setContentType] = useState<ContentType>("image");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [textContent, setTextContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPreview, setLinkPreview] = useState<{
    title?: string;
    description?: string;
    image?: string;
  } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { createContent, state, error, reset } = useCreateContent();

  // Handle image selection
  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file");
        return;
      }

      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert("Image must be less than 5MB");
        return;
      }

      setImageFile(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    },
    []
  );

  // Handle link preview fetch
  const fetchLinkPreview = useCallback(async (url: string) => {
    if (!url) {
      setLinkPreview(null);
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setLinkPreview(null);
      return;
    }

    setIsLoadingPreview(true);
    try {
      const response = await fetch(
        `/api/link-preview?url=${encodeURIComponent(url)}`
      );
      if (response.ok) {
        const data = await response.json();
        setLinkPreview(data);
      } else {
        setLinkPreview(null);
      }
    } catch {
      setLinkPreview(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    // Build metadata based on content type
    const metadata: ContentMetadata = {
      description: description || undefined,
      contentType,
    };

    if (contentType === "image") {
      if (!imageFile) {
        alert("Please select an image");
        return;
      }
      // Image URL will be set after upload
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
      if (linkPreview) {
        metadata.linkPreview = linkPreview;
      }
    }

    await createContent(
      contentAddress,
      userAddress,
      metadata,
      contentType === "image" ? imageFile ?? undefined : undefined
    );
  }, [
    contentType,
    description,
    imageFile,
    textContent,
    linkUrl,
    linkPreview,
    contentAddress,
    userAddress,
    createContent,
  ]);

  // Handle close
  const handleClose = useCallback(() => {
    if (state === "pending" || state === "confirming" || state === "uploading") {
      return; // Don't close while in progress
    }
    reset();
    setContentType("image");
    setDescription("");
    setImageFile(null);
    setImagePreview(null);
    setTextContent("");
    setLinkUrl("");
    setLinkPreview(null);
    onClose();
  }, [state, reset, onClose]);

  // Handle success
  if (state === "success") {
    setTimeout(() => {
      handleClose();
      onSuccess?.();
    }, 1500);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-zinc-900 rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-white">Create Content</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content type selector */}
        <div className="p-4 border-b border-zinc-800">
          <div className="flex gap-2">
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
                    ? "bg-purple-600 text-white"
                    : "bg-zinc-800 text-gray-400 hover:bg-zinc-700"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content input */}
        <div className="p-4 space-y-4">
          {/* Image input */}
          {contentType === "image" && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              {imagePreview ? (
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
                  className="w-full aspect-video bg-zinc-800 rounded-lg border-2 border-dashed border-zinc-700 hover:border-purple-500 transition-colors flex flex-col items-center justify-center gap-2"
                >
                  <Upload className="w-8 h-8 text-gray-500" />
                  <span className="text-gray-500">
                    Click to upload an image
                  </span>
                  <span className="text-gray-600 text-sm">Max 5MB</span>
                </button>
              )}
            </div>
          )}

          {/* Text input */}
          {contentType === "text" && (
            <div>
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="What's on your mind?"
                className="w-full h-48 bg-zinc-800 rounded-lg p-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                maxLength={2000}
              />
              <div className="text-right text-sm text-gray-500 mt-1">
                {textContent.length}/2000
              </div>
            </div>
          )}

          {/* Link input */}
          {contentType === "link" && (
            <div className="space-y-3">
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  fetchLinkPreview(e.target.value);
                }}
                placeholder="https://example.com"
                className="w-full bg-zinc-800 rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {isLoadingPreview && (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading preview...
                </div>
              )}
              {linkPreview && (
                <div className="bg-zinc-800 rounded-lg overflow-hidden">
                  {linkPreview.image && (
                    <img
                      src={linkPreview.image}
                      alt=""
                      className="w-full aspect-video object-cover"
                    />
                  )}
                  <div className="p-3">
                    {linkPreview.title && (
                      <h4 className="font-medium text-white">
                        {linkPreview.title}
                      </h4>
                    )}
                    {linkPreview.description && (
                      <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                        {linkPreview.description}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Description (optional) */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              className="w-full bg-zinc-800 rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              maxLength={280}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error.message}
            </div>
          )}

          {/* Success message */}
          {state === "success" && (
            <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-lg text-green-400 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Content created successfully!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 p-4">
          <button
            onClick={handleSubmit}
            disabled={
              state === "uploading" ||
              state === "pending" ||
              state === "confirming" ||
              state === "success"
            }
            className={cn(
              "w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2",
              state === "uploading" ||
              state === "pending" ||
              state === "confirming" ||
              state === "success"
                ? "bg-zinc-700 text-gray-400 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-500 text-white"
            )}
          >
            {state === "uploading" && (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Uploading...
              </>
            )}
            {state === "pending" && (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Confirm in wallet...
              </>
            )}
            {state === "confirming" && (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating...
              </>
            )}
            {state === "success" && (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Created!
              </>
            )}
            {(state === "idle" || state === "error") && "Create Content"}
          </button>
        </div>
      </div>
    </div>
  );
}
