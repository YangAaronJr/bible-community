import { describe, expect, it } from "vitest";
import {
  BIBLE_BOOKS,
  chapterKey,
  READING_PLAN_PRESETS,
  resolveTrackSequence,
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
    });
  });

  describe("chapterKey", () => {
    it("formats canonical book::chapter keys", () => {
      expect(chapterKey("Psalms", 23)).toBe("Psalms::23");
      expect(chapterKey("1 John", 4)).toBe("1 John::4");
    });
  });
});
