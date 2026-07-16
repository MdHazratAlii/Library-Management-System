export type LibrarySettings = {
  fineRate: number;
  instituteName: string;
  libraryName: string;
  logoUrl: string;
  address: string;
  maxIssuesPerStudent: number;
};

const KEY = "lp-library-settings";

export const DEFAULT_SETTINGS: LibrarySettings = {
  fineRate: 5,
  instituteName: "",
  libraryName: "Library Pro",
  logoUrl: "",
  address: "",
  maxIssuesPerStudent: 3,
};

export function getSettings(): LibrarySettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<LibrarySettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      fineRate: Number(parsed.fineRate) > 0 ? Number(parsed.fineRate) : DEFAULT_SETTINGS.fineRate,
      maxIssuesPerStudent:
        Number(parsed.maxIssuesPerStudent) > 0
          ? Math.floor(Number(parsed.maxIssuesPerStudent))
          : DEFAULT_SETTINGS.maxIssuesPerStudent,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: LibrarySettings) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("lp-settings-change"));
}

/** Convert an image URL to a data URL for embedding in PDFs. Fails silently. */
export async function loadLogoDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}