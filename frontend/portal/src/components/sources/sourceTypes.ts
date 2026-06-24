import type { ChipTone } from "@shared/components";

/**
 * Per-type presentation + create-form metadata. This is product copy, not data.
 * It lives client-side so the table chip, type picker, and configure step stay
 * stable regardless of which connections exist. The backend's source `type`
 * string keys into here; unknown types fall back gracefully.
 */

export interface SourceTypeMeta {
  label: string;
  icon: string;
  tone: ChipTone;
}

const SOURCE_TYPE_META: Record<string, SourceTypeMeta> = {
  folder: { label: "Folder", icon: "⛁", tone: "blue" },
};

const UNKNOWN_TYPE_META: SourceTypeMeta = {
  label: "Source",
  icon: "◇",
  tone: "neutral",
};

export function sourceTypeMeta(type: string): SourceTypeMeta {
  return SOURCE_TYPE_META[type] ?? UNKNOWN_TYPE_META;
}

/** One configurable field for a creatable source type. */
export interface SourceFieldDef {
  key: string;
  label: string;
  control: "text" | "select";
  required?: boolean;
  placeholder?: string;
  helperText?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
}

/** A source type the wizard can create, with the fields its config needs. */
export interface CreatableSourceType {
  type: string;
  label: string;
  description: string;
  fields: SourceFieldDef[];
}

export const CREATABLE_SOURCE_TYPES: CreatableSourceType[] = [
  {
    type: "folder",
    label: "Folder",
    description: "Watch a directory on the server for new documents.",
    fields: [
      {
        key: "directory",
        label: "Directory path",
        control: "text",
        required: true,
        placeholder: "/data/incoming",
        helperText: "Absolute path Stirling watches for files to process.",
      },
      {
        key: "mode",
        label: "Read mode",
        control: "select",
        defaultValue: "consume",
        options: [
          { value: "consume", label: "Consume: process each file once" },
          {
            value: "snapshot",
            label: "Snapshot: re-read the folder every run",
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
