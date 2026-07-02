import type { ChipTone } from "@shared/components";

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
  tone: ChipTone;
}

const SOURCE_TYPE_META: Record<string, SourceTypeMeta> = {
  folder: { labelKey: "sources.types.folder.label", icon: "⛁", tone: "blue" },
  editor: { labelKey: "sources.types.editor.label", icon: "✏", tone: "green" },
};

const UNKNOWN_TYPE_META: SourceTypeMeta = {
  labelKey: "sources.types.unknown.label",
  icon: "◇",
  tone: "neutral",
};

export function sourceTypeMeta(type: string): SourceTypeMeta {
  return SOURCE_TYPE_META[type] ?? UNKNOWN_TYPE_META;
}

/** One configurable field for a creatable source type. */
export interface SourceFieldDef {
  key: string;
  labelKey: string;
  control: "text" | "select";
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
    labelKey: "sources.types.folder.label",
    descriptionKey: "sources.types.folder.description",
    fields: [
      {
        key: "directory",
        labelKey: "sources.types.folder.fields.directory.label",
        control: "text",
        required: true,
        placeholderKey: "sources.types.folder.fields.directory.placeholder",
        helperTextKey: "sources.types.folder.fields.directory.helperText",
      },
      {
        key: "mode",
        labelKey: "sources.types.folder.fields.mode.label",
        control: "select",
        defaultValue: "consume",
        options: [
          {
            value: "consume",
            labelKey: "sources.types.folder.fields.mode.options.consume",
          },
          {
            value: "snapshot",
            labelKey: "sources.types.folder.fields.mode.options.snapshot",
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
