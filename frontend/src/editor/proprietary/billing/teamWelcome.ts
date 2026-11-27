/**
 * Router state for the navigation into the editor after buying Team, so the editor offers to
 * invite the buyer's team once.
 */
export const TEAM_WELCOME_STATE = { teamWelcome: true } as const;

export function isTeamWelcome(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as { teamWelcome?: unknown }).teamWelcome === true
  );
}
