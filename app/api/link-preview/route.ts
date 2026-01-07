import { NextRequest, NextResponse } from "next/server";

// Simple in-memory cache for link previews
const cache = new Map<string, { data: LinkPreview; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

type LinkPreview = {
  title?: string;
  description?: string;
  image?: string;
  url: string;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Check cache
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    // Fetch the page
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ContentEngineBot/1.0; +https://example.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch URL" },
        { status: 500 }
      );
    }

    const html = await response.text();

    // Parse Open Graph and meta tags
    const preview: LinkPreview = {
      url: parsedUrl.href,
    };

    // Extract og:title or title
    const ogTitleMatch = html.match(
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
    );
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    preview.title = ogTitleMatch?.[1] || titleMatch?.[1] || undefined;

    // Extract og:description or meta description
    const ogDescMatch = html.match(
      /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i
    );
    const descMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
    );
    preview.description = ogDescMatch?.[1] || descMatch?.[1] || undefined;

    // Extract og:image
    const ogImageMatch = html.match(
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
    );
    if (ogImageMatch?.[1]) {
      // Make relative URLs absolute
      try {
        preview.image = new URL(ogImageMatch[1], parsedUrl.origin).href;
      } catch {
        preview.image = ogImageMatch[1];
      }
    }

    // Cache the result
    cache.set(url, { data: preview, timestamp: Date.now() });

    // Clean up old cache entries periodically
    if (cache.size > 100) {
      const now = Date.now();
      for (const [key, value] of cache) {
        if (now - value.timestamp > CACHE_TTL) {
          cache.delete(key);
        }
      }
    }

    return NextResponse.json(preview);
  } catch (error) {
    console.error("Link preview error:", error);
    return NextResponse.json(
      { error: "Failed to generate preview" },
      { status: 500 }
    );
  }
}
