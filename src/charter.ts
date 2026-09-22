import type { Charter } from "./types.ts";

export function normalizeCharterVersion(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

export function charterFingerprint(charter: Charter): string {
  return JSON.stringify({
    purpose: charter.purpose,
    architecture: charter.architecture,
    conventions: charter.conventions,
    doNotTouch: charter.doNotTouch,
    layers: charter.layers,
  });
}

export function nextCharterVersion(prev: Charter, next: Charter): number {
  const current = normalizeCharterVersion(prev.version);
  if (charterFingerprint(prev) === charterFingerprint(next)) return current;
  return current + 1;
}

export function applyCharterVersion(prev: Charter, next: Charter): Charter {
  return { ...next, version: nextCharterVersion(prev, next) };
}
