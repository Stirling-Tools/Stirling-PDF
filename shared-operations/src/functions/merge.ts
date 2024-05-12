
import { PdfFile, RepresentationType } from "../wrappers/PdfFile";
import { Operator, Progress, nToOne } from ".";

import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import { PDFDocument } from "pdf-lib";

export class Merge extends Operator {
    static type = "merge";

    /**
     * Validation & Localisation
     */

    protected static inputSchema = JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description"));
    protected static valueSchema = Joi.object({});
    protected static outputSchema = JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"));

    static schema = Joi.object({
        input: Merge.inputSchema,
        values: Merge.valueSchema.required(),
        output: Merge.outputSchema
    }).label(i18next.t("friendlyName", { ns: "merge" })).description(i18next.t("description", { ns: "merge" }));


    /**
     * Logic
     */

    /** Merging pages from multiple pdfs into a singe output document. */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return nToOne<PdfFile, PdfFile>(input, async (input) => {
            const mergedPdf = await PDFDocument.create(); 

            for (let i = 0; i < input.length; i++) {
                progressCallback({ curFileProgress: 0, operationProgress: i/input.length });
                const pdfToMerge = await input[i].pdfLibDocument;
                const copiedPages = await mergedPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
                copiedPages.forEach((page, index, array) => {
                    progressCallback({ curFileProgress: index/array.length, operationProgress: i/input.length });
                    mergedPdf.addPage(page);
                });
                progressCallback({ curFileProgress: 1, operationProgress: i/input.length });
            }
            progressCallback({ curFileProgress: 1, operationProgress: 1 });


            const newName = "merged_" + input.map(input => input.filename).join("_and_");
            return new PdfFile("mergedPDF", mergedPdf, RepresentationType.PDFLibDocument, newName);

        });
    }
}