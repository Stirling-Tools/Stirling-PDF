import { Operator, Progress, oneToOne } from ".";

import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import { PdfFile } from "../wrappers/PdfFile";
import { detectEmptyPages } from "./common/detectEmptyPages";
import { getPages } from "./common/getPagesByIndex";
import { invertSelection } from "./common/pageIndexesUtils";

export class RemoveBlankPages extends Operator {
    static type = "removeBlankPages";

    /**
     * Validation & Localisation
     */

    protected static inputSchema = JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description"));
    protected static valueSchema = Joi.object({
        whiteThreashold: Joi.number().min(0).max(255).required()
            .label(i18next.t("values.whiteThreashold.friendlyName", { ns: "removeBlankPages" })).description(i18next.t("values.whiteThreashold.description", { ns: "removeBlankPages" }))
            .example("10").example("0").example("255").required()
    });
    protected static outputSchema = JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"));

    static schema = Joi.object({
        input: RemoveBlankPages.inputSchema,
        values: RemoveBlankPages.valueSchema.required(),
        output: RemoveBlankPages.outputSchema
    }).label(i18next.t("friendlyName", { ns: "removeBlankPages" })).description(i18next.t("description", { ns: "removeBlankPages" }));


    /**
     * Logic
     */

    /** Detect and remove white pages */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {
            const pdfDoc = await input.pdfLibDocument;
            const pageCount = pdfDoc.getPageCount();

            progressCallback({ curFileProgress: 0, operationProgress: index/max });
            const emptyPages = await detectEmptyPages(input, this.actionValues.whiteThreashold);
            progressCallback({ curFileProgress: 0.6, operationProgress: index/max });
            const pagesToKeep = invertSelection(emptyPages, pageCount);
            progressCallback({ curFileProgress: 0.3, operationProgress: index/max });

            const result = await getPages(input, pagesToKeep);
            progressCallback({ curFileProgress: 1, operationProgress: index/max });

            result.filename += "_removedBlanks";
            return result;
        });
    }
}
