import type { NavKey } from "@app/components/shared/config/types";

/**
 * Retired section keys and the section that now holds their content, so a
 * bookmark or search result for a folded row still lands on the right page
 * instead of falling through to whichever row happens to be first.
 *
 * Core owns this because folds happen in core: the portal's own alias map is
 * merged over it, never substituted for it, so a build without the processor
 * still resolves these.
 */
export const BASE_SECTION_ALIASES: Partial<Record<string, NavKey>> = {
  help: "about",
  legal: "about",
  backendThirdPartyLicenses: "about",
  frontendThirdPartyLicenses: "about",
  adminAiGeneral: "adminAi",
  adminAiModels: "adminAi",
  adminAiDocuments: "adminAi",
  adminAiLimits: "adminAi",
  hotkeys: "general",
  account: "general",
  adminFeatures: "adminGeneral",
  adminStorageSharing: "adminGeneral",
  adminFolderAccess: "adminGeneral",
  adminEndpoints: "adminGeneral",
  adminMcp: "adminGeneral",
  adminPrivacy: "adminLegal",
};
