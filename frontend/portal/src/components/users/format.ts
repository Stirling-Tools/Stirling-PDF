import type { AvatarTone } from "@shared/components";
import type { RoleId } from "@portal/api/users";
import { ROLE_TONE } from "@portal/api/users";

/** Seats used / limit as display copy; null limit → "Unlimited". */
export function seatsLabel(used: number, limit: number | null): string {
  return limit === null ? `${used} · Unlimited` : `${used} / ${limit}`;
}

/**
 * Avatar tone for a member, keyed off their role so the roster reads as a
 * legend for the role catalogue. Falls back to neutral for unknown roles.
 */
export function avatarToneForRole(role: RoleId): AvatarTone {
  return (ROLE_TONE[role] ?? "neutral") as AvatarTone;
}
