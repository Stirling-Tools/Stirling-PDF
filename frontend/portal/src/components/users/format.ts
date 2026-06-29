import type { AvatarTone, ChipAccent } from "@shared/components";
import type { RoleId } from "@portal/api/users";
import { ROLE_TONE } from "@portal/api/users";

/** Map the role palette onto the shared Chip accent set. */
const ROLE_CHIP_ACCENT: Record<
  "purple" | "blue" | "green" | "amber" | "neutral",
  ChipAccent
> = {
  purple: "premium",
  blue: "default",
  green: "success",
  amber: "warning",
  neutral: "neutral",
};

/** Chip accent for a role, derived from its palette tone. */
export function chipAccentForRole(role: RoleId): ChipAccent {
  return ROLE_CHIP_ACCENT[ROLE_TONE[role] ?? "neutral"];
}

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
