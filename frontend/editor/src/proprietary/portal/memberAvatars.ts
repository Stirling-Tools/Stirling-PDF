import type { MemberAvatarSource } from "@portal/api/memberAvatars";
import { fetchAvatarThumbnails } from "@portal/api/users";

/**
 * Self-hosted: avatar keys are backend user ids, resolved to data URLs by the batch endpoint (the
 * portal's bearer-token transport rules out a plain image URL). Also what the portal test project
 * resolves `@app/portal/memberAvatars` to, since it has no saas alias.
 */
export const memberAvatars: MemberAvatarSource = {
  resolve: fetchAvatarThumbnails,
};
