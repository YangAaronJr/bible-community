export type BibleTranslationId = "BSB" | "WEB" | "KJV" | "ASV";

export interface BibleTranslationMeta {
  id: BibleTranslationId;
  shortLabel: string;
  name: string;
  helloaoId: string;
  bibleApiFallbackId: "web" | "kjv";
}

export const BIBLE_TRANSLATIONS: BibleTranslationMeta[] = [
  {
    id: "BSB",
    shortLabel: "BSB",
    name: "Berean Standard Bible",
    helloaoId: "BSB",
    bibleApiFallbackId: "web",
  },
  {
    id: "WEB",
    shortLabel: "WEB",
    name: "World English Bible",
    helloaoId: "ENGWEBP",
    bibleApiFallbackId: "web",
  },
  {
    id: "KJV",
    shortLabel: "KJV",
    name: "King James Version",
    helloaoId: "eng_kjv",
    bibleApiFallbackId: "kjv",
  },
  {
    id: "ASV",
    shortLabel: "ASV",
    name: "American Standard Version",
    helloaoId: "eng_asv",
    bibleApiFallbackId: "web",
  },
];

export const DEFAULT_TRANSLATION: BibleTranslationId = "BSB";
export const TRANSLATION_STORAGE_KEY = "selah_bible_translation";

export function isValidTranslation(value: string | null): value is BibleTranslationId {
  return (
    value === "BSB" || value === "WEB" || value === "KJV" || value === "ASV"
  );
}

export interface BibleVerse {
  book_id: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface BibleChapterResponse {
  reference: string;
  verses: BibleVerse[];
  text: string;
  translation_id: string;
  translation_name: string;
}

/**
 * bible-api.com interprets "<Book> 1" on single-chapter books as "<Book> 1:1" (only verse 1).
 * Specifying the explicit verse range for the 5 single-chapter books ensures the full chapter is returned.
 */
const SINGLE_CHAPTER_VERSE_COUNTS: Record<string, number> = {
  Obadiah: 21,
  Philemon: 25,
  "2 John": 13,
  "3 John": 14,
  Jude: 25,
};

const BOOK_TO_USFM: Record<string, string> = {
  Genesis: "GEN",
  Exodus: "EXO",
  Leviticus: "LEV",
  Numbers: "NUM",
  Deuteronomy: "DEU",
  Joshua: "JOS",
  Judges: "JDG",
  Ruth: "RUT",
  "1 Samuel": "1SA",
  "2 Samuel": "2SA",
  "1 Kings": "1KI",
  "2 Kings": "2KI",
  "1 Chronicles": "1CH",
  "2 Chronicles": "2CH",
  Ezra: "EZR",
  Nehemiah: "NEH",
  Esther: "EST",
  Job: "JOB",
  Psalms: "PSA",
  Proverbs: "PRO",
  Ecclesiastes: "ECC",
  "Song of Solomon": "SNG",
  Isaiah: "ISA",
  Jeremiah: "JER",
  Lamentations: "LAM",
  Ezekiel: "EZK",
  Daniel: "DAN",
  Hosea: "HOS",
  Joel: "JOL",
  Amos: "AMO",
  Obadiah: "OBA",
  Jonah: "JON",
  Micah: "MIC",
  Nahum: "NAM",
  Habakkuk: "HAB",
  Zephaniah: "ZEP",
  Haggai: "HAG",
  Zechariah: "ZEC",
  Malachi: "MAL",
  Matthew: "MAT",
  Mark: "MRK",
  Luke: "LUK",
  John: "JHN",
  Acts: "ACT",
  Romans: "ROM",
  "1 Corinthians": "1CO",
  "2 Corinthians": "2CO",
  Galatians: "GAL",
  Ephesians: "EPH",
  Philippians: "PHP",
  Colossians: "COL",
  "1 Thessalonians": "1TH",
  "2 Thessalonians": "2TH",
  "1 Timothy": "1TI",
  "2 Timothy": "2TI",
  Titus: "TIT",
  Philemon: "PHM",
  Hebrews: "HEB",
  James: "JAS",
  "1 Peter": "1PE",
  "2 Peter": "2PE",
  "1 John": "1JN",
  "2 John": "2JN",
  "3 John": "3JN",
  Jude: "JUD",
  Revelation: "REV",
};

interface HelloAoVerseItem {
  type?: string;
  number?: number;
  content?: unknown[];
}

interface HelloAoChapterPayload {
  translation?: { id?: string; shortName?: string; name?: string };
  book?: { id?: string; name?: string };
  chapter?: { number?: number; content?: HelloAoVerseItem[] };
}

export function extractVerseText(content: unknown[]): string {
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push(part);
    } else if (part && typeof part === "object") {
      const obj = part as { text?: unknown };
      if (typeof obj.text === "string") {
        parts.push(obj.text);
      }
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

const memoryCache = new Map<string, BibleChapterResponse>();

function buildChapterCacheKey(
  translationId: BibleTranslationId,
  book: string,
  chapter: number
): string {
  return `bible_v3_${translationId.toLowerCase()}_${book.toLowerCase()}_${chapter}`;
}

function getFallbackTranslationMeta(
  fallbackId: BibleTranslationMeta["bibleApiFallbackId"]
): BibleTranslationMeta {
  const targetId: BibleTranslationId = fallbackId === "kjv" ? "KJV" : "WEB";
  return (
    BIBLE_TRANSLATIONS.find((t) => t.id === targetId) || BIBLE_TRANSLATIONS[1]
  );
}

export function clearChapterCache(): void {
  memoryCache.clear();
}

async function fetchFromHelloAo(
  book: string,
  chapter: number,
  meta: BibleTranslationMeta
): Promise<BibleChapterResponse> {
  const usfmId = BOOK_TO_USFM[book];
  if (!usfmId) {
    throw new Error(`Unsupported book mapping for ${book}.`);
  }

  const url = `https://bible.helloao.org/api/${encodeURIComponent(
    meta.helloaoId
  )}/${encodeURIComponent(usfmId)}/${chapter}.json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HelloAO Bible API returned ${response.status}.`);
  }

