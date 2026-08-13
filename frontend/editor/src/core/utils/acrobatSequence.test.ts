/**
 * Unit tests for the Acrobat Action Wizard (.sequ) importer.
 *
 * The fixtures are verbatim real Actions - Adobe publishes no schema for this
 * format, so testing against anything reconstructed from the docs would prove
 * nothing.
 */

import { describe, test, expect } from "vitest";
import {
  importAcrobatSequence,
  looksLikeAcrobatSequence,
  mapAcrobatCommand,
  parseAcrobatSequenceXml,
} from "@app/utils/acrobatSequence";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";

const registry = {
  compress: {
    operationConfig: {
      endpoint: "/api/v1/misc/compress-pdf",
      defaultParameters: { compressionLevel: 5, grayscale: false },
    },
  },
  ocr: { operationConfig: { defaultParameters: { languages: [] } } },
  convert: { operationConfig: { defaultParameters: {} } },
  removeAnnotations: { operationConfig: { defaultParameters: {} } },
  sanitize: { operationConfig: { defaultParameters: {} } },
  changeMetadata: {
    operationConfig: { defaultParameters: { deleteAll: false } },
  },
  watermark: { operationConfig: { defaultParameters: { opacity: 50 } } },
  redact: { operationConfig: { defaultParameters: {} } },
} as unknown as Partial<ToolRegistry>;

/** A real single-command Action. */
const DELETE_COMMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<Workflow xmlns="http://ns.adobe.com/acrobat/workflow/2012" title="Delete All Comments" description="This Action deletes all existing comments on a PDF and then saves a copy of the original file." majorVersion="1" minorVersion="0">
	<Sources defaultCommand="WorkflowPlaybackSelectFile"/>
	<Group label="Delete All Comments">
		<Command name="DeleteAll" pauseBefore="false" promptUser="true"/>
	</Group>
</Workflow>
`;

/** A real Action that exports to plain text via the save handler. */
const EXPORT_TXT = `<?xml version="1.0" encoding="UTF-8"?>
<Workflow xmlns="http://ns.adobe.com/acrobat/workflow/2012" title="Export PDFs to TXTs" description="" majorVersion="1" minorVersion="0">
	<Sources defaultCommand="WorkflowPlaybackSelectFolder"/>
	<Group label="Save as DOCX">
		<Command name="WorkflowPlaybackSaveFiles" pauseBefore="false" promptUser="false">
			<Items>
				<Item name="AddToBaseName" type="boolean" value="false"/>
				<Item name="DocSaveDestType" type="string" value="WorkflowPlaybackSave"/>
				<Item name="FS" type="atom" value="DOS"/>
				<Item name="HandlerUniqueID" type="string" value="com.adobe.acrobat.plain-text"/>
				<Item name="OptimizePDF" type="boolean" value="true"/>
				<Item name="PresetName" type="text" value="Standard"/>
				<Item name="RunPDFOptimizer" type="boolean" value="false"/>
			</Items>
		</Command>
	</Group>
</Workflow>
`;

/** A real multi-group Action: preflight, scan optimisation, view prefs, save. */
const COMPRESS_ACTION = `<?xml version="1.0" encoding="UTF-8"?>
<Workflow xmlns="http://ns.adobe.com/acrobat/workflow/2012" title="Compress PDF pictures (Save As)" description="Compress PDF pictures, then save as another PDF." majorVersion="1" minorVersion="0">
	<Group label="PDF compress">
		<Command name="CALS:Preflight" pauseBefore="false" promptUser="false">
			<Items>
				<Item name="CALS_PREFLIGHT_CMD_OMIT_FIXUPS" type="boolean" value="false"/>
				<Item name="CALS_PREFLIGHT_CMD_PROFILE_NAME" type="text" value="Shrink pages to A4"/>
			</Items>
		</Command>
		<Command name="Scan:OPT" pauseBefore="false" promptUser="false">
			<Items>
				<Item name="ApplyMRC" type="boolean" value="true"/>
				<Item name="ColorCompression" type="integer" value="4"/>
				<Item name="Deskew" type="boolean" value="false"/>
				<Item name="QualityLevel" type="integer" value="1"/>
				<Item name="doOCR" type="boolean" value="false"/>
			</Items>
		</Command>
	</Group>
	<Group label="Post-processing">
		<Command name="OpenInfo" pauseBefore="false" promptUser="false">
			<Items>
				<Item name="DisplayDocTitle" type="boolean" value="true"/>
				<Items name="LeaveAsIs">
					<Item name="CenterWindow" type="boolean" value="true"/>
				</Items>
				<Item name="PageLayout" type="integer" value="1"/>
			</Items>
		</Command>
		<Command name="WorkflowPlaybackSaveFiles" pauseBefore="false" promptUser="false">
			<Items>
				<Item name="HandlerUniqueID" type="string" value="com.callas.preflight.pdfa"/>
				<Item name="InsertAfterBaseName" type="text" value="_c"/>
				<Item name="RunPDFOptimizer" type="boolean" value="true"/>
			</Items>
		</Command>
	</Group>
