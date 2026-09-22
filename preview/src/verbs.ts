export const VIEW_ORDER = ["holdings", "forest", "lanes"] as const;

export function viewDirection(from: string, to: string): -1 | 0 | 1 {
  const a = (VIEW_ORDER as readonly string[]).indexOf(from);
  const b = (VIEW_ORDER as readonly string[]).indexOf(to);
  if (a < 0 || b < 0 || a === b) return 0;
  return b > a ? 1 : -1;
}
