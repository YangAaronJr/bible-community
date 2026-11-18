import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearChapterCache,
  extractVerseText,
  fetchChapter,
  fetchChapterWEB,
  isValidTranslation,
} from "./bible-api";

function createMockSessionStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    key: vi.fn((idx: number) => Array.from(store.keys())[idx] ?? null),
    get length() {
      return store.size;
    },
    _store: store,
  };
}

describe("bible-api", () => {
  let sessionStorageMock: ReturnType<typeof createMockSessionStorage>;

  beforeEach(() => {
    clearChapterCache();
    sessionStorageMock = createMockSessionStorage();
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", sessionStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("isValidTranslation", () => {
    it("accepts supported translations and rejects others", () => {
      expect(isValidTranslation("BSB")).toBe(true);
      expect(isValidTranslation("WEB")).toBe(true);
      expect(isValidTranslation("KJV")).toBe(true);
      expect(isValidTranslation("ASV")).toBe(true);
      expect(isValidTranslation("ESV")).toBe(false);
      expect(isValidTranslation("")).toBe(false);
      expect(isValidTranslation(null)).toBe(false);
    });
  });

  describe("extractVerseText", () => {
    it("extracts strings and { text } objects and normalizes whitespace", () => {
      expect(
        extractVerseText([
          "  In the beginning  ",
          { text: "God created\n\tthe heavens" },
          { noteId: 1 },
          null,
          "and the earth. ",
        ])
      ).toBe("In the beginning God created the heavens and the earth.");
    });
  });

  describe("HelloAO parsing and caching", () => {
    it("parses HelloAO chapter content and caches subsequent reads", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chapter: {
            number: 3,
            content: [
              { type: "heading", content: ["Jesus Teaches Nicodemus"] },
              {
                type: "verse",
                number: 16,
                content: ["For God so loved", { text: " the world," }],
              },
              {
                type: "verse",
                number: 17,
                content: ["For God did not send his Son"],
              },
            ],
          },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const first = await fetchChapter("John", 3, "BSB");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://bible.helloao.org/api/BSB/JHN/3.json"
      );
      expect(first.reference).toBe("John 3");
      expect(first.translation_id).toBe("BSB");
      expect(first.translation_name).toBe("Berean Standard Bible");
      expect(first.verses).toEqual([
        {
          book_id: "JHN",
          book_name: "John",
          chapter: 3,
          verse: 16,
          text: "For God so loved the world,",
        },
        {
          book_id: "JHN",
          book_name: "John",
          chapter: 3,
          verse: 17,
          text: "For God did not send his Son",
        },
      ]);
      expect(first.text).toBe(
        "For God so loved the world, For God did not send his Son"
      );

      const second = await fetchChapter("John", 3, "BSB");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });
  });

  describe("single-chapter book fallback", () => {
    it.each([
      ["Obadiah", 21],
      ["Philemon", 25],
      ["2 John", 13],
      ["3 John", 14],
      ["Jude", 25],
    ])(
      "requests full verse range 1-%i from bible-api.com for %s",
      async (book, verseCount) => {
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce({ ok: false, status: 503 })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              reference: `${book} 1:1-${verseCount}`,
              verses: [
                {
                  book_id: book.toUpperCase(),
                  book_name: book,
                  chapter: 1,
                  verse: 1,
                  text: "Opening verse\n",
                },
              ],
              text: "Opening verse",
              translation_id: "web",
              translation_name: "World English Bible",
            }),
          });
        vi.stubGlobal("fetch", fetchMock);

        const res = await fetchChapterWEB(book, 1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][0]).toBe(
          `https://bible-api.com/${encodeURIComponent(
            `${book} 1:1-${verseCount}`
          )}?translation=web`
        );
        expect(res.verses[0].text).toBe("Opening verse");
        expect(res.translation_id).toBe("WEB");
      }
    );
  });

  describe("fallback cache isolation (#11)", () => {
    it("does not poison BSB cache when HelloAO fails and WEB fallback is served", async () => {
      const fetchMock = vi
        .fn()
        // 1st attempt (BSB): HelloAO fails, bible-api.com WEB fallback succeeds
        .mockResolvedValueOnce({ ok: false, status: 502 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            reference: "Psalms 23",
            verses: [
              {
                book_id: "PSA",
                book_name: "Psalms",
                chapter: 23,
                verse: 1,
                text: "Yahweh is my shepherd",
              },
            ],
            text: "Yahweh is my shepherd",
            translation_id: "web",
            translation_name: "World English Bible",
          }),
        })
        // 2nd attempt (BSB): HelloAO recovers
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            chapter: {
              number: 23,
              content: [
                {
                  type: "verse",
                  number: 1,
                  content: ["The LORD is my shepherd"],
                },
              ],
            },
          }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const fallbackRes = await fetchChapter("Psalms", 23, "BSB");
      expect(fallbackRes.translation_id).toBe("WEB");
      expect(fallbackRes.translation_name).toBe("World English Bible");
      expect(fallbackRes.verses[0].text).toBe("Yahweh is my shepherd");

      // Must cache under WEB, never under BSB
      expect(sessionStorageMock._store.has("bible_v3_bsb_psalms_23")).toBe(
        false
      );
      expect(sessionStorageMock._store.has("bible_v3_web_psalms_23")).toBe(
        true
      );

      // Next BSB request should retry HelloAO and succeed with real BSB text
      const recoveredBsb = await fetchChapter("Psalms", 23, "BSB");
      expect(recoveredBsb.translation_id).toBe("BSB");
      expect(recoveredBsb.translation_name).toBe("Berean Standard Bible");
      expect(recoveredBsb.verses[0].text).toBe("The LORD is my shepherd");
      expect(sessionStorageMock._store.has("bible_v3_bsb_psalms_23")).toBe(
        true
      );
    });

    it("does not poison ASV cache when HelloAO fails and WEB fallback is served", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            reference: "Romans 8",
            verses: [
              {
                book_id: "ROM",
                book_name: "Romans",
                chapter: 8,
                verse: 1,
                text: "There is therefore now no condemnation",
              },
            ],
            text: "There is therefore now no condemnation",
            translation_id: "web",
            translation_name: "World English Bible",
          }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const res = await fetchChapter("Romans", 8, "ASV");
      expect(res.translation_id).toBe("WEB");
      expect(res.translation_name).toBe("World English Bible");
      expect(sessionStorageMock._store.has("bible_v3_asv_romans_8")).toBe(
        false
      );
      expect(sessionStorageMock._store.has("bible_v3_web_romans_8")).toBe(true);
    });

    it("ignores mismatched cached entries in sessionStorage and caches KJV fallback under KJV", async () => {
      sessionStorageMock._store.set(
        "bible_v3_bsb_genesis_1",
        JSON.stringify({
          reference: "Genesis 1",
          verses: [
            {
              book_id: "GEN",
              book_name: "Genesis",
              chapter: 1,
              verse: 1,
              text: "Stale WEB text",
            },
          ],
          text: "Stale WEB text",
          translation_id: "WEB",
          translation_name: "World English Bible",
        })
      );

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            chapter: {
              number: 1,
              content: [
                {
                  type: "verse",
                  number: 1,
                  content: ["In the beginning God created the heavens and the earth."],
                },
              ],
            },
          }),
        })
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            reference: "Genesis 1",
            verses: [
              {
                book_id: "GEN",
                book_name: "Genesis",
                chapter: 1,
                verse: 1,
                text: "In the beginning God created the heaven and the earth.",
              },
            ],
            text: "In the beginning God created the heaven and the earth.",
            translation_id: "kjv",
            translation_name: "King James Version",
          }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const bsbRes = await fetchChapter("Genesis", 1, "BSB");
      expect(bsbRes.translation_id).toBe("BSB");
      expect(bsbRes.verses[0].text).toBe(
        "In the beginning God created the heavens and the earth."
      );

      const kjvRes = await fetchChapter("Genesis", 1, "KJV");
      expect(kjvRes.translation_id).toBe("KJV");
      expect(kjvRes.translation_name).toBe("King James Version");
      expect(sessionStorageMock._store.has("bible_v3_kjv_genesis_1")).toBe(
        true
      );
    });
  });
});
