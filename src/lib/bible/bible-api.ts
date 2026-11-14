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

const memoryCache = new Map<string, BibleChapterResponse>();

export async function fetchChapterWEB(
  book: string,
  chapter: number
): Promise<BibleChapterResponse> {
  const cacheKey = `web_bible_v2_${book.toLowerCase()}_${chapter}`;

  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }

  if (typeof window !== "undefined") {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as BibleChapterResponse;
        if (parsed && Array.isArray(parsed.verses) && parsed.verses.length > 0) {
          memoryCache.set(cacheKey, parsed);
          return parsed;
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  const singleChapterMax = SINGLE_CHAPTER_VERSE_COUNTS[book];
  const queryRef = singleChapterMax
    ? `${book} 1:1-${singleChapterMax}`
    : `${book} ${chapter}`;

  const url = `https://bible-api.com/${encodeURIComponent(
    queryRef
  )}?translation=web`;

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

  // Clean up whitespace in verse text while preserving line breaks
  data.verses = data.verses.map((v) => ({
    ...v,
    text: v.text.replace(/\s+/g, " ").trim(),
  }));

  memoryCache.set(cacheKey, data);

  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
    } catch {
      // Ignore quota errors
    }
  }

  return data;
}
