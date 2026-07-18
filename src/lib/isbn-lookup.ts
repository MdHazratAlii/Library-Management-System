export type IsbnBook = {
  title?: string;
  author?: string;
  pub_year?: number;
  cover_url?: string;
};

export function normalizeIsbn(raw: string): string {
  return (raw || "").replace(/[-\s]/g, "").trim();
}

export function isValidIsbn(raw: string): boolean {
  const s = normalizeIsbn(raw);
  return /^(?:\d{9}[\dXx]|\d{13})$/.test(s);
}

const CACHE_KEY = "isbn-lookup-cache-v1";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type CacheEntry = { at: number; book: IsbnBook };
const memCache = new Map<string, Promise<IsbnBook>>();

function loadDisk(): Record<string, CacheEntry> {
  if (typeof localStorage === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
}
function saveDisk(data: Record<string, CacheEntry>) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
}
function getCached(isbn: string): IsbnBook | null {
  const disk = loadDisk();
  const e = disk[isbn];
  if (!e) return null;
  if (Date.now() - e.at > CACHE_TTL_MS) {
    delete disk[isbn];
    saveDisk(disk);
    return null;
  }
  return e.book;
}
function setCached(isbn: string, book: IsbnBook) {
  const disk = loadDisk();
  disk[isbn] = { at: Date.now(), book };
  saveDisk(disk);
}

export function clearIsbnCache() {
  memCache.clear();
  if (typeof localStorage !== "undefined") localStorage.removeItem(CACHE_KEY);
}

function yearFrom(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  const m = String(dateStr).match(/\d{4}/);
  return m ? Number(m[0]) : undefined;
}

async function fetchGoogle(isbn: string): Promise<IsbnBook | null> {
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
  if (!res.ok) return null;
  const json = await res.json();
  const v = json?.items?.[0]?.volumeInfo;
  if (!v) return null;
  const img = v.imageLinks || {};
  const cover = img.extraLarge || img.large || img.medium || img.small || img.thumbnail || img.smallThumbnail;
  return {
    title: v.title,
    author: Array.isArray(v.authors) ? v.authors.join(", ") : undefined,
    pub_year: yearFrom(v.publishedDate),
    cover_url: cover ? String(cover).replace(/^http:/, "https:") : undefined,
  };
}

async function fetchOpenLibrary(isbn: string): Promise<IsbnBook | null> {
  const key = `ISBN:${isbn}`;
  const res = await fetch(`https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(key)}&format=json&jscmd=data`);
  if (!res.ok) return null;
  const json = await res.json();
  const v = json?.[key];
  if (!v) return null;
  return {
    title: v.title,
    author: Array.isArray(v.authors) ? v.authors.map((a: { name: string }) => a.name).filter(Boolean).join(", ") : undefined,
    pub_year: yearFrom(v.publish_date),
    cover_url: v.cover?.large || v.cover?.medium || v.cover?.small,
  };
}

export async function lookupIsbn(raw: string): Promise<IsbnBook> {
  const isbn = normalizeIsbn(raw);
  if (!isValidIsbn(isbn)) throw new Error("Invalid ISBN");

  const cached = getCached(isbn);
  if (cached) return cached;

  const inFlight = memCache.get(isbn);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const g = await fetchGoogle(isbn);
      if (g && (g.title || g.author || g.cover_url)) { setCached(isbn, g); return g; }
    } catch { /* fall through */ }
    const o = await fetchOpenLibrary(isbn);
    if (o && (o.title || o.author || o.cover_url)) { setCached(isbn, o); return o; }
    throw new Error("Book not found");
  })();

  memCache.set(isbn, promise);
  try { return await promise; } finally { memCache.delete(isbn); }
}