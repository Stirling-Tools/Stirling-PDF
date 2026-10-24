/**
 * The SaaS backend answers 403 {@code MEMBER_OVER_PLAN_LIMIT} to every request from a member their
 * team's user allowance no longer covers. Each API client reports it here and one screen listens,
 * so the member sees who to ask instead of a stream of failed-request toasts.
 */

export const MEMBER_OVER_PLAN_LIMIT = "MEMBER_OVER_PLAN_LIMIT";
const EVENT = "stirling:member-over-plan-limit";

export interface MemberOverPlanLimit {
  teamId: number;
  teamName: string | null;
  leaders: string[];
}

export function asMemberOverPlanLimit(
  status: number | undefined,
  body: unknown,
): MemberOverPlanLimit | null {
  if (status !== 403 || !body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.error !== MEMBER_OVER_PLAN_LIMIT || typeof b.teamId !== "number")
    return null;
  return {
    teamId: b.teamId,
    teamName: typeof b.teamName === "string" ? b.teamName : null,
    leaders: Array.isArray(b.leaders)
      ? b.leaders.filter((l): l is string => typeof l === "string")
      : [],
  };
}

/** True when the response was this refusal; callers then skip their generic error handling. */
export function reportMemberOverPlanLimit(
  status: number | undefined,
  body: unknown,
): boolean {
  const detail = asMemberOverPlanLimit(status, body);
  if (!detail || typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
  return true;
}

export function onMemberOverPlanLimit(
  handler: (detail: MemberOverPlanLimit) => void,
): () => void {
  const listener = (event: Event) =>
    handler((event as CustomEvent<MemberOverPlanLimit>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
