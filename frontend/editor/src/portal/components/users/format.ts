import type { AvatarTone } from "@app/ui";
import type { RoleId } from "@portal/api/users";
import { ROLE_TONE } from "@portal/api/users";

/**
 * Avatar tone for a member, keyed off their role so the roster reads as a
 * legend for the role catalogue. Falls back to neutral for unknown roles.
 */
export function avatarToneForRole(role: RoleId): AvatarTone {
  return (ROLE_TONE[role] ?? "neutral") as AvatarTone;
}
