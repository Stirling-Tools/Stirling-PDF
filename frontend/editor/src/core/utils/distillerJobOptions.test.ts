/**
 * Unit tests for the Adobe Distiller .joboptions importer.
 *
 * The fixtures below are verbatim excerpts of real Distiller profiles, so the
 * parser is exercised against Adobe's actual output shape (nested image
 * dictionaries, arrays, parenthesised description strings and the trailing
 * `setpagedevice` block) rather than a tidied-up approximation.
 */

import { describe, test, expect } from "vitest";
import {
  compressionLevelForResolution,
  importJobOptions,
  jobOptionsToOperations,
  looksLikeJobOptions,
  parseJobOptions,
  readDistillerSettings,
} from "@app/utils/distillerJobOptions";
import { PsName } from "@app/utils/postscriptObjects";

/** Excerpt of a real print-quality profile (300 dpi, no colour conversion). */
const PRINT_PROFILE = `<<
  /ASCII85EncodePages false
  /AllowPSXObjects false
  /AlwaysEmbed [
    true
  ]
  /AutoRotatePages /None
  /Binding /Left
  /CalGrayProfile (Dot Gain 20%)
  /CheckCompliance [
    /None
  ]
  /ColorACSImageDict <<
    /HSamples [
      1
      1
      1
      1
    ]
    /QFactor 0.15000
  >>
  /ColorConversionStrategy /LeaveColorUnchanged
  /ColorImageResolution 300
  /CompatibilityLevel 1.3
  /Description <<
    /ENU ([Based on 'Lulu'] Use these settings to create Adobe PDF documents best suited for Lulu's printing.)
  >>
  /DownsampleColorImages true
  /DownsampleGrayImages true
  /DownsampleMonoImages true
  /EmbedAllFonts true
  /GrayImageResolution 300
  /MonoImageResolution 1200
  /Optimize true
  /SubsetFonts true
  /sRGBProfile (sRGB IEC61966-2.1)
>> setdistillerparams
<<
  /HWResolution [1200 1200]
  /PageSize [612.000 792.000]
>> setpagedevice
`;

/** Excerpt of a smallest-file-size style profile. */
const SCREEN_PROFILE = `%!
<<
  /AutoRotatePages /All
  /ColorConversionStrategy /Gray
  /ColorImageResolution 72
  /GrayImageResolution 72
  /DownsampleColorImages true
  /DownsampleGrayImages true
  /EmbedAllFonts false
  /Optimize false
  /CompatibilityLevel 1.5
>> setdistillerparams
`;

const PDFX_PROFILE = `<<
  /CompatibilityLevel 1.3
  /ColorImageResolution 300
  /DownsampleColorImages true
  /PDFX1aCheck true
  /PDFXOutputIntentProfile (U.S. Web Coated \\(SWOP\\) v2)
>> setdistillerparams
`;

