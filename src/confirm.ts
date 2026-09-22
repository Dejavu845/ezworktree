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
  return `先打出「${expected}」再确认。`;
}

export function assertTypedConfirm(
  expected: string,
  given: string | undefined,
  confirmDestructive: boolean,
  actor: Caller["actor"],
):
void {
  if (!typedConfirmOk(expected, given, confirmDestructive, actor)) {
    throw new Error(confirmRejectReason(expected));
  }
}
