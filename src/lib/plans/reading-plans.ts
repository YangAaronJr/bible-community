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

export interface CustomScheduleSlot {
  timeOfDay: "Morning" | "Evening";
  track: string;
  chaptersPerDay: number;
}

export const SCHEDULE_TRACK_OPTIONS = [
  { id: "OT", label: "Old Testament (Genesis – Malachi)" },
  { id: "NT", label: "New Testament (Matthew – Revelation)" },
  { id: "Gospels", label: "The Four Gospels (Matthew – John)" },
  { id: "PsalmsProverbs", label: "Psalms & Proverbs" },
];

export const WEEKDAYS = [
  { day: 0, short: "Sun", label: "Sunday" },
  { day: 1, short: "Mon", label: "Monday" },
  { day: 2, short: "Tue", label: "Tuesday" },
  { day: 3, short: "Wed", label: "Wednesday" },
  { day: 4, short: "Thu", label: "Thursday" },
  { day: 5, short: "Fri", label: "Friday" },
  { day: 6, short: "Sat", label: "Saturday" },
];

export function expandBookList(bookNames: string[]): ChapterRef[] {
  return expandBooks(bookNames);
}

export function resolveTrackSequence(track: string): ChapterRef[] {
  if (track === "OT") {
    return expandBooks(
      BIBLE_BOOKS.filter((b) => b.testament === "OT").map((b) => b.name)
    );
  }
  if (track === "NT") {
    return expandBooks(NT_BOOK_NAMES);
  }
  if (track === "Gospels") {
    return expandBooks(["Matthew", "Mark", "Luke", "John"]);
  }
  if (track === "PsalmsProverbs") {
    return expandBooks(["Psalms", "Proverbs"]);
  }
  const parts = track
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return expandBooks(parts.length > 0 ? parts : [track]);
}

export interface SharedCustomPlanPayload {
  title: string;
  books: string[];
  chaptersPerDay: number;
  restDays: number[];
}

export type ParsedSharedPlan =
  | { kind: "preset"; preset: ReadingPlanPreset }
  | { kind: "custom"; custom: SharedCustomPlanPayload };

const CUSTOM_PLAN_PREFIX = "custom:";

export function encodeSharedCustomPlan(
  payload: SharedCustomPlanPayload
): string {
  return `${CUSTOM_PLAN_PREFIX}${JSON.stringify({
    title: payload.title.trim() || "Custom Plan",
    books: payload.books,
    chaptersPerDay: payload.chaptersPerDay,
    restDays: payload.restDays,
  })}`;
}

