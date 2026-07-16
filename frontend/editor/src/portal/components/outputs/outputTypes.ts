import type { ChipAccent } from "@app/ui";

/**
 * Per-type presentation + create-form metadata for output destinations, mirroring
 * the source type registry. User-facing copy is stored as i18n keys (resolved by
 * the rendering component via t()), not literals, so the type chip and configure
 * fields stay translatable. The backend's output `type` string keys into here;
 * unknown types fall back gracefully.
 */

export interface OutputTypeMeta {
  labelKey: string;
  icon: string;
  accent: ChipAccent;
}

const OUTPUT_TYPE_META: Record<string, OutputTypeMeta> = {
  folder: {
    labelKey: "portal.outputs.types.folder.label",
    icon: "⛁",
    accent: "default",
  },
  s3: {
    labelKey: "portal.outputs.types.s3.label",
    icon: "☁",
    accent: "brand",
  },
};

const UNKNOWN_TYPE_META: OutputTypeMeta = {
  labelKey: "portal.outputs.types.unknown.label",
  icon: "◇",
  accent: "neutral",
};

export function outputTypeMeta(type: string): OutputTypeMeta {
  return OUTPUT_TYPE_META[type] ?? UNKNOWN_TYPE_META;
}

/** One configurable field for a creatable output type. */
export interface OutputFieldDef {
  key: string;
  labelKey: string;
  control: "text" | "s3Connection";
  required?: boolean;
  placeholderKey?: string;
  helperTextKey?: string;
}

/** An output type the modal can create, with the fields its config needs. */
export interface CreatableOutputType {
  type: string;
  labelKey: string;
  descriptionKey: string;
  fields: OutputFieldDef[];
}

const CREATABLE_OUTPUT_TYPES: Record<string, CreatableOutputType> = {
  folder: {
    type: "folder",
    labelKey: "portal.outputs.types.folder.label",
    descriptionKey: "portal.outputs.types.folder.description",
    fields: [
      {
        key: "directory",
        labelKey: "portal.outputs.types.folder.fields.directory.label",
        control: "text",
        required: true,
        placeholderKey:
          "portal.outputs.types.folder.fields.directory.placeholder",
        helperTextKey:
          "portal.outputs.types.folder.fields.directory.helperText",
      },
    ],
  },
  s3: {
    type: "s3",
    labelKey: "portal.outputs.types.s3.label",
    descriptionKey: "portal.outputs.types.s3.description",
    fields: [
      {
        key: "connectionId",
        labelKey: "portal.outputs.types.s3.fields.connection.label",
        control: "s3Connection",
        required: true,
        helperTextKey: "portal.outputs.types.s3.fields.connection.helperText",
      },
      {
        key: "prefix",
        labelKey: "portal.outputs.types.s3.fields.prefix.label",
        control: "text",
        placeholderKey: "portal.outputs.types.s3.fields.prefix.placeholder",
        helperTextKey: "portal.outputs.types.s3.fields.prefix.helperText",
      },
    ],
  },
};

/** The creatable spec for a destination type, or undefined for an unknown type. */
export function creatableOutputType(
  type: string,
): CreatableOutputType | undefined {
  return CREATABLE_OUTPUT_TYPES[type];
}
