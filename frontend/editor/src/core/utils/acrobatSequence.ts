/**
 * Adobe Acrobat Action Wizard (`.sequ`) importer.
 *
 * An Action file is XML in the `http://ns.adobe.com/acrobat/workflow/2012`
 * namespace:
 *
 *   <Workflow title="…" description="…">
 *     <Sources defaultCommand="WorkflowPlaybackSelectFile"/>
 *     <Group label="Step 1">
 *       <Instruction label="Free text shown to the operator"/>
 *       <Command name="Cpt:CapturePages" pauseBefore="false" promptUser="false">
 *         <Items>
 *           <Item name="Language" type="integer" value="26"/>
 *           <Items name="LeaveAsIs"><Item name="Title" type="boolean" value="true"/></Items>
 *         </Items>
 *       </Command>
 *     </Group>
 *   </Workflow>
 *
 * Adobe does not publish the command vocabulary, so the mapping below is
 * built from observed Action files. Every step is reported with a confidence
 * so the import summary can distinguish a command we recognise exactly from
 * one matched on a keyword, and from one that has no Stirling equivalent at
 * all. Nothing is silently dropped.
 */

import { AutomationOperation } from "@app/types/automation";
import { ToolRegistry } from "@app/data/toolsTaxonomy";
import { ToolId } from "@app/types/toolId";

// ---------------------------------------------------------------------------
// Raw XML model
// ---------------------------------------------------------------------------

/** A parsed `<Item>` tree. Nested `<Items name="…">` become nested records. */
export type AcrobatItems = {
  [key: string]: string | number | boolean | null | AcrobatItems;
};

export interface AcrobatCommand {
  /** Raw command name, e.g. "CALS:Preflight". */
  name: string;
  /** Label of the enclosing `<Group>`, used for display. */
  groupLabel: string;
  items: AcrobatItems;
  /** Acrobat opens this command's dialog at run time. */
  promptUser: boolean;
  pauseBefore: boolean;
}

export interface AcrobatSequence {
  title: string;
  description: string;
  commands: AcrobatCommand[];
  /** `<Instruction>` text - operator notes, not processing steps. */
  instructions: string[];
  /** True when the Action reads a whole folder rather than one file. */
  sourceIsFolder: boolean;
}

const ACROBAT_WORKFLOW_NS = "http://ns.adobe.com/acrobat/workflow/2012";

/** Coerce an `<Item type="…" value="…">` pair to a JS value. */
function coerceItemValue(type: string | null, value: string | null) {
  if (type === "null") return null;
  if (value === null) return null;
  switch (type) {
    case "boolean":
      return value === "true";
    case "integer":
    case "double": {
      const num = Number(value);
      return Number.isFinite(num) ? num : value;
    }
    default:
      return value;
  }
}

/** Read an `<Items>` element into a plain record, recursing into sub-groups. */
function readItems(container: Element): AcrobatItems {
  const items: AcrobatItems = {};
  for (const child of Array.from(container.children)) {
    const name = child.getAttribute("name");
    if (!name) continue;
    if (child.localName === "Items") {
      items[name] = readItems(child);
    } else if (child.localName === "Item") {
      items[name] = coerceItemValue(
        child.getAttribute("type"),
        child.getAttribute("value"),
      );
    }
  }
  return items;
}

/**
 * Parse `.sequ` XML into its command list.
 *
 * @throws if the document is not well-formed XML or is not an Acrobat Action.
 */