describe("distillerJobOptions", () => {
  describe("parseJobOptions", () => {
    test("reads scalars, names, arrays and nested dictionaries", () => {
      const dict = parseJobOptions(PRINT_PROFILE);

      expect(dict.ASCII85EncodePages).toBe(false);
      expect(dict.ColorImageResolution).toBe(300);
      expect(dict.CompatibilityLevel).toBe(1.3);
      expect(dict.AutoRotatePages).toBeInstanceOf(PsName);
      expect(String(dict.AutoRotatePages)).toBe("None");
      expect(dict.AlwaysEmbed).toEqual([true]);
      expect(dict.CheckCompliance).toHaveLength(1);
      expect(String((dict.CheckCompliance as unknown[])[0])).toBe("None");
    });

    test("keeps parenthesised strings intact, including brackets and quotes", () => {
      const dict = parseJobOptions(PRINT_PROFILE);
      const description = dict.Description as Record<string, unknown>;
      expect(description.ENU).toContain("[Based on 'Lulu']");
      expect(description.ENU).toContain("Lulu's printing.");
      expect(dict.CalGrayProfile).toBe("Dot Gain 20%");
    });

    test("decodes escaped parentheses in strings", () => {
      const dict = parseJobOptions(PDFX_PROFILE);
      expect(dict.PDFXOutputIntentProfile).toBe("U.S. Web Coated (SWOP) v2");
    });

    test("nested QFactor is not confused with a top-level key", () => {
      const dict = parseJobOptions(PRINT_PROFILE);
      expect(dict.QFactor).toBeUndefined();
      expect(
        (dict.ColorACSImageDict as Record<string, unknown>).QFactor,
      ).toBeCloseTo(0.15);
    });

    test("merges the setpagedevice dictionary alongside setdistillerparams", () => {
      const dict = parseJobOptions(PRINT_PROFILE);
      expect(dict.PageSize).toEqual([612, 792]);
    });
  });

  describe("looksLikeJobOptions", () => {
    test("accepts real profiles", () => {
      expect(looksLikeJobOptions(PRINT_PROFILE)).toBe(true);
      expect(looksLikeJobOptions(SCREEN_PROFILE)).toBe(true);
    });

    test("rejects JSON and XML", () => {
      expect(looksLikeJobOptions('{"operations": []}')).toBe(false);
      expect(looksLikeJobOptions("<Workflow title='x'/>")).toBe(false);
    });
  });

  describe("readDistillerSettings", () => {
    test("normalises names and booleans", () => {
      const settings = readDistillerSettings(parseJobOptions(PRINT_PROFILE));
      expect(settings).toMatchObject({
        compatibilityLevel: 1.3,
        colorImageResolution: 300,
        grayImageResolution: 300,
        monoImageResolution: 1200,
        downsampleColorImages: true,
        embedAllFonts: true,
        optimize: true,
        colorConversionStrategy: "LeaveColorUnchanged",
        autoRotatePages: "None",
      });
      expect(settings.standard).toBeUndefined();
    });

    test("detects the PDF/X-1a check", () => {
      const settings = readDistillerSettings(parseJobOptions(PDFX_PROFILE));
      expect(settings.pdfxCheck).toBe(true);
      expect(settings.standard).toBe("PDF/X-1a");
    });

    test("detects the PDF/A-1b check", () => {
      const settings = readDistillerSettings(
        parseJobOptions(
          "<< /PDFA1bCheck true /ColorImageResolution 150 >> setdistillerparams",
        ),
      );
      expect(settings.standard).toBe("PDF/A-1b");
    });
  });

  describe("compressionLevelForResolution", () => {
    test.each([
      [300, 1],
      [250, 2],
      [150, 3],
      [120, 6],
      [100, 7],
      [72, 8],
      [50, 9],
    ])("%i dpi maps to level %i", (dpi, expected) => {
      expect(
        compressionLevelForResolution({
          colorImageResolution: dpi,
          grayImageResolution: dpi,
          downsampleColorImages: true,
          downsampleGrayImages: true,
        }),
      ).toBe(expected);
    });

    test("a profile that never downsamples is the lightest level", () => {
      expect(
        compressionLevelForResolution({
          colorImageResolution: 72,
          downsampleColorImages: false,
          downsampleGrayImages: false,
        }),
      ).toBe(1);
    });

    test("falls back to a middling level when no resolution is declared", () => {
      expect(compressionLevelForResolution({})).toBe(3);
    });

    test("uses the lower of the colour and greyscale resolutions", () => {
      expect(
        compressionLevelForResolution({
          colorImageResolution: 300,
          grayImageResolution: 72,
          downsampleColorImages: true,
        }),
      ).toBe(8);
    });
  });

  describe("jobOptionsToOperations", () => {
    test("a print profile becomes a single light compress step", () => {
      const { operations } = jobOptionsToOperations(
        readDistillerSettings(parseJobOptions(PRINT_PROFILE)),
      );
      expect(operations).toEqual([
        {
          operation: "compress",
          parameters: {
            compressionMethod: "quality",
            compressionLevel: 1,
            grayscale: false,
            linearize: true,
          },
        },
      ]);
    });

    test("AutoRotatePages other than None adds an autoRotate step first", () => {
      const { operations } = jobOptionsToOperations(
        readDistillerSettings(parseJobOptions(SCREEN_PROFILE)),
      );
      expect(operations[0]).toEqual({
        operation: "autoRotate",
        parameters: {},
      });
      expect(operations[1]).toMatchObject({
        operation: "compress",
        parameters: { compressionLevel: 8, grayscale: true, linearize: false },
      });
    });

    test("a PDF/X profile appends a convert step and warns about the output intent", () => {
      const { operations, notes } = jobOptionsToOperations(
        readDistillerSettings(parseJobOptions(PDFX_PROFILE)),
      );
      expect(operations.at(-1)).toEqual({
        operation: "convert",
        parameters: {
          fromExtension: "pdf",
          toExtension: "pdfx",
          pdfxOptions: { outputFormat: "pdfx" },
        },
      });
      expect(
        notes.some((note) => note.setting === "PDFXOutputIntentProfile"),
      ).toBe(true);
    });

    test("a PDF/A profile appends a PDF/A conversion", () => {
      const { operations } = jobOptionsToOperations(
        readDistillerSettings(
          parseJobOptions(
            "<< /PDFA1bCheck true /ColorImageResolution 150 >> setdistillerparams",
          ),
        ),
      );
      expect(operations.at(-1)).toEqual({
        operation: "convert",
        parameters: {
          fromExtension: "pdf",
          toExtension: "pdfa",
          pdfaOptions: { outputFormat: "pdfa-1b", strict: false },
        },
      });
    });

    test("notes the settings that have no equivalent", () => {
      const { notes } = jobOptionsToOperations(
        readDistillerSettings(parseJobOptions(SCREEN_PROFILE)),
      );
      const settings = notes.map((note) => note.setting);
      expect(settings).toContain("EmbedAllFonts");
      expect(settings).toContain("CompatibilityLevel");
    });

    test("LeaveColorUnchanged is not reported as a lost colour conversion", () => {
      const { notes } = jobOptionsToOperations(
        readDistillerSettings(parseJobOptions(PRINT_PROFILE)),
      );
      expect(
        notes.some((note) => note.setting === "ColorConversionStrategy"),
      ).toBe(false);
    });
  });

  describe("importJobOptions", () => {
    test("names the automation after the file", () => {
      const result = importJobOptions(
        PRINT_PROFILE,
        "Lulu Press Quality.joboptions",
      );
      expect(result.name).toBe("Lulu Press Quality");
      expect(result.description).toContain("compression level 1");
    });

    test("falls back to a generic name without a file name", () => {
      expect(importJobOptions(PRINT_PROFILE).name).toBe(
        "Imported Distiller settings",
      );
    });

    test("rejects a file with no settings dictionary", () => {
      expect(() => importJobOptions("%!PS\nshowpage\n")).toThrow(
        /No Distiller settings dictionary/,
      );
    });
  });
});
