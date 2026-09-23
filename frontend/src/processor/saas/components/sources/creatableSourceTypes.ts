import {
  CREATABLE_SOURCE_TYPES,
  type CreatableSourceType,
} from "@portal/components/sources/sourceTypes";

/**
 * Hosted deployments never read the server's filesystem (the backend's
 * FolderAccessGuard denies it outright), so folder connections are not offered
 * in the connect wizard.
 */
export function creatableSourceTypes(): CreatableSourceType[] {
  return CREATABLE_SOURCE_TYPES.filter((type) => type.type !== "folder");
}
