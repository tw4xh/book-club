/**
 * Look up book metadata by ISBN so members barely have to type anything.
 *
 * Uses free, key-less sources first: Google Books, then Open Library. If both
 * miss and TANSHU_API_KEY is configured, it falls back to Tanshu API for better
 * Chinese book coverage. Returns null if nothing is found.
 */

export interface BookMeta {
  isbn: string;
  title: string | null;
  authors: string[];
  language: string | null; // raw code, e.g. "zh", "en"
  categories: string[];
  cover_url: string | null;
  publisher: string | null;
  published_year: string | null;
  source: "google" | "openlibrary" | "tanshu";
}

/** Strip to a clean 10- or 13-char ISBN, or null if it doesn't look valid. */
export function normalizeIsbn(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (cleaned.length === 10 || cleaned.length === 13) return cleaned;
  return null;
}

function forceHttps(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace(/^http:/, "https:");
}

/** Turn a Google Books thumbnail into a stable https URL. */
function cleanGoogleCover(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace(/^http:/, "https:").replace(/&edge=curl/, "");
}

async function fetchGoogle(isbn: string): Promise<BookMeta | null> {
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    totalItems?: number;
    items?: Array<{
      volumeInfo?: {
        title?: string;
        subtitle?: string;
        authors?: string[];
        language?: string;
        categories?: string[];
        publisher?: string;
        publishedDate?: string;
        imageLinks?: { thumbnail?: string; smallThumbnail?: string };
      };
    }>;
  };
  const info = data.items?.[0]?.volumeInfo;
  if (!info) return null;
  return {
    isbn,
    title: info.title
      ? info.subtitle
        ? `${info.title}: ${info.subtitle}`
        : info.title
      : null,
    authors: info.authors ?? [],
    language: info.language ?? null,
    categories: info.categories ?? [],
    cover_url:
      cleanGoogleCover(info.imageLinks?.thumbnail) ??
      cleanGoogleCover(info.imageLinks?.smallThumbnail),
    publisher: info.publisher ?? null,
    published_year: info.publishedDate?.slice(0, 4) ?? null,
    source: "google",
  };
}

async function fetchOpenLibrary(isbn: string): Promise<BookMeta | null> {
  const res = await fetch(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as Record<
    string,
    {
      title?: string;
      authors?: Array<{ name?: string }>;
      cover?: { small?: string; medium?: string; large?: string };
      publishers?: Array<{ name?: string }>;
      publish_date?: string;
      subjects?: Array<{ name?: string }>;
    }
  >;
  const entry = data[`ISBN:${isbn}`];
  if (!entry) return null;
  const yearMatch = entry.publish_date?.match(/\d{4}/);
  return {
    isbn,
    title: entry.title ?? null,
    authors: (entry.authors ?? []).map((a) => a.name ?? "").filter(Boolean),
    language: null,
    categories: (entry.subjects ?? [])
      .map((s) => s.name ?? "")
      .filter(Boolean)
      .slice(0, 1),
    cover_url: forceHttps(
      entry.cover?.medium ?? entry.cover?.large ?? entry.cover?.small
    ),
    publisher: entry.publishers?.[0]?.name ?? null,
    published_year: yearMatch ? yearMatch[0] : null,
    source: "openlibrary",
  };
}

async function fetchTanshu(isbn: string): Promise<BookMeta | null> {
  const key = process.env.TANSHU_API_KEY;
  if (!key) return null;

  const url = new URL("https://api2.tanshuapi.com/api/isbn_base/v1/index");
  url.searchParams.set("key", key);
  url.searchParams.set("isbn", isbn);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    code?: number;
    msg?: string;
    data?: {
      title?: string;
      img?: string;
      author?: string;
      isbn?: string;
      publisher?: string;
      pubdate?: string;
      summary?: string;
    };
  };
  if (data.code !== 1 || !data.data?.title) return null;

  const info = data.data;
  return {
    isbn: info.isbn ?? isbn,
    title: info.title ?? null,
    authors: info.author ? [info.author] : [],
    // Tanshu's endpoint does not return a language code; most configured use is Chinese ISBN lookup.
    language: "zh",
    categories: [],
    cover_url: forceHttps(info.img),
    publisher: info.publisher ?? null,
    published_year: info.pubdate?.match(/\d{4}/)?.[0] ?? null,
    source: "tanshu",
  };
}

export async function lookupIsbn(
  rawIsbn: string | null | undefined
): Promise<BookMeta | null> {
  const isbn = normalizeIsbn(rawIsbn);
  if (!isbn) return null;

  try {
    const google = await fetchGoogle(isbn);
    if (google && google.title) {
      // Backfill a cover from Open Library if Google didn't have one.
      if (!google.cover_url) {
        const ol = await fetchOpenLibrary(isbn).catch(() => null);
        if (ol?.cover_url) google.cover_url = ol.cover_url;
      }
      return google;
    }
  } catch {
    // fall through to Open Library
  }

  try {
    const openLibrary = await fetchOpenLibrary(isbn);
    if (openLibrary && openLibrary.title) return openLibrary;
  } catch {
    // fall through to Tanshu if configured
  }

  try {
    return await fetchTanshu(isbn);
  } catch {
    return null;
  }
}