</Workflow>
`;

/** A real Action carrying operator instructions and an Acrobat JS step. */
const FIND_AND_HIGHLIGHT = `<?xml version="1.0" encoding="UTF-8"?>
<Workflow xmlns="http://ns.adobe.com/acrobat/workflow/2012" title="Find and Highlight Words" description="Searches for words using the redaction command." majorVersion="1" minorVersion="0">
	<Group label="Notice">
		<Instruction label="The words that are highlighted will not be redacted." pauseBefore="false"/>
	</Group>
	<Group label="Step 1: Search for words">
		<Command name="SearchAndRedactCmd" pauseBefore="false" promptUser="true"/>
	</Group>
	<Group label="Step 2: Convert highlight annotation">
		<Command name="JavaScript" pauseBefore="false" promptUser="false">
			<Items>
				<Item name="ScriptCode" type="text" value="// header comment&#xD;&#xA;var oDoc = event.target;&#xD;&#xA;"/>
				<Item name="ScriptName" type="text" value=""/>
			</Items>
		</Command>
	</Group>
</Workflow>
`;

const WATERMARK_ACTION = `<?xml version="1.0" encoding="UTF-8"?>
<Workflow xmlns="http://ns.adobe.com/acrobat/workflow/2012" title="Stamp Draft" description="" majorVersion="1" minorVersion="0">
	<Group label="Watermark">
		<Command name="COMP:AddWatermark" pauseBefore="false" promptUser="false">
			<Items>
				<Items name="WaterBackCmd">
					<Item name="BACKGROUND" type="boolean" value="false"/>
					<Item name="COLOR1" type="double" value="1.000000"/>
					<Item name="COLOR2" type="double" value="0.000000"/>
					<Item name="COLOR3" type="double" value="0.000000"/>
					<Item name="COLORSPACE" type="atom" value="DeviceRGB"/>
					<Item name="FONT_SIZE" type="double" value="24.000000"/>
					<Item name="FROM_FILE" type="boolean" value="false"/>
					<Item name="OPACITY" type="double" value="0.400000"/>
					<Item name="ROTATION" type="integer" value="45"/>
					<Item name="SRCTEXT" type="text" value="DRAFT"/>
					<Item name="WATERMARK" type="boolean" value="true"/>
				</Items>
			</Items>
		</Command>
	</Group>
