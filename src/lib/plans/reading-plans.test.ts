import { describe, expect, it } from "vitest";
import {
  BIBLE_BOOKS,
  BIBLE_MOVEMENTS,
  chapterKey,
  combineDailyReadings,
  encodeSharedCustomPlan,
  getActivePlanBooks,
  getNextUnreadChapters,
  getSharedPlanTitle,
  isRestDay,
  parseSharedPlan,
  READING_PLAN_PRESETS,
  resolveTrackSequence,
  resolveUnifiedPlanSequence,
} from "./reading-plans";

describe("reading-plans", () => {
  it("contains all 66 canonical books (39 OT, 27 NT)", () => {
    expect(BIBLE_BOOKS).toHaveLength(66);
    expect(BIBLE_BOOKS.filter((b) => b.testament === "OT")).toHaveLength(39);
    expect(BIBLE_BOOKS.filter((b) => b.testament === "NT")).toHaveLength(27);
  });

  describe("READING_PLAN_PRESETS", () => {
    it("builds the nt-90 preset with 260 chapters in canonical order", () => {
      const nt90 = READING_PLAN_PRESETS.find((p) => p.id === "nt-90");
      expect(nt90).toBeDefined();
      expect(nt90!.dailyTargetCount).toBe(3);
      expect(nt90!.sequence).toHaveLength(260);
      expect(nt90!.sequence[0]).toEqual({ book: "Matthew", chapter: 1 });
      expect(nt90!.sequence[nt90!.sequence.length - 1]).toEqual({
        book: "Revelation",
        chapter: 22,
      });
    });

    it("builds the gospels-psalms preset interleaving Gospels (89) and Psalms (150)", () => {
      const gp = READING_PLAN_PRESETS.find((p) => p.id === "gospels-psalms");
      expect(gp).toBeDefined();
      expect(gp!.dailyTargetCount).toBe(2);
      expect(gp!.sequence).toHaveLength(239);
      expect(gp!.sequence.slice(0, 4)).toEqual([
        { book: "Matthew", chapter: 1 },
        { book: "Psalms", chapter: 1 },
        { book: "Matthew", chapter: 2 },
        { book: "Psalms", chapter: 2 },
      ]);
      expect(gp!.sequence[gp!.sequence.length - 1]).toEqual({
        book: "Psalms",
        chapter: 150,
      });
    });
  });

  describe("resolveTrackSequence", () => {
    it("expands OT, NT, Gospels, PsalmsProverbs, and single-book tracks", () => {
      const ot = resolveTrackSequence("OT");
      expect(ot).toHaveLength(929);
      expect(ot[0]).toEqual({ book: "Genesis", chapter: 1 });
      expect(ot[ot.length - 1]).toEqual({ book: "Malachi", chapter: 4 });

      const nt = resolveTrackSequence("NT");
      expect(nt).toHaveLength(260);

      const gospels = resolveTrackSequence("Gospels");
      expect(gospels).toHaveLength(89);
      expect(gospels[0]).toEqual({ book: "Matthew", chapter: 1 });
      expect(gospels[gospels.length - 1]).toEqual({ book: "John", chapter: 21 });

      const psalmsProverbs = resolveTrackSequence("PsalmsProverbs");
      expect(psalmsProverbs).toHaveLength(181);
      expect(psalmsProverbs[0]).toEqual({ book: "Psalms", chapter: 1 });
      expect(psalmsProverbs[psalmsProverbs.length - 1]).toEqual({
        book: "Proverbs",
        chapter: 31,
      });

      const romans = resolveTrackSequence("Romans");
      expect(romans).toHaveLength(16);
      expect(romans[15]).toEqual({ book: "Romans", chapter: 16 });

      expect(resolveTrackSequence("NonExistentBook")).toEqual([]);

      const multi = resolveTrackSequence("Romans, Galatians, Ephesians");
      expect(multi).toHaveLength(16 + 6 + 6);
      expect(multi[0]).toEqual({ book: "Romans", chapter: 1 });
      expect(multi[multi.length - 1]).toEqual({ book: "Ephesians", chapter: 6 });
    });
  });

  describe("shared custom plan encoding & parsing", () => {
    it("encodes and parses a shared custom plan and resolves its title", () => {
      const encoded = encodeSharedCustomPlan({
        title: "Epistles Study",
        books: ["Romans", "Galatians"],
        chaptersPerDay: 2,
        restDays: [0],
      });
      const parsed = parseSharedPlan(encoded);
      expect(parsed).toEqual({
        kind: "custom",
        custom: {
          title: "Epistles Study",
          books: ["Romans", "Galatians"],
          chaptersPerDay: 2,
          restDays: [0],
        },
      });
      expect(getSharedPlanTitle(encoded)).toBe("Epistles Study");
      expect(getSharedPlanTitle("nt-90")).toBe("New Testament in 90 Days");
      expect(parseSharedPlan(null)).toBeNull();
    });
  });

  describe("chapterKey", () => {
    it("formats canonical book::chapter keys", () => {
      expect(chapterKey("Psalms", 23)).toBe("Psalms::23");
      expect(chapterKey("1 John", 4)).toBe("1 John::4");
    });
  });

  describe("unified plan & Journey helpers", () => {
    it("covers all 66 books across BIBLE_MOVEMENTS", () => {
      const movementBooks = BIBLE_MOVEMENTS.flatMap((m) => m.books);
      expect(movementBooks).toHaveLength(66);
      expect(new Set(movementBooks).size).toBe(66);
    });

    it("resolves unified plan sequences and next unread chapters", () => {
      const seq = resolveUnifiedPlanSequence({
        presetId: null,
        books: ["Jude", "Philemon"],
      });
      expect(seq).toEqual([
        { book: "Jude", chapter: 1 },
        { book: "Philemon", chapter: 1 },
      ]);

      const completed = new Set(["Jude::1"]);
      expect(getNextUnreadChapters(seq, completed, 1)).toEqual([
        { book: "Philemon", chapter: 1 },
      ]);
      expect(
        getNextUnreadChapters(seq, new Set(["Jude::1", "Philemon::1"]), 1)
      ).toEqual([{ book: "Jude", chapter: 1 }]);
    });

    it("collects active plan books and checks Sabbath rest days", () => {
      const books = getActivePlanBooks([
        { presetId: "gospels-psalms", books: [] },
        { presetId: null, books: ["Romans"] },
      ]);
      expect(books.has("Matthew")).toBe(true);
      expect(books.has("Psalms")).toBe(true);
      expect(books.has("Romans")).toBe(true);
      expect(books.has("Genesis")).toBe(false);

      const sunday = new Date("2026-11-15T12:00:00Z"); // Sunday = 0
      expect(isRestDay([0], sunday)).toBe(true);
      expect(isRestDay([3], sunday)).toBe(false);
    });

    it("combines personal and circle daily readings without duplicates", () => {
      const combined = combineDailyReadings(
        [
          { book: "John", chapter: 1 },
          { book: "Psalms", chapter: 23, timeOfDay: "Morning" },
        ],
        [
          { book: "Psalms", chapter: 23 },
          { book: "Romans", chapter: 8 },
        ],
        "Oak Fellowship"
      );

      expect(combined).toEqual([
        { book: "John", chapter: 1, source: "personal" },
        {
          book: "Psalms",
          chapter: 23,
          source: "both",
          circleName: "Oak Fellowship",
          timeOfDay: "Morning",
        },
        {
          book: "Romans",
          chapter: 8,
          source: "circle",
          circleName: "Oak Fellowship",
        },
      ]);
    });
  });
});
