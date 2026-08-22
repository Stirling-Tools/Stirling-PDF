/**
 * Adobe Distiller `.joboptions` importer.
 *
 * A .joboptions file is a PostScript fragment whose payload is a single
 * dictionary passed to `setdistillerparams`:
 *
 *   <<
 *     /CompatibilityLevel 1.4
 *     /DownsampleColorImages true
 *     /ColorImageResolution 150
 *     /ColorImageDownsampleType /Bicubic
 *     /EmbedAllFonts true
 *     /NeverEmbed [ /Courier /Symbol ]
 *   >> setdistillerparams
 *
 * Real files wrap this in `%!`/`%%` comments, `currentdistillerparams`
 * lookups and `setpagedevice` blocks, so the parser scans the whole text for
 * dictionaries rather than assuming a fixed layout.
 *
 * The settings are then translated into Automate steps - a `compress` step
 * plus, when the profile declares a standards check, a `convert` step to
 * PDF/A or PDF/X.
 */

import { AutomationOperation } from "@app/types/automation";
import {
  collectTopLevelDicts,
  psBoolean,
  psName,
  psNumber,
  type PsDict,
} from "@app/utils/postscriptObjects";

/**
 * Extract every top-level dictionary in the file and merge them, later keys
 * winning. Distiller profiles put nearly everything in one `setdistillerparams`
 * dictionary but may add a second for `setpagedevice`.
 */
export function parseJobOptions(text: string): PsDict {
  return Object.assign({}, ...collectTopLevelDicts(text)) as PsDict;
}

/** True when the text looks like a Distiller job options file. */
export function looksLikeJobOptions(text: string): boolean {
  const head = text.slice(0, 4096);
  if (!head.includes("<<")) return false;
  return (
    /setdistillerparams|setpagedevice|currentdistillerparams/.test(text) ||
    /\/CompatibilityLevel|\/AutoRotatePages|\/EmbedAllFonts/.test(head)
  );
}

/**
 * The subset of Distiller settings that has a Stirling equivalent, normalised
 * away from PostScript types.
 */
export interface DistillerSettings {
  compatibilityLevel?: number;
  /** Effective colour-image DPI, i.e. only set when downsampling is on. */
  colorImageResolution?: number;
  grayImageResolution?: number;
  monoImageResolution?: number;
  downsampleColorImages?: boolean;
  downsampleGrayImages?: boolean;
  downsampleMonoImages?: boolean;
  embedAllFonts?: boolean;
  subsetFonts?: boolean;
  optimize?: boolean;
  /** `/ColorConversionStrategy`, e.g. "Gray", "sRGB", "LeaveColorUnchanged". */
  colorConversionStrategy?: string;
  /** `/AutoRotatePages`, e.g. "None", "All", "PageByPage". */
  autoRotatePages?: string;
  pdfaCheck?: boolean;
  pdfxCheck?: boolean;
  /** Standards label derived from the *Check keys, e.g. "PDF/X-1a". */
  standard?: "PDF/A-1b" | "PDF/X-1a" | "PDF/X-3";
}

export function readDistillerSettings(dict: PsDict): DistillerSettings {
  const settings: DistillerSettings = {
    compatibilityLevel: psNumber(dict.CompatibilityLevel),
    colorImageResolution: psNumber(dict.ColorImageResolution),
    grayImageResolution: psNumber(dict.GrayImageResolution),
    monoImageResolution: psNumber(dict.MonoImageResolution),
    downsampleColorImages: psBoolean(dict.DownsampleColorImages),
    downsampleGrayImages: psBoolean(dict.DownsampleGrayImages),
    downsampleMonoImages: psBoolean(dict.DownsampleMonoImages),
    embedAllFonts: psBoolean(dict.EmbedAllFonts),
    subsetFonts: psBoolean(dict.SubsetFonts),
    optimize: psBoolean(dict.Optimize),
    colorConversionStrategy: psName(dict.ColorConversionStrategy),
    autoRotatePages: psName(dict.AutoRotatePages),
  };

  // PDF/A-1b and the PDF/X flavours each have their own boolean check key.
  if (psBoolean(dict.PDFA1bCheck) || psBoolean(dict.PDFACompliance)) {
    settings.pdfaCheck = true;
    settings.standard = "PDF/A-1b";
  } else if (psBoolean(dict.PDFX1aCheck)) {
    settings.pdfxCheck = true;
    settings.standard = "PDF/X-1a";
  } else if (psBoolean(dict.PDFX3Check)) {
    settings.pdfxCheck = true;
    settings.standard = "PDF/X-3";
  }

  return settings;
}

// ---------------------------------------------------------------------------
// Mapping to Automate steps
// ---------------------------------------------------------------------------

/**
 * Pick a Stirling compression level from the profile's image resolutions.
 *
 * Stirling's levels are implemented as Ghostscript `-dPDFSETTINGS` presets
 * (see CompressController#applyGhostscriptCompression), which are the same
 * presets Distiller's stock profiles are built on - so the two line up by
 * construction:
 *
 *   1 → /prepress   2 → /printer   3 → /ebook
 *   4-5 → /screen   6-7 → /screen @150dpi   8 → @100dpi   9 → @72dpi
 *
 * Resolution is the signal because it's the one setting every profile
 * carries. Profiles that disable downsampling entirely keep their images at
 * full size, which is the /prepress end of the scale.
 */
