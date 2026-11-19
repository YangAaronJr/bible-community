"use client";

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

export const DEFAULT_TEXT_SCALE = 1;
export const MIN_TEXT_SCALE = 0.8;
export const MAX_TEXT_SCALE = 1.85;

export function clampTextScale(
  value: number,
  min = MIN_TEXT_SCALE,
  max = MAX_TEXT_SCALE
): number {
  if (!Number.isFinite(value)) return DEFAULT_TEXT_SCALE;
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

export function getTouchDistance(
  t1: { clientX: number; clientY: number },
  t2: { clientX: number; clientY: number }
): number {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

const listenersByKey = new Map<string, Set<() => void>>();

function subscribeScale(storageKey: string, listener: () => void): () => void {
  let set = listenersByKey.get(storageKey);
  if (!set) {
    set = new Set();
    listenersByKey.set(storageKey, set);
  }
  set.add(listener);

  const onStorage = (e: StorageEvent) => {
    if (e.key === storageKey) listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    set?.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function readStoredScale(
  storageKey: string,
  defaultScale: number,
  minScale: number,
  maxScale: number
): number {
  if (typeof window === "undefined") return defaultScale;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaultScale;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed)
      ? clampTextScale(parsed, minScale, maxScale)
      : defaultScale;
  } catch {
    return defaultScale;
  }
}

function writeStoredScale(storageKey: string, scale: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, String(scale));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
  const set = listenersByKey.get(storageKey);
  if (set) {
    for (const listener of set) listener();
  }
}

export interface UsePinchFontSizeOptions<T extends HTMLElement = HTMLDivElement> {
  storageKey: string;
  defaultScale?: number;
  minScale?: number;
  maxScale?: number;
  targetRef?: RefObject<T | null>;
}

/**
 * Attaches two-finger pinch-to-zoom (touch + trackpad Ctrl+wheel) to a target
 * container ref and returns a clamped, localStorage-persisted font scale.
 */
export function usePinchFontSize<T extends HTMLElement = HTMLDivElement>({
  storageKey,
  defaultScale = DEFAULT_TEXT_SCALE,
  minScale = MIN_TEXT_SCALE,
  maxScale = MAX_TEXT_SCALE,
  targetRef,
}: UsePinchFontSizeOptions<T>) {
  const internalRef = useRef<T | null>(null);
  const containerRef = targetRef ?? internalRef;
  const scale = useSyncExternalStore(
    (listener) => subscribeScale(storageKey, listener),
    () => readStoredScale(storageKey, defaultScale, minScale, maxScale),
    () => defaultScale
  );

  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let pinchStartDistance: number | null = null;
    let pinchStartScale = scaleRef.current;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchStartDistance = getTouchDistance(e.touches[0], e.touches[1]);
        pinchStartScale = scaleRef.current;
      } else {
        pinchStartDistance = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || pinchStartDistance === null) return;
      if (pinchStartDistance <= 0) return;

      e.preventDefault();
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      const next = clampTextScale(
        pinchStartScale * (distance / pinchStartDistance),
        minScale,
        maxScale
      );
      if (next !== scaleRef.current) {
        scaleRef.current = next;
        writeStoredScale(storageKey, next);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStartDistance = null;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.004;
      const next = clampTextScale(
        scaleRef.current + delta,
        minScale,
        maxScale
      );
      if (next !== scaleRef.current) {
        scaleRef.current = next;
        writeStoredScale(storageKey, next);
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    el.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    el.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
      el.removeEventListener("wheel", handleWheel);
    };
  }, [storageKey, minScale, maxScale]);

  return { containerRef, scale };
}
