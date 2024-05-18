import { Operator, Progress, oneToOne } from ".";

import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import CommaArrayJoiExt from "../wrappers/CommaArrayJoiExt";

import { PDFPage } from "pdf-lib";
import { PdfFile, RepresentationType } from "../wrappers/PdfFile";

export class ScaleContent extends Operator {
    static type = "scaleContent";

    /**
     * Validation & Localisation
     */

    protected static inputSchema = JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description"));
    protected static valueSchema = Joi.object({
        scaleFactor: Joi.alternatives().try(
                Joi.number(),
                CommaArrayJoiExt.comma_array().items(Joi.number())
            ).required()
            .label(i18next.t("values.scaleFactor.friendlyName", { ns: "scaleContent" })).description(i18next.t("values.scaleFactor.description", { ns: "scaleContent" }))
            .example("2").example("1.5").example("[1, 1.5, 0.9]"),
    });
    protected static outputSchema = JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"));

    static schema = Joi.object({
        input: ScaleContent.inputSchema,
        values: ScaleContent.valueSchema.required(),
        output: ScaleContent.outputSchema
    }).label(i18next.t("friendlyName", { ns: "scaleContent" })).description(i18next.t("description", { ns: "scaleContent" }));


    /**
     * Logic
     */

    /** Detect and remove white pages */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {

            const pdfDoc = await input.pdfLibDocument;
            const pages = pdfDoc.getPages();

            // Different rotations applied to each page
            if (Array.isArray(this.actionValues.scaleFactor)) {
                if (this.actionValues.scaleFactor.length != pages.length) {
                    throw new Error(`Number of given rotations '${this.actionValues.scaleFactor.length}' is not the same as the number of pages '${pages.length}'`);
                }
                for (let pageIdx = 0; pageIdx < this.actionValues.scaleFactor.length; pageIdx++) {
                    ScaleContent.scalePageContent(pages[pageIdx], this.actionValues.scaleFactor[pageIdx]);
                }
            } 
            // Only one rotation applied to each page
            else {
                console.log(typeof this.actionValues.scaleFactor);
                pages.forEach(page => { ScaleContent.scalePageContent(page, this.actionValues.scaleFactor) });
            }

            progressCallback({ curFileProgress: 1, operationProgress: index/max });

            return new PdfFile(input.originalFilename, pdfDoc, RepresentationType.PDFLibDocument, input.filename + "_rotated");
        });
    }

    private static scalePageContent(page: PDFPage, scaleFactor: number) {
        const width = page.getWidth();
        const height = page.getHeight();
    
        // Scale content
        page.scaleContent(scaleFactor, scaleFactor);
        const scaled_diff = {
            width: Math.round(width - scaleFactor * width),
            height: Math.round(height - scaleFactor * height)
        };
    
        // Center content in new page format
        page.translateContent(Math.round(scaled_diff.width / 2), Math.round(scaled_diff.height / 2));
    }
}