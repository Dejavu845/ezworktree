/** First pixels of `.content` scroll drive the full 0…1 travel. Short panes still read. */
export const FORGE_SCROLL_TRAVEL = 420;

export function forgeScrollUnit(scrollTop: number, travel = FORGE_SCROLL_TRAVEL): number {
  if (travel <= 0) return 0;
  return Math.min(1, Math.max(0, scrollTop / travel));
}
