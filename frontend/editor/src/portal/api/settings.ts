import { apiClient } from "@portal/api/http";
import type { Tier } from "@portal/contexts/TierContext";

/*
 * The account + workspace settings surface. The shape is tier-aware: the
 * workspace plan label, available regions, and data-residency posture differ
 * by tier, so the modal reflects what each plan can actually configure.
 */

export interface RegionOption {
  value: string;
  label: string;
  /** Enterprise-only residency regions are gated below higher tiers. */
  enterpriseOnly?: boolean;
}

export interface NotificationDefault {
  id: string;
  enabled: boolean;
}

/** A device/browser with an active session, shown under Admin → Security. */
export interface ActiveSession {
  id: string;
  device: string;
  location: string;
  lastActive: string;
  /** The session viewing this modal — can't be revoked from here. */
  current: boolean;
}

/**
 * Org-wide authentication posture. SSO/SCIM are enterprise capabilities; lower
 * tiers see them as locked rows with an upgrade nudge.
 */
export interface SecuritySettings {
  mfaEnforced: boolean;
  ssoEnabled: boolean;
  scimEnabled: boolean;
  /** Idle timeout before re-auth, in minutes. */
  sessionTimeoutMins: number;
  activeSessions: ActiveSession[];
}

/** An opt-in early-access feature flag. */
export interface BetaFeature {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  /** Gated to enterprise — rendered locked below it. */
  enterpriseOnly?: boolean;
}

/**
 * Server snapshot of the account + workspace the modal opens onto. Editable
 * fields seed local form state; `planLabel` / `seats` are read-only context.
 */
export interface SettingsSnapshot {
  profile: {
    name: string;
    email: string;
    role: string;
    /** Avatar image URL, or null to fall back to initials. */
    avatarUrl: string | null;
  };
  workspace: {
    name: string;
    region: string;
    planLabel: string;
    seats: { used: number; total: number };
  };
  /** Per-category notification toggles, server-default on/off. */
  notifications: NotificationDefault[];
  regions: RegionOption[];
  /** Org-wide authentication + session posture (Admin scope). */
  security: SecuritySettings;
  /** Opt-in early-access features (Admin scope). */
  betaFeatures: BetaFeature[];
}

/** GET /v1/settings?tier=… — the account + workspace snapshot the modal edits. */
export async function fetchSettings(tier: Tier): Promise<SettingsSnapshot> {
  return apiClient.local.json<SettingsSnapshot>(
    `/v1/settings?tier=${encodeURIComponent(tier)}`,
  );
}
