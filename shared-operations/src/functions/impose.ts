
import { PdfFile, RepresentationType } from "../wrappers/PdfFile";
import { Operator, Progress, oneToOne } from ".";

import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import * as pdfcpuWrapper from "#pdfcpu"; // This is updated by tsconfig.json/paths for the context (browser, node, etc.) this module is used in.


export class Impose extends Operator {
    static type = "impose";

    /**
     * Validation & Localisation
     */

    protected static inputSchema = JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description"));
    protected static valueSchema = Joi.object({
        nup: Joi.number().integer().valid(2, 3, 4, 8, 9, 12, 16).required()
            .label(i18next.t("values.nup.friendlyName", { ns: "impose" })).description(i18next.t("values.nup.description", { ns: "impose" }))
            .example("3").example("4"),
        format: Joi.string().valid(...[
            // ISO 216:1975 A
            "4A0", "2A0", "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10",
            
            // ISO 216:1975 B
            "B0+", "B0", "B1+", "B1", "B2+", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10",
            
            // ISO 269:1985 C
            "C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10",
            
            // ISO 217:2013 untrimmed
            "RA0", "RA1", "RA2", "RA3", "RA4", "SRA0", "SRA1", "SRA2", "SRA3", "SRA4", "SRA1+", "SRA2+", "SRA3+", "SRA3++",
            
            // American
            "SuperB", "Tabloid", "Legal", "GovLegal", "Letter", "GovLetter", "Executive", "HalfLetter", "JuniorLegal", "Photo",
            
            // ANSI/ASME Y14.1
            "ANSIA", "ANSIB", "ANSIC", "ANSID", "ANSIE", "ANSIF",
            
            // ANSI/ASME Y14.1 Architectural series
            "ARCHA", "ARCHB", "ARCHC", "ARCHD", "ARCHE", "ARCHE1", "ARCHE2", "ARCHE3",
            
            // American uncut
            "Bond", "Book", "Cover", "Index", "NewsPrint", "Offset",
            
            // English uncut
            "Crown", "DoubleCrown", "Quad", "Demy", "DoubleDemy", "Medium", "Royal", "SuperRoyal",
            "DoublePott", "DoublePost", "Foolscap", "DoubleFoolscap",
            
            // F4
            
            // China GB/T 148-1997 D Series
            "D0", "D1", "D2", "D3", "D4", "D5", "D6",
            "RD0", "RD1", "RD2", "RD3", "RD4", "RD5", "RD6",
            
            // Japan
            "JIS-B0", "JIS-B1", "JIS-B2", "JIS-B3", "JIS-B4", "JIS-B5", "JIS-B6",
            "JIS-B7", "JIS-B8", "JIS-B9", "JIS-B10", "JIS-B11", "JIS-B12",
            "Shirokuban4", "Shirokuban5", "Shirokuban6", "Kiku4", "Kiku5", "AB", "B40", "Shikisen"
        ].flatMap(size => [size, size + "P", size + "L"])).required()
            .label(i18next.t("values.format.friendlyName", { ns: "impose" })).description(i18next.t("values.format.description", { ns: "impose" }))
            .example("A4").example("A3L")
    });
    protected static outputSchema = JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"));

    static schema = Joi.object({
        input: Impose.inputSchema,
        values: Impose.valueSchema.required(),
        output: Impose.outputSchema
    }).label(i18next.t("friendlyName", { ns: "impose" })).description(i18next.t("description", { ns: "impose" }));


    /**
     * Logic
     */

    /** PDF-Imposition, PDF-N-Up: Put multiple pages of the input document into a single page of the output document. - see: {@link https://en.wikipedia.org/wiki/N-up}  */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {
            //TODO: Support custom Page Sizes
            // https://pdfcpu.io/generate/nup.html
            const uint8Array = await pdfcpuWrapper.oneToOne(
                [
                    "pdfcpu.wasm",
                    "nup",
                    "-c",
                    "disable",
                    "f:" + this.actionValues.format,
                    "/output.pdf",
                    String(this.actionValues.nup),
                    "input.pdf",
                ],
                await input.uint8Array
            );

            const result = new PdfFile(
                input.originalFilename,
                uint8Array,
                RepresentationType.Uint8Array,
                input.filename + "_imposed"
            );

            progressCallback({ curFileProgress: 1, operationProgress: index/max });
            
            console.log("ImposeResult: ", result);
            return result;
        });
    }
}
