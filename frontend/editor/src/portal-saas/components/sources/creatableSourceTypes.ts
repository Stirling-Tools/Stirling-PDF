import {
  CREATABLE_SOURCE_TYPES,
  WEBHOOK_SOURCE_TYPE,
  type CreatableSourceType,
} from "@portal/components/sources/sourceTypes";

/** Hosted drops folder (no server FS) and requires webhook's S3 connection (node-local isn't durable). */
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
