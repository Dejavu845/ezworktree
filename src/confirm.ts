import type { Caller } from "./types.ts";

export function typedConfirmOk(
  expected: string,
  given: string | undefined,
  confirmDestructive: boolean,
  actor: Caller["actor"],
): boolean {
  if (actor !== "human") return true;
  if (!confirmDestructive) return true;
  return (given || "").trim() === expected;
}

export function confirmRejectReason(expected: string): string {
  return `\u5148\u6253\u51fa\u300c${expected}\u300d\u518d\u786e\u8ba4\u3002`;
}

export function assertTypedConfirm(
  expected: string,
  given: string | undefined,
  confirmDestructive: boolean,
  actor: Caller["actor"],
): void {
  if (!typedConfirmOk(expected, given, confirmDestructive, actor)) {
    throw new Error(confirmRejectReason(expected));
  }
}
