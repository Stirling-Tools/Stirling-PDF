import { TEAM_PATH } from "@editor/routes/teamPath";

/** The path an auth page's `?next=` returns to, without its query or hash. */
export function nextPathOf(
  next: string | null | undefined,
): string | undefined {
  return next?.split(/[?#]/)[0];
}

export function leadsToTeam(next: string | null | undefined): boolean {
  const path = nextPathOf(next)?.replace(/\/+$/, "").toLowerCase();
  return path === TEAM_PATH;
}
