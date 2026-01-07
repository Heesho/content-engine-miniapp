import { NextRequest, NextResponse } from "next/server";
import type { ContentMetadata } from "@/lib/contracts";

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://glazecorp.mypinata.cloud";
const PINATA_GATEWAY_KEY = process.env.NEXT_PUBLIC_PINATA_GATEWAY_KEY || "";

export async function POST(request: NextRequest) {
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    return NextResponse.json(
      { error: "Pinata API keys not configured" },
      { status: 500 }
    );
  }

  try {
    const body: ContentMetadata = await request.json();
    const { contentType, name, description, image, text, link, linkPreview } = body;

    if (!contentType) {
      return NextResponse.json(
        { error: "contentType is required" },
        { status: 400 }
      );
    }

    // Validate based on content type
    if (contentType === "image" && !image) {
      return NextResponse.json(
        { error: "image URL is required for image content" },
        { status: 400 }
      );
    }
    if (contentType === "text" && !text) {
      return NextResponse.json(
        { error: "text is required for text content" },
        { status: 400 }
      );
    }
    if (contentType === "link" && !link) {
      return NextResponse.json(
        { error: "link is required for link content" },
        { status: 400 }
      );
    }

    // Create metadata JSON
    const metadata: ContentMetadata = {
      contentType,
      name: name || undefined,
      description: description || undefined,
      image: image || undefined,
      text: text || undefined,
      link: link || undefined,
      linkPreview: linkPreview || undefined,
    };

    // Convert to blob
    const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], {
      type: "application/json",
    });

    // Generate filename with timestamp
    const timestamp = Date.now();
    const fileName = `content-${contentType}-${timestamp}.json`;

    // Create form data for Pinata
    const pinataFormData = new FormData();
    pinataFormData.append("file", jsonBlob, fileName);

    // Add Pinata metadata
    const pinataMetadata = {
      name: fileName,
      keyvalues: {
        type: "content-metadata",
        contentType,
      },
    };
    pinataFormData.append("pinataMetadata", JSON.stringify(pinataMetadata));

    // Pin options
    const options = {
      cidVersion: 1,
    };
    pinataFormData.append("pinataOptions", JSON.stringify(options));

    console.log("Uploading content metadata to Pinata:", fileName);

    // Upload using legacy pinning API
    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
      body: pinataFormData,
    });

    const responseText = await response.text();
    console.log("Pinata response status:", response.status);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Pinata error: ${responseText}` },
        { status: 500 }
      );
    }

    const data = JSON.parse(responseText);
    const cid = data.IpfsHash;

    if (!cid) {
      return NextResponse.json(
        { error: "No CID returned from Pinata" },
        { status: 500 }
      );
    }

    const ipfsUrl = `ipfs://${cid}`;
    const baseGatewayUrl = `${PINATA_GATEWAY}/ipfs/${cid}`;
    const gatewayUrl = PINATA_GATEWAY_KEY
      ? `${baseGatewayUrl}?pinataGatewayToken=${PINATA_GATEWAY_KEY}`
      : baseGatewayUrl;

    console.log("Content metadata upload successful:", cid);

    return NextResponse.json({
      success: true,
      ipfsHash: cid,
      ipfsUrl,
      gatewayUrl,
    });
  } catch (error) {
    console.error("Content metadata upload error:", error);
    return NextResponse.json(
      { error: `Failed to upload content metadata: ${error}` },
      { status: 500 }
    );
  }
}
