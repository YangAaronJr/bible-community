export type NavbarVariant = "home" | "login" | "inner";

export const BRANDED_HEADER_PATHS = ["/", "/login"] as const;

export const INNER_ROUTE_PREFIXES = [
  "/reader",
  "/plans",
  "/journey",
  "/settings",
  "/social",
  "/circles",
  "/dm",
  "/members",
] as const;

function stripQueryAndHash(pathname: string): string {
  const trimmed = pathname.trim();
  const qIdx = trimmed.indexOf("?");
  const hIdx = trimmed.indexOf("#");

  let end = trimmed.length;
  if (qIdx !== -1 && qIdx < end) end = qIdx;
  if (hIdx !== -1 && hIdx < end) end = hIdx;

  return trimmed.slice(0, end);
}

export function normalizePathname(pathname: string): string {
  const rawPath = stripQueryAndHash(pathname);
  if (!rawPath) {
    return "/";
  }

  let normalized = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  while (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

export function resolveNavbarVariant(pathname: string): NavbarVariant {
  const normalized = normalizePathname(pathname);

  if (normalized === "/") {
    return "home";
  }

  if (normalized === "/login" || normalized.startsWith("/login/")) {
    return "login";
  }

  return "inner";
}

export function isImmersiveChatRoute(pathname: string): boolean {
  const rawPath = stripQueryAndHash(pathname);
  return rawPath.startsWith("/dm/");
}

export function shouldShowBrandedHeader(pathname: string): boolean {
  return resolveNavbarVariant(pathname) !== "inner";
}

export function shouldShowBottomNav(
  pathname: string,
  options?: { hideBottomNav?: boolean; variant?: NavbarVariant }
): boolean {
  if (options?.hideBottomNav !== undefined) {
    return !options.hideBottomNav;
  }

  const variant = options?.variant ?? resolveNavbarVariant(pathname);
  return variant !== "login";
}
