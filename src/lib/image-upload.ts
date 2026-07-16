import { supabase } from "@/integrations/supabase/client";

const BUCKET = "library-images";
const SIGNED_EXPIRY = 60 * 60 * 24 * 365 * 10; // ~10 years

/** Slug-safe filename fragment from any title. */
export function slugifyTitle(title: string): string {
  return (title || "image")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
}

/** Load a File into an HTMLImageElement. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/** Convert + compress to a WebP Blob, downscaling to max side while preserving aspect. */
async function toCompressedWebP(file: File, maxSide = 1024, quality = 0.82): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not available");
  ctx.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("WebP encoding failed"))),
      "image/webp",
      quality,
    );
  });
}

/**
 * Upload an image file to Supabase Storage as compressed WebP, named after the title.
 * Returns a long-lived signed URL suitable for <img src> and PDF exports.
 */
export async function uploadTitledImage(file: File, title: string, folder: "students" | "books" | "logos"): Promise<string> {
  const webp = await toCompressedWebP(file);
  const slug = slugifyTitle(title);
  const path = `${folder}/${slug}-${Date.now()}.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, webp, {
    contentType: "image/webp",
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_EXPIRY);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("Failed to sign uploaded image URL");
  return data.signedUrl;
}