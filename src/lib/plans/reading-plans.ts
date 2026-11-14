export interface BibleBook {
  name: string;
  chapters: number;
  testament: "OT" | "NT";
}

export interface ChapterRef {
  book: string;
  chapter: number;
}

export interface ReadingPlanPreset {
  id: "nt-90" | "gospels-psalms";
  title: string;
  subtitle: string;
  description: string;
  dailyTargetCount: number;
  sequence: ChapterRef[];
}

export const BIBLE_BOOKS: BibleBook[] = [
  // Old Testament (39)
  { name: "Genesis", chapters: 50, testament: "OT" },
  { name: "Exodus", chapters: 40, testament: "OT" },
  { name: "Leviticus", chapters: 27, testament: "OT" },
  { name: "Numbers", chapters: 36, testament: "OT" },
  { name: "Deuteronomy", chapters: 34, testament: "OT" },
  { name: "Joshua", chapters: 24, testament: "OT" },
  { name: "Judges", chapters: 21, testament: "OT" },
  { name: "Ruth", chapters: 4, testament: "OT" },
  { name: "1 Samuel", chapters: 31, testament: "OT" },
  { name: "2 Samuel", chapters: 24, testament: "OT" },
  { name: "1 Kings", chapters: 22, testament: "OT" },
  { name: "2 Kings", chapters: 25, testament: "OT" },
  { name: "1 Chronicles", chapters: 29, testament: "OT" },
  { name: "2 Chronicles", chapters: 36, testament: "OT" },
  { name: "Ezra", chapters: 10, testament: "OT" },
  { name: "Nehemiah", chapters: 13, testament: "OT" },
  { name: "Esther", chapters: 10, testament: "OT" },
  { name: "Job", chapters: 42, testament: "OT" },
  { name: "Psalms", chapters: 150, testament: "OT" },
  { name: "Proverbs", chapters: 31, testament: "OT" },
  { name: "Ecclesiastes", chapters: 12, testament: "OT" },
  { name: "Song of Solomon", chapters: 8, testament: "OT" },
  { name: "Isaiah", chapters: 66, testament: "OT" },
  { name: "Jeremiah", chapters: 52, testament: "OT" },
  { name: " Lamentations".trim(), chapters: 5, testament: "OT" },
  { name: "Ezekiel", chapters: 48, testament: "OT" },
  { name: "Daniel", chapters: 12, testament: "OT" },
  { name: "Hosea", chapters: 14, testament: "OT" },
  { name: "Joel", chapters: 3, testament: "OT" },
  { name: "Amos", chapters: 9, testament: "OT" },
  { name: "Obadiah", chapters: 1, testament: "OT" },
  { name: "Jonah", chapters: 4, testament: "OT" },
  { name: "Micah", chapters: 7, testament: "OT" },
  { name: "Nahum", chapters: 3, testament: "OT" },
  { name: "Habakkuk", chapters: 3, testament: "OT" },
  { name: "Zephaniah", chapters: 3, testament: "OT" },
  { name: "Haggai", chapters: 2, testament: "OT" },
  { name: "Zechariah", chapters: 14, testament: "OT" },
  { name: "Malachi", chapters: 4, testament: "OT" },
  // New Testament (27)
  { name: "Matthew", chapters: 28, testament: "NT" },
  { name: "Mark", chapters: 16, testament: "NT" },
  { name: "Luke", chapters: 24, testament: "NT" },
  { name: "John", chapters: 21, testament: "NT" },
  { name: "Acts", chapters: 28, testament: "NT" },
  { name: "Romans", chapters: 16, testament: "NT" },
  { name: "1 Corinthians", chapters: 16, testament: "NT" },
  { name: "2 Corinthians", chapters: 13, testament: "NT" },
  { name: "Galatians", chapters: 6, testament: "NT" },
  { name: "Ephesians", chapters: 6, testament: "NT" },
  { name: "Philippians", chapters: 4, testament: "NT" },
  { name: "Colossians", chapters: 4, testament: "NT" },
  { name: "1 Thessalonians", chapters: 5, testament: "NT" },
  { name: "2 Thessalonians", chapters: 3, testament: "NT" },
  { name: "1 Timothy", chapters: 6, testament: "NT" },
  { name: "2 Timothy", chapters: 4, testament: "NT" },
  { name: "Titus", chapters: 3, testament: "NT" },
  { name: "Philemon", chapters: 1, testament: "NT" },
  { name: "Hebrews", chapters: 13, testament: "NT" },
  { name: "James", chapters: 5, testament: "NT" },
  { name: "1 Peter", chapters: 5, testament: "NT" },
  { name: "2 Peter", chapters: 3, testament: "NT" },
  { name: "1 John", chapters: 5, testament: "NT" },
  { name: "2 John", chapters: 1, testament: "NT" },
  { name: "3 John", chapters: 1, testament: "NT" },
  { name: "Jude", chapters: 1, testament: "NT" },
  { name: "Revelation", chapters: 22, testament: "NT" },
];

function expandBooks(bookNames: string[]): ChapterRef[] {
  const result: ChapterRef[] = [];
  for (const name of bookNames) {
    const found = BIBLE_BOOKS.find((b) => b.name === name);
    if (!found) continue;
    for (let ch = 1; ch <= found.chapters; ch++) {
      result.push({ book: found.name, chapter: ch });
    }
  }
  return result;
}

function buildGospelsAndPsalmsSequence(): ChapterRef[] {
  const gospels = expandBooks(["Matthew", "Mark", "Luke", "John"]);
  const psalms = expandBooks(["Psalms"]);
  const sequence: ChapterRef[] = [];
  const maxLen = Math.max(gospels.length, psalms.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < gospels.length) sequence.push(gospels[i]);
    if (i < psalms.length) sequence.push(psalms[i]);
  }
  return sequence;
}

const NT_BOOK_NAMES = BIBLE_BOOKS.filter((b) => b.testament === "NT").map(
  (b) => b.name
);

export const READING_PLAN_PRESETS: ReadingPlanPreset[] = [
  {
    id: "nt-90",
    title: "New Testament in 90 Days",
    subtitle: "3 chapters per portion • 260 chapters total",
    description:
      "Walk through the life of Jesus, the early Church, and the apostolic letters from Matthew to Revelation at an unhurried, grace-filled pace.",
    dailyTargetCount: 3,
    sequence: expandBooks(NT_BOOK_NAMES),
  },
  {
    id: "gospels-psalms",
    title: "Gospels + Psalms",
    subtitle: "1 Gospel chapter & 1 Psalm per portion • 239 chapters total",
    description:
      "Pair the words and ministry of Christ in the four Gospels alongside the prayers, laments, and praises of the Psalms.",
    dailyTargetCount: 2,
    sequence: buildGospelsAndPsalmsSequence(),
  },
];

export function chapterKey(book: string, chapter: number): string {
  return `${book}::${chapter}`;
}
