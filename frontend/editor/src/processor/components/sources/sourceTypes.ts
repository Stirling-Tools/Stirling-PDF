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
  accent: ChipAccent;
}

/**
 * The built-in editor source. It is virtual (never created/edited/deleted like a folder), always
 * present in the list, and only tracks throughput - so rows of this type render without a config,
 * a type chip, or edit/pause/delete actions.
 */
export const EDITOR_SOURCE_TYPE = "editor";

/** The webhook source type. Its delivery URL + signing secret are minted server-side on create. */
export const WEBHOOK_SOURCE_TYPE = "webhook";

const SOURCE_TYPE_META: Record<string, SourceTypeMeta> = {
  folder: {
    labelKey: "processor.sources.types.folder.label",
    accent: "default",
  },
  editor: {
    labelKey: "processor.sources.types.editor.label",
    accent: "success",
  },
  s3: {
    labelKey: "processor.sources.types.s3.label",
    accent: "brand",
  },
  sftp: {
    labelKey: "processor.sources.types.sftp.label",
    accent: "default",
  },
  ftp: {
    labelKey: "processor.sources.types.ftp.label",
    accent: "default",
  },
  network: {
    labelKey: "processor.sources.types.network.label",
    accent: "default",
  },
  webhook: {
    labelKey: "processor.sources.types.webhook.label",
    accent: "warning",
  },
};

const UNKNOWN_TYPE_META: SourceTypeMeta = {
  labelKey: "processor.sources.types.unknown.label",
  accent: "neutral",
};

export function sourceTypeMeta(type: string): SourceTypeMeta {
  return SOURCE_TYPE_META[type] ?? UNKNOWN_TYPE_META;
}

/** One configurable field for a creatable source type. */
export interface SourceFieldDef {
  key: string;
  labelKey: string;
  control: "text" | "password" | "select" | "s3Connection" | "connection";
  required?: boolean;
  placeholderKey?: string;
  helperTextKey?: string;
  options?: { value: string; labelKey: string }[];
  defaultValue?: string;
  /** Tucked behind the "Advanced" disclosure: power settings whose default suits almost everyone. */
  advanced?: boolean;
  /** Only rendered while another field currently equals this value (e.g. a knob that only applies in one mode). */
  visibleWhen?: { key: string; equals: string };
  /**
   * For `control: "connection"` - the connection-catalogue entry id this slot accepts (e.g.
   * "sftp"). Filters the picker to matching connections and pins the inline "new connection" form.
   */
  connectionTypeId?: string;
}

/** A source type the wizard can create, with the fields its config needs. */
export interface CreatableSourceType {
  type: string;
  labelKey: string;
  descriptionKey: string;
  fields: SourceFieldDef[];
}

/**
 * The config a network source (SFTP/FTP/SMB) needs: a stored connection of the matching protocol,
 * the folder to poll, and the same consume/snapshot + recursion choices as a folder source. Shared
 * copy across the three protocols, since only the connection type differs.
 */
function networkSourceFields(connectionTypeId: string): SourceFieldDef[] {
  return [
    {
      key: "connectionId",
      labelKey: "processor.sources.networkFields.connection.label",
      control: "connection",
      connectionTypeId,
      required: true,
      helperTextKey: "processor.sources.networkFields.connection.helperText",
    },
    {
      key: "directory",
      labelKey: "processor.sources.networkFields.directory.label",
      control: "text",
      placeholderKey: "processor.sources.networkFields.directory.placeholder",
      helperTextKey: "processor.sources.networkFields.directory.helperText",
    },
    {
      key: "mode",
      labelKey: "processor.sources.networkFields.mode.label",
      control: "select",
      defaultValue: "consume",
      helperTextKey: "processor.sources.networkFields.mode.helperText",
      advanced: true,
      options: [
        {
          value: "consume",
          labelKey: "processor.sources.networkFields.mode.options.consume",
        },
        {
          value: "snapshot",
          labelKey: "processor.sources.networkFields.mode.options.snapshot",
        },
      ],
    },
    {
      key: "recursive",
      labelKey: "processor.sources.networkFields.recursive.label",
      control: "select",
      defaultValue: "false",
      helperTextKey: "processor.sources.networkFields.recursive.helperText",
      options: [
        {
          value: "false",
          labelKey: "processor.sources.networkFields.recursive.options.top",
        },
        {
          value: "true",
          labelKey: "processor.sources.networkFields.recursive.options.all",
        },
      ],
    },
  ];
}