export function parseSharedPlan(
  sharedPlanId: string | null | undefined
): ParsedSharedPlan | null {
  if (!sharedPlanId) return null;
  const preset = READING_PLAN_PRESETS.find((p) => p.id === sharedPlanId);
  if (preset) return { kind: "preset", preset };

  if (sharedPlanId.startsWith(CUSTOM_PLAN_PREFIX)) {
    try {
      const parsed = JSON.parse(
        sharedPlanId.slice(CUSTOM_PLAN_PREFIX.length)
      ) as Partial<SharedCustomPlanPayload>;
      if (
        typeof parsed.title === "string" &&
        Array.isArray(parsed.books) &&
        parsed.books.length > 0
      ) {
        return {
          kind: "custom",
          custom: {
            title: parsed.title,
            books: parsed.books.filter((b): b is string => typeof b === "string"),
            chaptersPerDay:
              typeof parsed.chaptersPerDay === "number" &&
              parsed.chaptersPerDay >= 1
                ? parsed.chaptersPerDay
                : 1,
            restDays: Array.isArray(parsed.restDays)
              ? parsed.restDays.filter((d): d is number => typeof d === "number")
              : [],
          },
        };
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function getSharedPlanTitle(
  sharedPlanId: string | null | undefined
): string | null {
  if (!sharedPlanId) return null;
  const parsed = parseSharedPlan(sharedPlanId);
  if (!parsed) return sharedPlanId;
  return parsed.kind === "preset" ? parsed.preset.title : parsed.custom.title;
}

export interface BibleMovement {
  id: string;
  label: string;
  testament: "OT" | "NT";
  books: string[];
}

export const BIBLE_MOVEMENTS: BibleMovement[] = [
  {
    id: "torah",
    label: "Torah (Law)",
    testament: "OT",
    books: ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"],
  },
  {
    id: "history",
    label: "History",
    testament: "OT",
    books: [
      "Joshua",
      "Judges",
      "Ruth",
      "1 Samuel",
      "2 Samuel",
      "1 Kings",
      "2 Kings",
      "1 Chronicles",
      "2 Chronicles",
      "Ezra",
      "Nehemiah",
      "Esther",
    ],
  },
  {
    id: "wisdom",
    label: "Wisdom & Poetry",
    testament: "OT",
    books: ["Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon"],
  },
  {
    id: "major-prophets",
    label: "Major Prophets",
    testament: "OT",
    books: ["Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel"],
  },
  {
    id: "minor-prophets",
    label: "Minor Prophets",
    testament: "OT",
    books: [
      "Hosea",
      "Joel",
      "Amos",
      "Obadiah",
      "Jonah",
      "Micah",
      "Nahum",
      "Habakkuk",
      "Zephaniah",
      "Haggai",
      "Zechariah",
      "Malachi",
    ],
  },
  {
    id: "gospels-acts",
    label: "Gospels & Acts",
    testament: "NT",
    books: ["Matthew", "Mark", "Luke", "John", "Acts"],
  },
  {
    id: "paul-letters",
    label: "Paul's Letters",
    testament: "NT",
    books: [
      "Romans",
      "1 Corinthians",
      "2 Corinthians",
      "Galatians",
      "Ephesians",
      "Philippians",
      "Colossians",
      "1 Thessalonians",
      "2 Thessalonians",
      "1 Timothy",
      "2 Timothy",
      "Titus",
      "Philemon",
    ],
  },
  {
    id: "general-revelation",
    label: "General Epistles & Revelation",
    testament: "NT",
    books: [
      "Hebrews",
      "James",
      "1 Peter",
      "2 Peter",
      "1 John",
      "2 John",
      "3 John",
      "Jude",
      "Revelation",
    ],
  },
];

export interface UnifiedPlan {
  id: string;
  title: string;
  presetId?: "nt-90" | "gospels-psalms" | null;
  books: string[];
  chaptersPerDay: number;
  restDays: number[];
  source: "personal" | "circle";
  circleId?: string;
  circleName?: string;
}

export function resolveUnifiedPlanSequence(
  plan: Pick<UnifiedPlan, "presetId" | "books">
): ChapterRef[] {
  if (plan.presetId) {
    const preset = READING_PLAN_PRESETS.find((p) => p.id === plan.presetId);
    if (preset) return preset.sequence;
  }
  return expandBooks(plan.books);
}

export function getNextUnreadChapters(
  sequence: ChapterRef[],
  completedKeys: { has(key: string): boolean },
  count = 1,
  sessionKeys?: { has(key: string): boolean }
): ChapterRef[] {
  const limit = Math.max(1, count);
  const remaining = sequence.filter((c) => {
    const key = chapterKey(c.book, c.chapter);
    return !completedKeys.has(key) || Boolean(sessionKeys?.has(key));
  });
  if (remaining.length > 0) return remaining.slice(0, limit);
  return sequence.length > 0 ? [sequence[0]] : [];
}

export function getActivePlanBooks(
  plans: Array<Pick<UnifiedPlan, "presetId" | "books">>
): Set<string> {
  const books = new Set<string>();
  for (const plan of plans) {
    for (const ch of resolveUnifiedPlanSequence(plan)) {
      books.add(ch.book);
    }
  }
  return books;
}

export function isRestDay(
  restDays: number[],
  date: Date = new Date()
): boolean {
  return restDays.includes(date.getDay());
}

export type DailyReadingSource = "personal" | "circle" | "both";

export interface CombinedDailyReading {
  book: string;
  chapter: number;
  source: DailyReadingSource;
  circleName?: string;
  timeOfDay?: "Morning" | "Evening";
}

/**
 * Combines Personal and Circle daily readings into a single ordered list
 * without duplicate chapters, marking overlapping chapters as "both".
 */
export function combineDailyReadings(
  personalChapters: Array<ChapterRef & { timeOfDay?: "Morning" | "Evening" }>,
  circleChapters: ChapterRef[],
  circleName?: string
): CombinedDailyReading[] {
  const byKey = new Map<string, CombinedDailyReading>();
  const result: CombinedDailyReading[] = [];

  for (const ch of personalChapters) {
    const key = chapterKey(ch.book, ch.chapter);
    if (byKey.has(key)) continue;
    const item: CombinedDailyReading = {
      book: ch.book,
      chapter: ch.chapter,
      source: "personal",
      ...(ch.timeOfDay ? { timeOfDay: ch.timeOfDay } : {}),
    };
    byKey.set(key, item);
    result.push(item);
  }

  for (const ch of circleChapters) {
    const key = chapterKey(ch.book, ch.chapter);
    const existing = byKey.get(key);
    if (existing) {
      existing.source = "both";
      if (circleName) existing.circleName = circleName;
      continue;
    }
    const item: CombinedDailyReading = {
      book: ch.book,
      chapter: ch.chapter,
      source: "circle",
      ...(circleName ? { circleName } : {}),
    };
    byKey.set(key, item);
    result.push(item);
  }

  return result;
}