</Workflow>
`;

const findMapping = (
  mappings: ReturnType<typeof mapAcrobatCommand>,
  command: string,
) => mappings.find((mapping) => mapping.command === command);

describe("acrobatSequence", () => {
  describe("parseAcrobatSequenceXml", () => {
    test("reads title, description and a self-closing command", () => {
      const sequence = parseAcrobatSequenceXml(DELETE_COMMENTS);
      expect(sequence.title).toBe("Delete All Comments");
      expect(sequence.description).toContain("deletes all existing comments");
      expect(sequence.sourceIsFolder).toBe(false);
      expect(sequence.commands).toEqual([
        {
          name: "DeleteAll",
          groupLabel: "Delete All Comments",
          items: {},
          promptUser: true,
          pauseBefore: false,
        },
      ]);
    });

    test("detects a folder source", () => {
      expect(parseAcrobatSequenceXml(EXPORT_TXT).sourceIsFolder).toBe(true);
    });

    test("coerces item types and recurses into nested Items", () => {
      const sequence = parseAcrobatSequenceXml(COMPRESS_ACTION);
      const scan = sequence.commands.find((c) => c.name === "Scan:OPT")!;
      expect(scan.items.ApplyMRC).toBe(true);
      expect(scan.items.QualityLevel).toBe(1);
      expect(scan.items.Deskew).toBe(false);

      const openInfo = sequence.commands.find((c) => c.name === "OpenInfo")!;
      expect(openInfo.items.LeaveAsIs).toEqual({ CenterWindow: true });
      expect(openInfo.items.PageLayout).toBe(1);
    });

    test("collects Instruction text separately from commands", () => {
      const sequence = parseAcrobatSequenceXml(FIND_AND_HIGHLIGHT);
      expect(sequence.instructions).toEqual([
        "The words that are highlighted will not be redacted.",
      ]);
      expect(sequence.commands.map((c) => c.name)).toEqual([
        "SearchAndRedactCmd",
        "JavaScript",
      ]);
    });

    test("rejects malformed XML", () => {
      expect(() =>
        parseAcrobatSequenceXml("<Workflow><Group></Workflow>"),
      ).toThrow(/not valid XML/);
    });

    test("rejects XML that is not an Action", () => {
      expect(() =>
        parseAcrobatSequenceXml('<?xml version="1.0"?><root><a/></root>'),
      ).toThrow(/expected a <Workflow> root/);
    });
  });

  describe("looksLikeAcrobatSequence", () => {
    test("accepts real Actions", () => {
      expect(looksLikeAcrobatSequence(DELETE_COMMENTS)).toBe(true);
      expect(looksLikeAcrobatSequence(COMPRESS_ACTION)).toBe(true);
    });

    test("rejects JSON and job options", () => {
      expect(looksLikeAcrobatSequence('{"operations":[]}')).toBe(false);
      expect(looksLikeAcrobatSequence("<< /CompatibilityLevel 1.4 >>")).toBe(
        false,
      );
    });
  });

  describe("mapAcrobatCommand", () => {
    test("the save step's HandlerUniqueID drives the conversion target", () => {
      const [command] = parseAcrobatSequenceXml(EXPORT_TXT).commands;
      const [mapping] = mapAcrobatCommand(command);
      expect(mapping).toMatchObject({
        confidence: "exact",
        toolId: "convert",
        parameters: { fromExtension: "pdf", toExtension: "txt" },
      });
    });

    test("the callas PDF/A writer becomes a PDF/A conversion", () => {
      const command = parseAcrobatSequenceXml(COMPRESS_ACTION).commands.find(
        (c) => c.name === "WorkflowPlaybackSaveFiles",
      )!;
      const [mapping] = mapAcrobatCommand(command);
      expect(mapping.toolId).toBe("convert");
      expect(mapping.parameters).toMatchObject({ toExtension: "pdfa" });
    });

    test("a plain PDF save is skipped rather than mapped", () => {
      const [mapping] = mapAcrobatCommand({
        name: "WorkflowPlaybackSaveFiles",
        groupLabel: "",
        items: { RunPDFOptimizer: false },
        promptUser: false,
        pauseBefore: false,
      });
      expect(mapping.confidence).toBe("skipped");
      expect(mapping.toolId).toBeUndefined();
    });

    test("a save that runs the PDF Optimizer becomes a compress step", () => {
      const [mapping] = mapAcrobatCommand({
        name: "WorkflowPlaybackSaveFiles",
        groupLabel: "",
        items: { RunPDFOptimizer: true, PresetName: "Mobile" },
        promptUser: false,
        pauseBefore: false,
      });
      expect(mapping.toolId).toBe("compress");
      expect(mapping.note).toContain("Mobile");
    });

    test("scan optimisation inverts Acrobat's quality scale", () => {
      const command = parseAcrobatSequenceXml(COMPRESS_ACTION).commands.find(
        (c) => c.name === "Scan:OPT",
      )!;
      const [mapping] = mapAcrobatCommand(command);
      // QualityLevel 1 is Acrobat's smallest-file setting, so it maps to a
      // heavy Stirling compression level, not a light one.
      expect(mapping.parameters).toMatchObject({ compressionLevel: 8 });
    });

    test("scan optimisation with OCR emits a second step", () => {
      const mappings = mapAcrobatCommand({
        name: "Scan:OPT",
        groupLabel: "",
        items: { QualityLevel: 4, doOCR: true },
        promptUser: false,
        pauseBefore: false,
      });
      expect(mappings.map((m) => m.toolId)).toEqual(["compress", "ocr"]);
      expect(mappings[0].parameters).toMatchObject({ compressionLevel: 2 });
      // The note belongs to the command, not to every step it expands into.
      expect(mappings[1].note).toBeUndefined();
    });

    test("a non-standards preflight profile is reported by name for manual work", () => {
      const command = parseAcrobatSequenceXml(COMPRESS_ACTION).commands.find(
        (c) => c.name === "CALS:Preflight",
      )!;
      const [mapping] = mapAcrobatCommand(command);
      expect(mapping.confidence).toBe("manual");
      expect(mapping.note).toContain("Shrink pages to A4");
      expect(mapping.note).toContain("compliance policy");
    });

    test("a PDF/A preflight profile maps to conversion", () => {
      const [mapping] = mapAcrobatCommand({
        name: "CALS:Preflight",
        groupLabel: "",
        items: { CALS_PREFLIGHT_CMD_PROFILE_NAME: "Convert to PDF/A-2b" },
        promptUser: false,
        pauseBefore: false,
      });
      expect(mapping.toolId).toBe("convert");
      expect(mapping.parameters).toMatchObject({ toExtension: "pdfa" });
    });

    test("JavaScript steps are reported with an identifying line", () => {
      const command = parseAcrobatSequenceXml(FIND_AND_HIGHLIGHT).commands.find(
        (c) => c.name === "JavaScript",
      )!;
      const [mapping] = mapAcrobatCommand(command);
      expect(mapping.confidence).toBe("manual");
      // The leading comment line is skipped in favour of real code.
      expect(mapping.note).toContain("var oDoc = event.target;");
    });

    test("watermark colours, opacity and rotation are translated", () => {
      const [command] = parseAcrobatSequenceXml(WATERMARK_ACTION).commands;
      const [mapping] = mapAcrobatCommand(command);
      expect(mapping.toolId).toBe("watermark");
      expect(mapping.parameters).toMatchObject({
        watermarkType: "text",
        watermarkText: "DRAFT",
        fontSize: 24,
        rotation: 45,
        opacity: 40,
        customColor: "#ff0000",
      });
    });

    test("an image watermark is flagged because the image is not in the file", () => {
      const [mapping] = mapAcrobatCommand({
        name: "COMP:AddWatermark",
        groupLabel: "",
        items: { WaterBackCmd: { FROM_FILE: true } },
        promptUser: false,
        pauseBefore: false,
      });
      expect(mapping.confidence).toBe("manual");
      expect(mapping.note).toContain("external image file");
    });

    test("metadata honours the LeaveAsIs flags", () => {
      const [mapping] = mapAcrobatCommand({
        name: "GeneralInfo",
        groupLabel: "",
        items: {
          Title: "New title",
          Author: "Ada",
          LeaveAsIs: { Author: true },
        },
        promptUser: false,
        pauseBefore: false,
      });
      expect(mapping.toolId).toBe("changeMetadata");
      expect(mapping.parameters).toEqual({ title: "New title" });
    });

    test("a metadata step that changes nothing is skipped", () => {
      const [mapping] = mapAcrobatCommand({
        name: "GeneralInfo",
        groupLabel: "",
        items: { Title: "x", LeaveAsIs: { Title: true } },
        promptUser: false,
        pauseBefore: false,
      });
      expect(mapping.confidence).toBe("skipped");
    });

    test("promptUser commands are flagged as having no saved settings", () => {
      const [command] = parseAcrobatSequenceXml(DELETE_COMMENTS).commands;
      const [mapping] = mapAcrobatCommand(command);
      expect(mapping.toolId).toBe("removeAnnotations");
      expect(mapping.note).toContain("opened a dialog in Acrobat");
    });

    test("unknown commands fall back to a keyword match", () => {
      const [mapping] = mapAcrobatCommand({
        name: "Bates:AddBatesNumbering",
        groupLabel: "",
        items: {},
        promptUser: false,
        pauseBefore: false,
      });
      expect(mapping.confidence).toBe("heuristic");
      expect(mapping.toolId).toBe("addPageNumbers");
      expect(mapping.note).toContain("check the step's configuration");
    });

    test("commands with no keyword match are reported, never silently dropped", () => {
      const [mapping] = mapAcrobatCommand({
        name: "Xyz:SomethingElse",
        groupLabel: "",
        items: {},
        promptUser: false,
        pauseBefore: false,
      });
      expect(mapping.confidence).toBe("manual");
      expect(mapping.note).toContain("Unrecognised Acrobat command");
    });
  });

  describe("importAcrobatSequence", () => {
    test("merges registry defaults under the mapped parameters", () => {
      const result = importAcrobatSequence(COMPRESS_ACTION, registry);
      const compress = result.operations.find(
        (op) => op.operation === "compress",
      )!;
      expect(compress.parameters).toEqual({
        // From the registry defaults…
        grayscale: false,
        // …with the Acrobat-derived value winning.
        compressionLevel: 8,
        compressionMethod: "quality",
      });
    });

    test("keeps the Action's own title and description", () => {
      const result = importAcrobatSequence(DELETE_COMMENTS, registry);
      expect(result.name).toBe("Delete All Comments");
      expect(result.description).toContain("deletes all existing comments");
    });

    test("falls back to the file name for an untitled Action", () => {
      const untitled = DELETE_COMMENTS.replace(
        'title="Delete All Comments"',
        'title=""',
      );
      const result = importAcrobatSequence(
        untitled,
        registry,
        "My Action.sequ",
      );
      expect(result.name).toBe("My Action");
    });

    test("skipped and manual steps produce no operations but stay in the report", () => {
      const result = importAcrobatSequence(COMPRESS_ACTION, registry);
      expect(result.operations.map((op) => op.operation)).toEqual([
        "compress",
        "convert",
      ]);
      expect(findMapping(result.mappings, "OpenInfo")?.confidence).toBe(
        "skipped",
      );
      expect(findMapping(result.mappings, "CALS:Preflight")?.confidence).toBe(
        "manual",
      );
      expect(result.mappings).toHaveLength(4);
    });

    test("carries operator instructions through", () => {
      const result = importAcrobatSequence(FIND_AND_HIGHLIGHT, registry);
      expect(result.instructions).toHaveLength(1);
    });
  });
});