export function compressionLevelForResolution(
  settings: DistillerSettings,
): number {
  const downsampling =
    settings.downsampleColorImages !== false ||
    settings.downsampleGrayImages !== false;
  if (!downsampling) return 1;

  const dpi = Math.min(
    settings.colorImageResolution ?? Number.POSITIVE_INFINITY,
    settings.grayImageResolution ?? Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(dpi)) return 3;

  if (dpi >= 300) return 1;
  if (dpi >= 200) return 2;
  if (dpi >= 150) return 3;
  if (dpi >= 110) return 6;
  if (dpi >= 90) return 7;
  if (dpi >= 72) return 8;
  return 9;
}

export interface JobOptionsImportNote {
  /** The Distiller setting this note is about, e.g. "EmbedAllFonts". */
  setting: string;
  message: string;
}

export interface JobOptionsImport {
  name: string;
  description: string;
  operations: AutomationOperation[];
  settings: DistillerSettings;
  /** Settings that could not be carried over, for display after import. */
  notes: JobOptionsImportNote[];
}

/**
 * Derive a display name from the file name, since a .joboptions file carries
 * no name of its own.
 */
const jobOptionsName = (fileName?: string): string => {
  if (!fileName) return "Imported Distiller settings";
  return (
    fileName.replace(/\.joboptions$/i, "").trim() ||
    "Imported Distiller settings"
  );
};

/**
 * Convert parsed Distiller settings into Automate operations.
 *
 * Produces a `compress` step, optionally preceded by `autoRotate` and
 * followed by a `convert` step when the profile enforces a PDF standard.
 */
export function jobOptionsToOperations(settings: DistillerSettings): {
  operations: AutomationOperation[];
  notes: JobOptionsImportNote[];
} {
  const operations: AutomationOperation[] = [];
  const notes: JobOptionsImportNote[] = [];

  // Distiller rotates during conversion; Stirling does it as its own step.
  if (settings.autoRotatePages && settings.autoRotatePages !== "None") {
    operations.push({ operation: "autoRotate", parameters: {} });
  }

  const grayscale =
    settings.colorConversionStrategy === "Gray" ||
    settings.colorConversionStrategy === "DeviceGray";

  operations.push({
    operation: "compress",
    parameters: {
      compressionMethod: "quality",
      compressionLevel: compressionLevelForResolution(settings),
      grayscale,
      // Distiller's "Optimize for fast web view" is linearisation.
      linearize: settings.optimize === true,
    },
  });

  if (settings.standard === "PDF/A-1b") {
    operations.push({
      operation: "convert",
      parameters: {
        fromExtension: "pdf",
        toExtension: "pdfa",
        pdfaOptions: { outputFormat: "pdfa-1b", strict: false },
      },
    });
  } else if (settings.pdfxCheck) {
    operations.push({
      operation: "convert",
      parameters: {
        fromExtension: "pdf",
        toExtension: "pdfx",
        pdfxOptions: { outputFormat: "pdfx" },
      },
    });
    notes.push({
      setting: "PDFXOutputIntentProfile",
      message: `${settings.standard} was requested. Stirling converts to PDF/X but does not apply the profile's output intent - set that in the conversion step if you need it.`,
    });
  }

  // Font embedding and colour management are properties of PDF generation,
  // not of an existing PDF, so there is nothing to map them onto.
  if (settings.embedAllFonts === false) {
    notes.push({
      setting: "EmbedAllFonts",
      message:
        "This profile does not embed all fonts. Stirling never strips fonts during compression, so the setting has no equivalent.",
    });
  }
  if (
    settings.colorConversionStrategy &&
    !grayscale &&
    settings.colorConversionStrategy !== "LeaveColorUnchanged"
  ) {
    notes.push({
      setting: "ColorConversionStrategy",
      message: `Colour conversion to ${settings.colorConversionStrategy} is not carried over; only conversion to greyscale has an equivalent.`,
    });
  }
  if (settings.compatibilityLevel !== undefined) {
    notes.push({
      setting: "CompatibilityLevel",
      message: `Target PDF version ${settings.compatibilityLevel.toFixed(1)} is not enforced - Stirling preserves the input document's version.`,
    });
  }

  return { operations, notes };
}

/**
 * Full pipeline: raw .joboptions text to an importable automation.
 *
 * @param fileName Used for the automation name, since the format carries none.
 */
export function importJobOptions(
  text: string,
  fileName?: string,
): JobOptionsImport {
  const dict = parseJobOptions(text);
  if (Object.keys(dict).length === 0) {
    throw new Error(
      "No Distiller settings dictionary found. Expected a PostScript '<< ... >> setdistillerparams' block.",
    );
  }
  const settings = readDistillerSettings(dict);
  const { operations, notes } = jobOptionsToOperations(settings);

  const name = jobOptionsName(fileName);
  const standardSuffix = settings.standard ? `, ${settings.standard}` : "";
  return {
    name,
    description: `Imported from Adobe Distiller job options (compression level ${compressionLevelForResolution(settings)}${standardSuffix}).`,
    operations,
    settings,
    notes,
  };
}
