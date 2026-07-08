import type { AvatarTone } from "@app/ui";
import type { Member } from "@portal/api/users";

/** Vivid tones cycled per-person so a big roster reads as distinct people. */
const AVATAR_TONES: AvatarTone[] = ["blue", "purple", "green", "amber", "red"];

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
