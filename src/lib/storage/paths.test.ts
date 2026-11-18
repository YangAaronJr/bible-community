import { describe, expect, it } from "vitest";
import { extractStorageObjectPath } from "./paths";

describe("extractStorageObjectPath", () => {
  it("returns null for empty or nullish inputs", () => {
    expect(extractStorageObjectPath(null, "notebook-uploads")).toBeNull();
    expect(extractStorageObjectPath(undefined, "notebook-uploads")).toBeNull();
    expect(extractStorageObjectPath("", "notebook-uploads")).toBeNull();
    expect(extractStorageObjectPath("   ", "notebook-uploads")).toBeNull();
  });

  it("normalizes raw relative storage paths", () => {
    expect(
      extractStorageObjectPath("user-123/notes/page1.jpg", "notebook-uploads")
    ).toBe("user-123/notes/page1.jpg");
    expect(
      extractStorageObjectPath("///user-123/notes/page1.jpg", "notebook-uploads")
    ).toBe("user-123/notes/page1.jpg");
  });

  it("extracts object path from Supabase public storage URLs", () => {
    expect(
      extractStorageObjectPath(
        "https://abc.supabase.co/storage/v1/object/public/notebook-uploads/user-123/my%20note.png",
        "notebook-uploads"
      )
    ).toBe("user-123/my note.png");
  });

  it("extracts object path from Supabase signed storage URLs and strips query/hash", () => {
    expect(
      extractStorageObjectPath(
        "https://abc.supabase.co/storage/v1/object/sign/notebook-uploads/user-123/note.png?token=xyz123#frag",
        "notebook-uploads"
      )
    ).toBe("user-123/note.png");
  });

  it("returns null for other buckets, external URLs, or empty bucket suffix", () => {
    expect(
      extractStorageObjectPath(
        "https://abc.supabase.co/storage/v1/object/public/avatars/user-123/avatar.png",
        "notebook-uploads"
      )
    ).toBeNull();
    expect(
      extractStorageObjectPath(
        "https://example.com/images/photo.png",
        "notebook-uploads"
      )
    ).toBeNull();
    expect(
      extractStorageObjectPath(
        "https://abc.supabase.co/storage/v1/object/public/notebook-uploads/?token=123",
        "notebook-uploads"
      )
    ).toBeNull();
  });

  it("falls back to undecoded segment if percent-encoding is malformed", () => {
    expect(
      extractStorageObjectPath(
        "https://abc.supabase.co/storage/v1/object/public/notebook-uploads/user-123/%E0%A4%A.png",
        "notebook-uploads"
      )
    ).toBe("user-123/%E0%A4%A.png");
  });
});
