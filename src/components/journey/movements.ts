import { BIBLE_BOOKS, type BibleBook } from "@/lib/plans/reading-plans";

export interface CanonicalMovement {
  id: string;
  name: string;
  rangeLabel: string;
  description: string;
  books: BibleBook[];
}

interface MovementDef {
  id: string;
  name: string;
  rangeLabel: string;
  description: string;
  startBook: string;
  endBook: string;
}

const MOVEMENT_DEFS: MovementDef[] = [
  {
    id: "pentateuch",
    name: "Pentateuch",
    rangeLabel: "Genesis – Deuteronomy",
    description: "Creation, promise, deliverance, and covenant",
    startBook: "Genesis",
    endBook: "Deuteronomy",
  },
  {
    id: "history",
    name: "History",
    rangeLabel: "Joshua – Esther",
    description: "The land, the kings, exile, and restoration",
    startBook: "Joshua",
    endBook: "Esther",
  },
  {
    id: "wisdom",
    name: "Wisdom & Poetry",
    rangeLabel: "Job – Song of Solomon",
    description: "Lament, praise, and the fear of the Lord",
    startBook: "Job",
    endBook: "Song of Solomon",
  },
  {
    id: "prophets",
    name: "Prophets",
    rangeLabel: "Isaiah – Malachi",
    description: "Call to repentance and the promised Servant",
    startBook: "Isaiah",
    endBook: "Malachi",
  },
  {
    id: "gospels",
    name: "Gospels",
    rangeLabel: "Matthew – John",
    description: "The life, cross, and resurrection of Jesus Christ",
    startBook: "Matthew",
    endBook: "John",
  },
  {
    id: "acts-epistles",
    name: "Acts & Epistles",
    rangeLabel: "Acts – Jude",
    description: "The Spirit-led church and apostolic teaching",
    startBook: "Acts",
    endBook: "Jude",
  },
  {
    id: "revelation",
    name: "Revelation",
    rangeLabel: "Revelation",
    description: "The Lamb upon the throne and all things made new",
    startBook: "Revelation",
    endBook: "Revelation",
  },
];

function sliceBooks(startBook: string, endBook: string): BibleBook[] {
  const startIdx = BIBLE_BOOKS.findIndex((b) => b.name === startBook);
  const endIdx = BIBLE_BOOKS.findIndex((b) => b.name === endBook);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return [];
  return BIBLE_BOOKS.slice(startIdx, endIdx + 1);
}

export const CANONICAL_MOVEMENTS: CanonicalMovement[] = MOVEMENT_DEFS.map(
  (def) => ({
    id: def.id,
    name: def.name,
    rangeLabel: def.rangeLabel,
    description: def.description,
    books: sliceBooks(def.startBook, def.endBook),
  })
);

export function getMovementProgress(
  movement: CanonicalMovement,
  completedByBook: Map<string, Set<number>>
) {
  let readChapters = 0;
  let totalChapters = 0;
  let activeBooks = 0;

  for (const book of movement.books) {
    totalChapters += book.chapters;
    const read = completedByBook.get(book.name)?.size ?? 0;
    readChapters += Math.min(read, book.chapters);
    if (read > 0) activeBooks += 1;
  }

  return {
    readChapters,
    totalChapters,
    activeBooks,
    totalBooks: movement.books.length,
    pct: totalChapters > 0 ? Math.round((readChapters / totalChapters) * 100) : 0,
  };
}
