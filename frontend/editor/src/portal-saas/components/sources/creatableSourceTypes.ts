import {
  CREATABLE_SOURCE_TYPES,
  type CreatableSourceType,
} from "@portal/components/sources/sourceTypes";

/**
 * Hosted deployments don't rely on the server's local filesystem, so the two
 * server-local-disk source types are not offered in the connect wizard: folder
 * (denied outright by the backend's FolderAccessGuard) and webhook (whose
 * delivery spool is node-local, so it can't be relied on across a multi-node
 * fleet). Cloud sources such as S3 remain.
 */
const SERVER_LOCAL_TYPES = new Set(["folder", "webhook"]);

export function creatableSourceTypes(): CreatableSourceType[] {
  return CREATABLE_SOURCE_TYPES.filter(
    (type) => !SERVER_LOCAL_TYPES.has(type.type),
  );
}