export function parseAcrobatSequenceXml(xmlText: string): AcrobatSequence {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");

  // DOMParser reports XML syntax errors as a <parsererror> element rather
  // than throwing.
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new Error(
      `File is not valid XML: ${parserError.textContent?.trim().split("\n")[0] ?? "unknown error"}`,
    );
  }

  const root = doc.documentElement;
  if (!root || root.localName !== "Workflow") {
    throw new Error(
      "Not an Acrobat Action file: expected a <Workflow> root element.",
    );
  }
  if (root.namespaceURI && root.namespaceURI !== ACROBAT_WORKFLOW_NS) {
    throw new Error(
      `Unexpected Action namespace "${root.namespaceURI}". Only Acrobat X and later Actions are supported.`,
    );
  }

  const commands: AcrobatCommand[] = [];
  const instructions: string[] = [];

  for (const group of Array.from(root.children)) {
    if (group.localName !== "Group") continue;
    const groupLabel = group.getAttribute("label") ?? "";
    for (const node of Array.from(group.children)) {
      if (node.localName === "Instruction") {
        const label = node.getAttribute("label");
        if (label) instructions.push(label);
        continue;
      }
      if (node.localName !== "Command") continue;
      const name = node.getAttribute("name");
      if (!name) continue;

      const itemsEl = Array.from(node.children).find(
        (child) => child.localName === "Items",
      );
      commands.push({
        name,
        groupLabel,
        items: itemsEl ? readItems(itemsEl) : {},
        promptUser: node.getAttribute("promptUser") === "true",
        pauseBefore: node.getAttribute("pauseBefore") === "true",
      });
    }
  }

  const sources = Array.from(root.children).find(
    (child) => child.localName === "Sources",
  );

  return {
    title: root.getAttribute("title") ?? "",
    description: root.getAttribute("description") ?? "",
    commands,
    instructions,
    sourceIsFolder:
      sources?.getAttribute("defaultCommand") ===
      "WorkflowPlaybackSelectFolder",
  };
}

/** True when the text looks like an Acrobat Action file. */
export function looksLikeAcrobatSequence(text: string): boolean {
  const head = text.slice(0, 2048);
  return (
    head.includes(ACROBAT_WORKFLOW_NS) ||
    (/<Workflow[\s>]/.test(head) && /<Group[\s>]/.test(text))
  );
}

// ---------------------------------------------------------------------------
// Command mapping
// ---------------------------------------------------------------------------

/**
 * How a command was matched:
 * - `exact`    - a known Acrobat command with a translated parameter set
 * - `heuristic`- matched on a keyword in the command name; verify the settings
 * - `manual`   - recognised, but the work has to be redone by hand
 * - `skipped`  - deliberately dropped (no-op in Stirling)
 */
export type AcrobatMappingConfidence =
  | "exact"
  | "heuristic"
  | "manual"
  | "skipped";

export interface AcrobatStepMapping {
  command: string;
  groupLabel: string;
  confidence: AcrobatMappingConfidence;
  /** Set for `exact` and `heuristic` mappings. */
  toolId?: ToolId;
  parameters?: Record<string, unknown>;
  /** Why this step needs attention, shown in the import summary. */
  note?: string;
}

type MappedStep = { toolId: ToolId; parameters: Record<string, unknown> };

type HandlerResult =
  | { kind: "tools"; steps: MappedStep[]; note?: string }
  | { kind: "manual"; note: string }
  | { kind: "skipped"; note: string };

type CommandHandler = (command: AcrobatCommand) => HandlerResult;

const num = (items: AcrobatItems, key: string): number | undefined => {
  const value = items[key];
  return typeof value === "number" ? value : undefined;
};

const bool = (items: AcrobatItems, key: string): boolean | undefined => {
  const value = items[key];
  return typeof value === "boolean" ? value : undefined;
};

