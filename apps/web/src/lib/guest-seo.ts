import type { Metadata } from "next";

/** Paylaşım kartları — görsel yoksa büyük kart yerine özet kartı. */
export function guestShareMeta({
  title,
  description,
  imageUrl,
}: {
  title: string;
  description?: string;
  imageUrl?: string | null;
}): Metadata {
  const images = imageUrl ? [{ url: imageUrl }] : undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}