  const payload = (await response.json()) as HelloAoChapterPayload;
  const content = payload?.chapter?.content;
  if (!Array.isArray(content)) {
    throw new Error(`Unexpected HelloAO format for ${book} ${chapter}.`);
  }

  const verses: BibleVerse[] = [];
  for (const item of content) {
    if (item.type === "verse" && typeof item.number === "number" && Array.isArray(item.content)) {
      const text = extractVerseText(item.content);
      if (text) {
        verses.push({
          book_id: usfmId,
          book_name: book,
          chapter,
          verse: item.number,
          text,
        });
      }
    }
  }

  if (verses.length === 0) {
    throw new Error(`No verses found for ${book} ${chapter}.`);
  }

  return {
    reference: `${book} ${chapter}`,
    verses,
    text: verses.map((v) => v.text).join(" "),
    translation_id: meta.id,
    translation_name: meta.name,
  };
}

async function fetchFromBibleApiFallback(
  book: string,
  chapter: number,
  meta: BibleTranslationMeta
): Promise<{ data: BibleChapterResponse; servedMeta: BibleTranslationMeta }> {
  const singleChapterMax = SINGLE_CHAPTER_VERSE_COUNTS[book];
  const queryRef = singleChapterMax
    ? `${book} 1:1-${singleChapterMax}`
    : `${book} ${chapter}`;

  const url = `https://bible-api.com/${encodeURIComponent(
    queryRef
  )}?translation=${meta.bibleApiFallbackId}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Could not load ${book} ${chapter} from Bible API (${response.status}).`
    );
  }

  const data = (await response.json()) as BibleChapterResponse;
  if (!data || !Array.isArray(data.verses)) {
    throw new Error(`Unexpected response format for ${book} ${chapter}.`);
  }

  const servedMeta = getFallbackTranslationMeta(meta.bibleApiFallbackId);
  const verses = data.verses.map((v) => ({
    ...v,
    text: v.text.replace(/\s+/g, " ").trim(),
  }));

  return {
    data: {
      ...data,
      verses,
      translation_id: servedMeta.id,
      translation_name: servedMeta.name,
    },
    servedMeta,
  };
}

export async function fetchChapter(
  book: string,
  chapter: number,
  translation: BibleTranslationId = DEFAULT_TRANSLATION
): Promise<BibleChapterResponse> {
  const meta =
    BIBLE_TRANSLATIONS.find((t) => t.id === translation) ||
    BIBLE_TRANSLATIONS[0];
  const cacheKey = buildChapterCacheKey(meta.id, book, chapter);

  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }

  if (typeof window !== "undefined") {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as BibleChapterResponse;
        const matchesTranslation =
          !parsed?.translation_id ||
          parsed.translation_id.toUpperCase() === meta.id;
        if (
          parsed &&
          matchesTranslation &&
          Array.isArray(parsed.verses) &&
          parsed.verses.length > 0
        ) {
          memoryCache.set(cacheKey, parsed);
          return parsed;
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  let data: BibleChapterResponse;
  let servedCacheKey = cacheKey;
  try {
    data = await fetchFromHelloAo(book, chapter, meta);
  } catch {
    const fallback = await fetchFromBibleApiFallback(book, chapter, meta);
    data = fallback.data;
    // Cache fallback under the translation actually served (e.g. WEB) so
    // transient HelloAO outages never poison BSB/ASV cache keys.
    servedCacheKey = buildChapterCacheKey(fallback.servedMeta.id, book, chapter);
  }

  memoryCache.set(servedCacheKey, data);

  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(servedCacheKey, JSON.stringify(data));
    } catch {
      // Ignore quota errors
    }
  }

  return data;
}

export async function fetchChapterWEB(
  book: string,
  chapter: number
): Promise<BibleChapterResponse> {
  return fetchChapter(book, chapter, "WEB");
}