const str = (items: AcrobatItems, key: string): string | undefined => {
  const value = items[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const sub = (items: AcrobatItems, key: string): AcrobatItems => {
  const value = items[key];
  return value && typeof value === "object" ? (value as AcrobatItems) : {};
};

/**
 * `WorkflowPlaybackSaveFiles` is Acrobat's save step, but the output *format*
 * lives in `HandlerUniqueID` - so "Save" is really "convert" whenever the
 * handler is not the plain PDF writer.
 */
const SAVE_HANDLER_TO_EXTENSION: Record<string, string> = {
  "com.adobe.acrobat.plain-text": "txt",
  "com.adobe.acrobat.accesstext": "txt",
  "com.adobe.acrobat.rtf": "rtf",
  "com.adobe.acrobat.doc": "docx",
  "com.adobe.acrobat.docx": "docx",
  "com.adobe.acrobat.word": "docx",
  "com.adobe.acrobat.xlsx": "xlsx",
  "com.adobe.acrobat.spreadsheet": "xlsx",
  "com.adobe.acrobat.pptx": "pptx",
  "com.adobe.acrobat.jpeg": "jpg",
  "com.adobe.acrobat.jpeg2000": "jpg",
  "com.adobe.acrobat.png": "png",
  "com.adobe.acrobat.tiff": "tiff",
  "com.adobe.acrobat.bmp": "bmp",
  "com.adobe.acrobat.xml-1-00": "xml",
  "com.adobe.acrobat.html": "html",
  "com.adobe.acrobat.xhtml": "html",
};

/** Acrobat's `/OPACITY` and colour components are 0..1; ours are 0..100 / hex. */
const toPercent = (value: number | undefined): number | undefined =>
  value === undefined
    ? undefined
    : Math.round(Math.max(0, Math.min(1, value)) * 100);

const toHexColor = (
  r: number | undefined,
  g: number | undefined,
  b: number | undefined,
): string | undefined => {
  if (r === undefined || g === undefined || b === undefined) return undefined;
  const channel = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
};

const handleSaveFiles: CommandHandler = (command) => {
  const handler = str(command.items, "HandlerUniqueID");
  const runOptimizer = bool(command.items, "RunPDFOptimizer") === true;

  // The callas preflight PDF/A writer is Acrobat's "Save as PDF/A".
  if (handler === "com.callas.preflight.pdfa") {
    return {
      kind: "tools",
      steps: [
        {
          toolId: "convert",
          parameters: {
            fromExtension: "pdf",
            toExtension: "pdfa",
            pdfaOptions: { outputFormat: "pdfa-2b", strict: false },
          },
        },
      ],
    };
  }

  const extension = handler ? SAVE_HANDLER_TO_EXTENSION[handler] : undefined;
  if (extension) {
    return {
      kind: "tools",
      steps: [
        {
          toolId: "convert",
          parameters: { fromExtension: "pdf", toExtension: extension },
        },
      ],
    };
  }

  if (runOptimizer) {
    return {
      kind: "tools",
      steps: [
        {
          toolId: "compress",
          parameters: { compressionMethod: "quality", compressionLevel: 5 },
        },
      ],
      note: `Acrobat ran the PDF Optimizer with the "${str(command.items, "PresetName") ?? "default"}" preset. Mapped to compression level 5 - adjust to taste.`,
    };
  }

  return {
    kind: "skipped",
    note: "Acrobat's Save step. Automate returns the processed file, so no explicit save is needed.",
  };
};

const handleGeneralInfo: CommandHandler = (command) => {
  // `LeaveAsIs` marks the fields Acrobat should not touch.
  const leaveAsIs = sub(command.items, "LeaveAsIs");
  const parameters: Record<string, unknown> = {};
  const fields = ["Title", "Author", "Subject", "Keywords"] as const;
  for (const field of fields) {
    if (leaveAsIs[field] === true) continue;
    const value = str(command.items, field);
    if (value !== undefined) parameters[field.toLowerCase()] = value;
  }
  if (Object.keys(parameters).length === 0) {
    return {
      kind: "skipped",
      note: "Document metadata step left every field unchanged.",
    };
  }
  return {
    kind: "tools",
    steps: [{ toolId: "changeMetadata", parameters }],
  };
};

const handleAddWatermark: CommandHandler = (command) => {
  const wm = sub(command.items, "WaterBackCmd");
  if (bool(wm, "FROM_FILE") === true) {
    return {
      kind: "manual",
      note: "Image watermark: Acrobat referenced an external image file that is not stored in the Action. Re-select the image in the Watermark tool.",
    };
  }
  const parameters: Record<string, unknown> = { watermarkType: "text" };
  const text = str(wm, "SRCTEXT");
  if (text !== undefined) parameters.watermarkText = text;
  const fontSize = num(wm, "FONT_SIZE");
  if (fontSize !== undefined) parameters.fontSize = fontSize;
  const rotation = num(wm, "ROTATION");
  if (rotation !== undefined) parameters.rotation = rotation;
  const opacity = toPercent(num(wm, "OPACITY"));
  if (opacity !== undefined) parameters.opacity = opacity;
  // Only DeviceRGB maps cleanly; CMYK jobs keep the tool default.
  if (str(wm, "COLORSPACE") === "DeviceRGB") {
    const color = toHexColor(
      num(wm, "COLOR1"),
      num(wm, "COLOR2"),
      num(wm, "COLOR3"),
    );
    if (color) parameters.customColor = color;
  }

  const isBackground = bool(wm, "BACKGROUND") === true;
  return {
    kind: "tools",
    steps: [{ toolId: "watermark", parameters }],
    note: isBackground
      ? "Acrobat placed this behind the page content. Stirling's watermark always draws on top."
      : undefined,
  };
};

const handleScanOptimize: CommandHandler = (command) => {
  const steps: MappedStep[] = [];
  // Acrobat's scan-optimisation quality slider runs 1 (smallest file) to 4
  // (highest quality); Stirling's level runs the other way, 1..9.
  const qualityLevel = num(command.items, "QualityLevel");
  const compressionLevel =
    qualityLevel === undefined
      ? 5
      : ({ 1: 8, 2: 6, 3: 4, 4: 2 }[Math.round(qualityLevel)] ?? 5);
  steps.push({
    toolId: "compress",
    parameters: { compressionMethod: "quality", compressionLevel },
  });
  if (bool(command.items, "doOCR") === true) {
    steps.push({ toolId: "ocr", parameters: { ocrType: "skip-text" } });
  }
  return {
    kind: "tools",
    steps,
    note: "Optimise Scanned Pages mapped to compression; deskew, descreen and background removal have no Stirling equivalent.",
  };
};

const handlePreflight: CommandHandler = (command) => {
  const profile = str(command.items, "CALS_PREFLIGHT_CMD_PROFILE_NAME");
  const label = profile ?? "unnamed profile";
  const normalized = (profile ?? "").toLowerCase();

  // The stock "Convert to PDF/A" and "Convert to PDF/X" profiles have direct
  // equivalents; everything else is a rules engine we can't reproduce.
  if (normalized.includes("pdf/a") || normalized.includes("pdfa")) {
    return {
      kind: "tools",
      steps: [
        {
          toolId: "convert",
          parameters: {
            fromExtension: "pdf",
            toExtension: "pdfa",
            pdfaOptions: { outputFormat: "pdfa-2b", strict: false },
          },
        },
      ],
      note: `Preflight profile "${label}" mapped to PDF/A conversion.`,
    };
  }
  if (normalized.includes("pdf/x") || normalized.includes("pdfx")) {
    return {
      kind: "tools",
      steps: [
        {
          toolId: "convert",
          parameters: {
            fromExtension: "pdf",
            toExtension: "pdfx",
            pdfxOptions: { outputFormat: "pdfx" },
          },
        },
      ],
      note: `Preflight profile "${label}" mapped to PDF/X conversion.`,
    };
  }
  return {
    kind: "manual",
    note: `Preflight profile "${label}" runs callas checks and fixups that are stored outside the Action file. Rebuild the equivalent checks as a compliance policy.`,
  };
};

const handleJavaScript: CommandHandler = (command) => {
  const scriptName = str(command.items, "ScriptName");
  const code = str(command.items, "ScriptCode") ?? "";
  const firstLine = code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("//"));
  const label = scriptName || firstLine || "unnamed script";
  return {
    kind: "manual",
    note: `Acrobat JavaScript step (${label}). Stirling does not run Acrobat's JS API - reimplement the logic with tools or the API.`,
  };
};

const manual =
  (note: string): CommandHandler =>
  () => ({ kind: "manual", note });
const skipped =
  (note: string): CommandHandler =>
  () => ({ kind: "skipped", note });
const simple =
  (
    toolId: ToolId,
    parameters: Record<string, unknown> = {},
    note?: string,
  ): CommandHandler =>
  () => ({ kind: "tools", steps: [{ toolId, parameters }], note });

/**
 * Acrobat command name to Stirling tool. Built from observed `.sequ` files -
 * Adobe publishes no command reference, so unknown names fall through to the
 * keyword heuristics below rather than failing the import.
 */
const COMMAND_HANDLERS: Record<string, CommandHandler> = {
  WorkflowPlaybackSaveFiles: handleSaveFiles,
  GeneralInfo: handleGeneralInfo,
  "COMP:AddWatermark": handleAddWatermark,
  "Scan:OPT": handleScanOptimize,
  "CALS:Preflight": handlePreflight,
  JavaScript: handleJavaScript,

  DeleteAll: simple("removeAnnotations"),
  "Annots:DeleteAll": simple("removeAnnotations"),
  "DIGSIG:SanitizeDocument": simple(
    "sanitize",
    {
      removeJavaScript: true,
      removeEmbeddedFiles: true,
      removeMetadata: true,
      removeXMPMetadata: true,
      removeLinks: true,
    },
    "Acrobat's Sanitize Document removes all hidden information; every Stirling sanitise option was enabled to match.",
  ),
  "Cpt:CapturePages": simple(
    "ocr",
    { ocrType: "skip-text" },
    "OCR language is stored as an Acrobat-internal index and cannot be translated - set the language on the OCR step.",
  ),
  SearchAndRedactCmd: simple(
    "redact",
    { mode: "automatic" },
    "Search terms are entered interactively in Acrobat and are not saved in the Action - add the words to redact.",
  ),

  OpenInfo: skipped(
    "Initial view settings (page layout, window options) have no Stirling equivalent.",
  ),
  CreateAllThumbs: skipped(
    "Page thumbnails are generated on demand, so embedding them is unnecessary.",
  ),

  PagesApp: manual(
    "Page operations (insert, extract, replace, crop, rotate) are configured in Acrobat's dialog and are not stored in the Action. Rebuild them with the page tools.",
  ),
  "Adobe:MakeAccessible": manual(
    "The Make Accessible action runs Acrobat's tagging wizard. Stirling has no tag-generation equivalent.",
  ),
  "AccCheck:DoCheck": manual(
    "Accessibility Full Check has no Stirling equivalent.",
  ),
  SetTabOrder: manual(
    "Tab order is set by Acrobat's tagging engine and has no Stirling equivalent.",
  ),
  SetReadingLanguage: manual(
    "Document reading language has no Stirling equivalent.",
  ),
};

/**
 * Keyword fallbacks for command names we have not catalogued. Ordered - the
 * first substring that appears in the command name wins, so more specific
 * keywords must come first.
 */
const HEURISTIC_KEYWORDS: Array<[needle: string, toolId: ToolId]> = [
  ["watermark", "watermark"],
  ["background", "watermark"],
  ["bates", "addPageNumbers"],
  ["pagenumber", "addPageNumbers"],
  ["headerfooter", "addPageNumbers"],
  ["header", "addPageNumbers"],
  ["footer", "addPageNumbers"],
  ["redact", "redact"],
  ["sanitiz", "sanitize"],
  ["flatten", "flatten"],
  ["attach", "addAttachments"],
  ["metadata", "changeMetadata"],
  ["docinfo", "changeMetadata"],
  ["encrypt", "addPassword"],
  ["security", "addPassword"],
  ["password", "addPassword"],
  ["optimiz", "compress"],
  ["compress", "compress"],
  ["reduce", "compress"],
  ["ocr", "ocr"],
  ["recognize", "ocr"],
  ["recognise", "ocr"],
  ["rotate", "rotate"],
  ["crop", "crop"],
  ["split", "split"],
  ["merge", "merge"],
  ["combine", "merge"],
  ["stamp", "addStamp"],
  ["sign", "sign"],
];

function heuristicMatch(commandName: string): ToolId | undefined {
  const normalized = commandName.toLowerCase().replace(/[^a-z]/g, "");
  for (const [needle, toolId] of HEURISTIC_KEYWORDS) {
    if (normalized.includes(needle)) return toolId;
  }
  return undefined;
}

/**
 * Map one Acrobat command onto zero or more Stirling steps.
 *
 * Exported for the import summary, which lists every command and what became
 * of it.
 */
export function mapAcrobatCommand(
  command: AcrobatCommand,
): AcrobatStepMapping[] {
  const handler: CommandHandler | undefined =
    Object.prototype.hasOwnProperty.call(COMMAND_HANDLERS, command.name)
      ? COMMAND_HANDLERS[command.name]
      : undefined;
  const result: HandlerResult = handler
    ? handler(command)
    : (() => {
        const toolId = heuristicMatch(command.name);
        if (toolId) {
          return {
            kind: "tools",
            steps: [{ toolId, parameters: {} }],
            note: `Matched "${command.name}" to the ${toolId} tool by name. Acrobat's settings for this command could not be translated - check the step's configuration.`,
          } satisfies HandlerResult;
        }
        return {
          kind: "manual",
          note: `Unrecognised Acrobat command "${command.name}". No Stirling equivalent was found.`,
        } satisfies HandlerResult;
      })();

  // Commands run with promptUser="true" have no stored settings at all -
  // Acrobat asks the operator each time. Always flag those.
  const interactiveNote = command.promptUser
    ? "This step opened a dialog in Acrobat, so its settings were never saved in the Action file."
    : undefined;
  const joinNotes = (note?: string) =>
    [note, interactiveNote].filter(Boolean).join(" ") || undefined;

  if (result.kind === "manual") {
    return [
      {
        command: command.name,
        groupLabel: command.groupLabel,
        confidence: "manual",
        note: joinNotes(result.note),
      },
    ];
  }
  if (result.kind === "skipped") {
    return [
      {
        command: command.name,
        groupLabel: command.groupLabel,
        confidence: "skipped",
        note: joinNotes(result.note),
      },
    ];
  }

  const confidence: AcrobatMappingConfidence = handler ? "exact" : "heuristic";
  return result.steps.map((step, index) => ({
    command: command.name,
    groupLabel: command.groupLabel,
    confidence,
    toolId: step.toolId,
    parameters: step.parameters,
    // Attach the note to the first emitted step only, so a command that
    // expands into two steps doesn't repeat itself in the summary.
    note: index === 0 ? joinNotes(result.note) : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface AcrobatSequenceImport {
  name: string;
  description: string;
  operations: AutomationOperation[];
  /** One entry per command in the Action, in file order. */
  mappings: AcrobatStepMapping[];
  /** `<Instruction>` text from the Action, preserved for the user. */
  instructions: string[];
}

/**
 * Parse and map a `.sequ` file into an importable automation.
 *
 * Mapped steps are merged over the tool's registry defaults so the resulting
 * automation is runnable without opening every step.
 */
export function importAcrobatSequence(
  xmlText: string,
  toolRegistry: Partial<ToolRegistry>,
  fileName?: string,
): AcrobatSequenceImport {
  const sequence = parseAcrobatSequenceXml(xmlText);
  const mappings = sequence.commands.flatMap(mapAcrobatCommand);

  const operations: AutomationOperation[] = mappings
    .filter((mapping) => mapping.toolId)
    .map((mapping) => {
      const defaults =
        toolRegistry[mapping.toolId as ToolId]?.operationConfig
          ?.defaultParameters ?? {};
      return {
        operation: mapping.toolId as string,
        parameters: { ...defaults, ...(mapping.parameters ?? {}) },
      };
    });

  const name =
    sequence.title.trim() ||
    fileName?.replace(/\.sequ$/i, "").trim() ||
    "Imported Acrobat Action";

  return {
    name,
    description: sequence.description.trim(),
    operations,
    mappings,
    instructions: sequence.instructions,
  };
}
