import { connectionModeService } from "@app/services/connectionModeService";

/** Cloud purchases need no local activation when the desktop is connected directly to SaaS. */
export async function requiresLocalTeamActivation(): Promise<boolean> {
  return (await connectionModeService.getCurrentMode()) !== "saas";
}
