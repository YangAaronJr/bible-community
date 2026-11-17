/**
 * Extract the relative Supabase Storage object path from either a stored
 * relative path or a legacy Supabase public/signed storage URL for `bucket`.
 * Returns null for empty values or external (non-bucket) URLs.
 */
export function extractStorageObjectPath(
  urlOrPath: string | null | undefined,
  bucket: string
): string | null {
  if (!urlOrPath) return null;
  const trimmed = urlOrPath.trim();
  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^\/+/, "");
  }

  const marker = `/${bucket}/`;
  const idx = trimmed.indexOf(marker);
  if (idx === -1) return null;

  const afterMarker = trimmed.slice(idx + marker.length);
  const withoutQuery = afterMarker.split("?")[0]?.split("#")[0] || "";
  if (!withoutQuery) return null;

  try {
    return decodeURIComponent(withoutQuery);
  } catch {
    return withoutQuery;
  }
}
