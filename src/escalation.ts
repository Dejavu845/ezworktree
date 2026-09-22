import type { Task } from "./types.ts";

export const ESCALATION_MIN = 4;
export const ESCALATION_ERROR = "开冻层必须写理由（至少 4 个字）";

export function normalizeEscalationReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().replace(/\s+/g, " ");
  return normalized.length >= ESCALATION_MIN ? normalized : null;
}

export function formatEscalation(task: Task): string {
  if (!task.escalation) {
    return task.allowFrozenTouch ? "allowFrozenTouch (no reason on record)" : "—";
  }
  const { reason, by, agent, at, requestId } = task.escalation;
  let out = `${reason} — by ${by}`;
  if (agent) out += ` (${agent})`;
  if (at) out += ` at ${at}`;
  if (requestId) out += ` · ${requestId}`;
  return out;
}
