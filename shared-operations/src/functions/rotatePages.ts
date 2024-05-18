import { Operator, Progress, oneToOne } from ".";

import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import CommaArrayJoiExt from "../wrappers/CommaArrayJoiExt";

import { degrees } from "pdf-lib";
import { PdfFile, RepresentationType } from "../wrappers/PdfFile";

export class RotatePages extends Operator {
    static type = "rotatePages";

    /**
     * Validation & Localisation
     */

    protected static inputSchema = JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description"));
    protected static valueSchema = Joi.object({
        rotation: Joi.alternatives().try(
                Joi.number().integer().min(-360).max(360).required(),
                CommaArrayJoiExt.comma_array().items(Joi.number().integer().min(-360).max(360)).required()
            )
            .label(i18next.t("values.rotation.friendlyName", { ns: "rotatePages" })).description(i18next.t("values.rotation.description", { ns: "rotatePages" }))
            .example("90").example("-180").example("[90, 0, 270]"),
    });
    protected static outputSchema = JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"));

    static schema = Joi.object({
        input: RotatePages.inputSchema,
        values: RotatePages.valueSchema.required(),
        output: RotatePages.outputSchema
    }).label(i18next.t("friendlyName", { ns: "rotatePages" })).description(i18next.t("description", { ns: "rotatePages" }));


    /**
     * Logic
     */

    /** Detect and remove white pages */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {

            const pdfDoc = await input.pdfLibDocument;
            const pages = pdfDoc.getPages();

            // Different rotations applied to each page
            if (Array.isArray(this.actionValues.rotation)) {
                if (this.actionValues.rotation.length != pages.length) {
                    throw new Error(`Number of given rotations '${this.actionValues.rotation.length}' is not the same as the number of pages '${pages.length}'`);
                }
                for (let pageIdx = 0; pageIdx < this.actionValues.rotation.length; pageIdx++) {
                    const oldRotation = pages[pageIdx].getRotation().angle;
                    pages[pageIdx].setRotation(degrees(oldRotation + this.actionValues.rotation[pageIdx]));

                    progressCallback({ curFileProgress: pageIdx/pages.length, operationProgress: index/max });
                }
            } 
            // Only one rotation applied to each page
            else {
                pages.forEach((page, pageIdx) => {
                    // Change page size
                    const oldRotation = page.getRotation().angle;
                    page.setRotation(degrees(oldRotation + this.actionValues.rotation));
                    progressCallback({ curFileProgress: pageIdx/pages.length, operationProgress: index/max });
                });
            }

            progressCallback({ curFileProgress: 1, operationProgress: index/max });

            return new PdfFile(input.originalFilename, pdfDoc, RepresentationType.PDFLibDocument, input.filename + "_rotated");
        });
    }
}