export const CREATABLE_SOURCE_TYPES: CreatableSourceType[] = [
  {
    type: "folder",
    labelKey: "processor.sources.types.folder.label",
    descriptionKey: "processor.sources.types.folder.description",
    fields: [
      {
        key: "directory",
        labelKey: "processor.sources.types.folder.fields.directory.label",
        control: "text",
        required: true,
        placeholderKey:
          "processor.sources.types.folder.fields.directory.placeholder",
        helperTextKey:
          "processor.sources.types.folder.fields.directory.helperText",
      },
      {
        key: "mode",
        labelKey: "processor.sources.types.folder.fields.mode.label",
        control: "select",
        defaultValue: "consume",
        helperTextKey: "processor.sources.types.folder.fields.mode.helperText",
        advanced: true,
        options: [
          {
            value: "consume",
            labelKey:
              "processor.sources.types.folder.fields.mode.options.consume",
          },
          {
            value: "snapshot",
            labelKey:
              "processor.sources.types.folder.fields.mode.options.snapshot",
          },
        ],
      },
      {
        key: "recursive",
        labelKey: "processor.sources.types.folder.fields.recursive.label",
        control: "select",
        defaultValue: "false",
        helperTextKey:
          "processor.sources.types.folder.fields.recursive.helperText",
        options: [
          {
            value: "false",
            labelKey:
              "processor.sources.types.folder.fields.recursive.options.top",
          },
          {
            value: "true",
            labelKey:
              "processor.sources.types.folder.fields.recursive.options.all",
          },
        ],
      },
      {
        key: "identity",
        labelKey: "processor.sources.types.folder.fields.identity.label",
        control: "select",
        defaultValue: "stat",
        helperTextKey: "processor.sources.types.folder.fields.identity.helperText",
        advanced: true,
        // Change detection only governs the consume ledger; snapshot re-reads everything regardless.
        visibleWhen: { key: "mode", equals: "consume" },
        options: [
          {
            value: "stat",
            labelKey:
              "processor.sources.types.folder.fields.identity.options.stat",
          },
          {
            value: "hash",
            labelKey:
              "processor.sources.types.folder.fields.identity.options.hash",
          },
        ],
      },
    ],
  },
  {
    type: "s3",
    labelKey: "processor.sources.types.s3.label",
    descriptionKey: "processor.sources.types.s3.description",
    fields: [
      {
        key: "connectionId",
        labelKey: "processor.sources.types.s3.fields.connection.label",
        control: "s3Connection",
        required: true,
        helperTextKey:
          "processor.sources.types.s3.fields.connection.helperText",
      },
      {
        key: "prefix",
        labelKey: "processor.sources.types.s3.fields.prefix.label",
        control: "text",
        placeholderKey: "processor.sources.types.s3.fields.prefix.placeholder",
        helperTextKey: "processor.sources.types.s3.fields.prefix.helperText",
      },
      {
        key: "mode",
        labelKey: "processor.sources.types.s3.fields.mode.label",
        control: "select",
        defaultValue: "consume",
        helperTextKey: "processor.sources.types.s3.fields.mode.helperText",
        advanced: true,
        options: [
          {
            value: "consume",
            labelKey: "processor.sources.types.s3.fields.mode.options.consume",
          },
          {
            value: "snapshot",
            labelKey: "processor.sources.types.s3.fields.mode.options.snapshot",
          },
        ],
      },
    ],
  },
  {
    type: "sftp",
    labelKey: "processor.sources.types.sftp.label",
    descriptionKey: "processor.sources.types.sftp.description",
    fields: networkSourceFields("sftp"),
  },
  {
    type: "ftp",
    labelKey: "processor.sources.types.ftp.label",
    descriptionKey: "processor.sources.types.ftp.description",
    fields: networkSourceFields("ftp"),
  },
  {
    type: "network",
    labelKey: "processor.sources.types.network.label",
    descriptionKey: "processor.sources.types.network.description",
    fields: networkSourceFields("smb"),
  },
  {
    type: WEBHOOK_SOURCE_TYPE,
    labelKey: "processor.sources.types.webhook.label",
    descriptionKey: "processor.sources.types.webhook.description",
    fields: [],
  },
];

/** A source type on the roadmap: shown greyed out in the picker, not creatable. */
export interface ComingSoonSourceType {
  type: string;
  labelKey: string;
  descriptionKey: string;
}

/**
 * Connectors we intend to support, listed so the picker answers "do you
 * support X?" honestly instead of hiding the roadmap. Purely presentational -
 * nothing here can be created and the backend never sees these type strings.
 */
export const COMING_SOON_SOURCE_TYPES: ComingSoonSourceType[] = [
  "sharepoint",
  "onedrive",
  "googledrive",
  "dropbox",
  "box",
  "email",
].map((type) => ({
  type,
  labelKey: `processor.sources.types.${type}.label`,
  descriptionKey: `processor.sources.types.${type}.description`,
}));

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
