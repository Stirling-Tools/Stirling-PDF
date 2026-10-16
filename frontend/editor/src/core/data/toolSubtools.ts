import type { TFunction } from "i18next";
import type { ToolId } from "@app/types/toolId";
import type { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import {
  CONVERSION_MATRIX,
  FROM_FORMAT_OPTIONS,
  TO_FORMAT_OPTIONS,
} from "@app/constants/convertConstants";

/**
 * A subtool: one tool opened with some of its settings already chosen —
 * "Convert PDF to PNG" is Convert with from/to set. Search offers them, and
 * `/<tool>?preset=<slug>` links open them; the tool applies `params` on open
 * (see toolPresetRequests).
 */
export interface ToolSubtool {
  toolId: ToolId;
  /** Unique within the tool; the `?preset=` value. */
  slug: string;
  title: (t: TFunction) => string;
  /** What only this subtool answers to — not the parent tool's own name. */
  terms: string[];
  /** A partial of the tool's parameters. */
  params: Record<string, unknown>;
  /** Source/target format, for conversion availability. */
  conversion?: { from: string; to: string };
}

const FORMAT_LABELS = new Map(
  [...FROM_FORMAT_OPTIONS, ...TO_FORMAT_OPTIONS].map((option) => [
    option.value,
    option.label,
  ]),
);

// Names people search formats by besides the extension. Product and format
// names, so they hold across languages.
const FORMAT_ALIASES: Partial<Record<string, string[]>> = {
  docx: ["word"],
  doc: ["word"],
  odt: ["opendocument"],
  xlsx: ["excel"],
  xls: ["excel"],
  ods: ["opendocument"],
  pptx: ["powerpoint"],
  ppt: ["powerpoint"],
  odp: ["opendocument"],
  md: ["markdown"],
  jpg: ["jpeg"],
  jpeg: ["jpg"],
  tiff: ["tif"],
  msg: ["outlook"],
  azw3: ["kindle"],
  mobi: ["kindle"],
  pdfa: ["pdf/a"],
  pdfx: ["pdf/x"],
  pdfua: ["pdf/ua"],
};

/** Source "formats" that are really detection buckets, not one format. */
const GENERIC_SOURCES = new Set(["any", "image"]);

const formatLabel = (ext: string) =>
  FORMAT_LABELS.get(ext) ?? ext.toUpperCase();
const formatNames = (ext: string) => [
  ext,
  formatLabel(ext).toLowerCase(),
  ...(FORMAT_ALIASES[ext] ?? []),
];

function conversionTerms(from: string, to: string): string[] {
  const terms = new Set<string>();
  for (const fromName of formatNames(from)) {
    for (const toName of formatNames(to)) {
      terms.add(`${fromName} to ${toName}`);
    }
  }
  // The formats on their own too ("png" alone means a PNG conversion),
  // except PDF, which is on one side of every pair.
  for (const ext of [from, to]) {
    if (ext !== "pdf") formatNames(ext).forEach((name) => terms.add(name));
  }
  return [...terms];
}

function convertSubtool(
  from: string,
  to: string,
  slug = `${from}-to-${to}`,
  toLabel = formatLabel(to),
  extraParams: Record<string, unknown> = {},
  extraTerms: string[] = [],
): ToolSubtool {
  return {
    toolId: "convert",
    slug,
    title: (t) =>
      t("superSearch.subtool.convert", "Convert {{from}} to {{to}}", {
        from: formatLabel(from),
        to: toLabel,
      }),
    terms: [...conversionTerms(from, to), ...extraTerms],
    params: { fromExtension: from, toExtension: to, ...extraParams },
    conversion: { from, to },
  };
}

// PDF/A is offered per conformance level rather than as one pair: the level
// is the choice people search for ("PDF/A-2b"). Values are the PDF/A
// settings' own; level 1 is stored as "pdfa-1".
const PDFA_LEVELS = [
  { level: "1b", outputFormat: "pdfa-1" },
  { level: "2b", outputFormat: "pdfa-2b" },
  { level: "3b", outputFormat: "pdfa-3b" },
];

const CONVERT_SUBTOOLS: ToolSubtool[] = [
  ...Object.entries(CONVERSION_MATRIX).flatMap(([from, targets]) =>
    GENERIC_SOURCES.has(from)
      ? []
      : targets
          .filter((to) => !(from === "pdf" && to === "pdfa"))
          .map((to) => convertSubtool(from, to)),
  ),
  ...PDFA_LEVELS.map(({ level, outputFormat }) =>
    convertSubtool(
      "pdf",
      "pdfa",
      `pdf-to-pdfa-${level}`,
      `PDF/A-${level}`,
      { pdfaOptions: { outputFormat, strict: false } },
      [`pdf/a-${level}`, `pdfa-${level}`, `pdfa ${level}`],
    ),
  ),
];

export const TOOL_SUBTOOLS: readonly ToolSubtool[] = CONVERT_SUBTOOLS;

const SUBTOOL_BY_KEY = new Map(
  TOOL_SUBTOOLS.map((subtool) => [
    `${subtool.toolId}:${subtool.slug}`,
    subtool,
  ]),
);

export function getToolSubtool(
  toolId: ToolId,
  slug: string,
): ToolSubtool | undefined {
  return SUBTOOL_BY_KEY.get(`${toolId}:${slug}`);
}

/** A Convert subtool's settings, typed for the Convert tool. */
export function getConvertPreset(
  slug: string,
): Partial<ConvertParameters> | undefined {
  return getToolSubtool("convert", slug)?.params;
}
