import {
  CREATABLE_SOURCE_TYPES,
  WEBHOOK_SOURCE_TYPE,
  type CreatableSourceType,
} from "@portal/components/sources/sourceTypes";

/**
 * Hosted deployments don't rely on the server's local filesystem. Folder sources
 * are dropped outright (denied by the backend's FolderAccessGuard). Webhook stays
 * - it works in hosted by staging deliveries to a durable S3 connection - but its
 * connection becomes required, since the node-local fallback can't be relied on
 * across a multi-node fleet. Cloud sources such as S3 are unchanged.
 */
export function creatableSourceTypes(): CreatableSourceType[] {
  return CREATABLE_SOURCE_TYPES.filter((type) => type.type !== "folder").map(
    (type) =>
      type.type === WEBHOOK_SOURCE_TYPE ? withRequiredConnection(type) : type,
  );
}

/** The type with its S3-connection field marked required (durable staging is mandatory). */
function withRequiredConnection(
  type: CreatableSourceType,
): CreatableSourceType {
  return {
    ...type,
    fields: type.fields.map((field) =>
      field.control === "s3Connection" ? { ...field, required: true } : field,
    ),
  };
}
