// Persistent image cache backed by IndexedDB (Dexie). Lets cover/avatar
// images render instantly on refresh — including fully offline — by storing
// the raw blob keyed by its remote URL.
import { useEffect, useState } from "react";
import { db, isBrowser } from "@/lib/db/schema";

const memUrlCache = new Map<string, string>(); // remote URL -> object URL
const inflight = new Map<string, Promise<string | null>>();

function isDataUrl(src: string): boolean {
  return src.startsWith("data:");
}
function isBlobUrl(src: string): boolean {
  return src.startsWith("blob:");
}

/** Store a blob for a remote URL so it can be served offline later. */
export async function primeImageCache(url: string, blob: Blob): Promise<void> {
  if (!isBrowser() || !url || isDataUrl(url) || isBlobUrl(url)) return;
  try {
    await db().image_blobs.put({ url, blob, cached_at: Date.now() });
    // Refresh any live object URL for this key.
    const prev = memUrlCache.get(url);
    if (prev) URL.revokeObjectURL(prev);
    memUrlCache.set(url, URL.createObjectURL(blob));
  } catch {
    /* ignore */
  }
}

async function resolveFromCache(url: string): Promise<string | null> {
  const hit = memUrlCache.get(url);
  if (hit) return hit;
  try {
    const row = await db().image_blobs.get(url);
    if (!row) return null;
    const obj = URL.createObjectURL(row.blob);
    memUrlCache.set(url, obj);
    return obj;
  } catch {
    return null;
  }
}

async function fetchAndCache(url: string): Promise<string | null> {
  if (inflight.has(url)) return inflight.get(url)!;
  const p = (async () => {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) return null;
      const blob = await res.blob();
      await primeImageCache(url, blob);
      return memUrlCache.get(url) ?? null;
    } catch {
      return null;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

/**
 * Resolve `src` for an <img>: returns a local blob/data URL when possible so
 * the image is instant and works offline. Falls back to the remote URL while
 * the cache warms up.
 */
export function useCachedImage(src: string | undefined | null): string {
  const initial = !src
    ? ""
    : isDataUrl(src) || isBlobUrl(src)
      ? src
      : memUrlCache.get(src) ?? src;
  const [resolved, setResolved] = useState<string>(initial);

  useEffect(() => {
    if (!src || isDataUrl(src) || isBlobUrl(src)) {
      setResolved(src ?? "");
      return;
    }
    let cancelled = false;
    (async () => {
      const cached = await resolveFromCache(src);
      if (cancelled) return;
      if (cached) {
        setResolved(cached);
        return;
      }
      setResolved(src);
      const fetched = await fetchAndCache(src);
      if (!cancelled && fetched) setResolved(fetched);
    })();
    return () => { cancelled = true; };
  }, [src]);

  return resolved;
}
