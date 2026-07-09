import type { AvatarTone, ChipAccent } from "@app/ui";
import type { Member, RoleId } from "@portal/api/users";
import { ROLE_TONE } from "@portal/api/users";

/** Vivid tones cycled per-person so a big roster reads as distinct people. */
const AVATAR_TONES: AvatarTone[] = ["blue", "purple", "green", "amber", "red"];

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
 * A stable avatar tone for a member, hashed from their identity so everyone
 * gets a distinct, consistent colour (role is conveyed by the row's controls,
 * not the avatar).
 */
export function avatarToneForMember(m: Member): AvatarTone {
  const key = m.username || m.name || m.id || "";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
}
