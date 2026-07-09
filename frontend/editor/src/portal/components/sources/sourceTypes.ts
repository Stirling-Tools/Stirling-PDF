import type { ChipAccent } from "@app/ui";

/**
 * Per-type presentation + create-form metadata. User-facing copy is stored as
 * i18n keys (resolved by the rendering component via t()), not literals, so the
 * table chip, type picker, and configure step stay translatable. The structure
 * lives client-side so it stays stable regardless of which connections exist.
 * The backend's source `type` string keys into here; unknown types fall back
 * gracefully.
 */

export interface SourceTypeMeta {
  labelKey: string;
  icon: string;
  accent: ChipAccent;
}

const SOURCE_TYPE_META: Record<string, SourceTypeMeta> = {
  folder: {
    labelKey: "portal.sources.types.folder.label",
    icon: "⛁",
    accent: "default",
  },
  editor: {
    labelKey: "portal.sources.types.editor.label",
    icon: "✏",
    accent: "success",
  },
  s3: {
    labelKey: "portal.sources.types.s3.label",
    icon: "☁",
    accent: "brand",
  },
};

const UNKNOWN_TYPE_META: SourceTypeMeta = {
  labelKey: "portal.sources.types.unknown.label",
  icon: "◇",
  accent: "neutral",
};

export function sourceTypeMeta(type: string): SourceTypeMeta {
  return SOURCE_TYPE_META[type] ?? UNKNOWN_TYPE_META;
}

/** One configurable field for a creatable source type. */
export interface SourceFieldDef {
  key: string;
  labelKey: string;
  control: "text" | "password" | "select";
  required?: boolean;
  placeholderKey?: string;
  helperTextKey?: string;
  options?: { value: string; labelKey: string }[];
  defaultValue?: string;
}

/** A source type the wizard can create, with the fields its config needs. */
export interface CreatableSourceType {
  type: string;
  labelKey: string;
  descriptionKey: string;
  fields: SourceFieldDef[];
}

export const CREATABLE_SOURCE_TYPES: CreatableSourceType[] = [
  {
    type: "folder",
    labelKey: "portal.sources.types.folder.label",
    descriptionKey: "portal.sources.types.folder.description",
    fields: [
      {
        key: "directory",
        labelKey: "portal.sources.types.folder.fields.directory.label",
        control: "text",
        required: true,
        placeholderKey:
          "portal.sources.types.folder.fields.directory.placeholder",
        helperTextKey:
          "portal.sources.types.folder.fields.directory.helperText",
      },
      {
        key: "mode",
        labelKey: "portal.sources.types.folder.fields.mode.label",
        control: "select",
        defaultValue: "consume",
        options: [
          {
            value: "consume",
            labelKey: "portal.sources.types.folder.fields.mode.options.consume",
          },
          {
            value: "snapshot",
            labelKey:
              "portal.sources.types.folder.fields.mode.options.snapshot",
          },
        ],
      },
      {
        key: "recursive",
        labelKey: "portal.sources.types.folder.fields.recursive.label",
        control: "select",
        defaultValue: "false",
        options: [
          {
            value: "false",
            labelKey:
              "portal.sources.types.folder.fields.recursive.options.top",
          },
          {
            value: "true",
            labelKey:
              "portal.sources.types.folder.fields.recursive.options.all",
          },
        ],
      },
      {
        key: "identity",
        labelKey: "portal.sources.types.folder.fields.identity.label",
        control: "select",
        defaultValue: "stat",
        helperTextKey: "portal.sources.types.folder.fields.identity.helperText",
        options: [
          {
            value: "stat",
            labelKey:
              "portal.sources.types.folder.fields.identity.options.stat",
          },
          {
            value: "hash",
            labelKey:
              "portal.sources.types.folder.fields.identity.options.hash",
          },
        ],
      },
    ],
  },
  {
    type: "s3",
    labelKey: "portal.sources.types.s3.label",
    descriptionKey: "portal.sources.types.s3.description",
    fields: [
      {
        key: "bucket",
        labelKey: "portal.sources.types.s3.fields.bucket.label",
        control: "text",
        required: true,
        placeholderKey: "portal.sources.types.s3.fields.bucket.placeholder",
      },
      {
        key: "region",
        labelKey: "portal.sources.types.s3.fields.region.label",
        control: "text",
        defaultValue: "us-east-1",
        placeholderKey: "portal.sources.types.s3.fields.region.placeholder",
      },
      {
        key: "prefix",
        labelKey: "portal.sources.types.s3.fields.prefix.label",
        control: "text",
        placeholderKey: "portal.sources.types.s3.fields.prefix.placeholder",
        helperTextKey: "portal.sources.types.s3.fields.prefix.helperText",
      },
      {
        key: "accessKeyId",
        labelKey: "portal.sources.types.s3.fields.accessKeyId.label",
        control: "text",
        helperTextKey: "portal.sources.types.s3.fields.accessKeyId.helperText",
      },
      {
        key: "secretAccessKey",
        labelKey: "portal.sources.types.s3.fields.secretAccessKey.label",
        control: "password",
      },
      {
        key: "endpoint",
        labelKey: "portal.sources.types.s3.fields.endpoint.label",
        control: "text",
        placeholderKey: "portal.sources.types.s3.fields.endpoint.placeholder",
        helperTextKey: "portal.sources.types.s3.fields.endpoint.helperText",
      },
      {
        key: "mode",
        labelKey: "portal.sources.types.s3.fields.mode.label",
        control: "select",
        defaultValue: "consume",
        helperTextKey: "portal.sources.types.s3.fields.mode.helperText",
        options: [
          {
            value: "consume",
            labelKey: "portal.sources.types.s3.fields.mode.options.consume",
          },
          {
            value: "snapshot",
            labelKey: "portal.sources.types.s3.fields.mode.options.snapshot",
          },
        ],
      },
    ],
  },
];

/** Default option values for a type's create form. */
export function defaultOptions(
  type: CreatableSourceType,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of type.fields) {
    out[field.key] = field.defaultValue ?? "";
  }
  return out;
}
