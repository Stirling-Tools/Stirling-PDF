import { httpJson } from "@portal/api/http";
import type { SettingsSnapshot } from "@portal/mocks/settings";
import type { Tier } from "@portal/contexts/TierContext";

export type {
  ActiveSession,
  BetaFeature,
  NotificationDefault,
  RegionOption,
  SecuritySettings,
  SettingsSnapshot,
} from "@portal/mocks/settings";

/** GET /v1/settings?tier=… — the account + workspace snapshot the modal edits. */
export async function fetchSettings(tier: Tier): Promise<SettingsSnapshot> {
  return httpJson<SettingsSnapshot>(
    `/v1/settings?tier=${encodeURIComponent(tier)}`,
  );
}
