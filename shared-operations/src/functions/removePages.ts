import { PdfFile } from "../wrappers/PdfFile";
import { Operator, Progress, oneToOne } from ".";

import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import { getPages } from "./common/getPagesByIndex";
import CommaArrayJoiExt from "../wrappers/CommaArrayJoiExt";

import { invertSelection } from "./common/pageIndexesUtils";

export class RemovePages extends Operator {
    static type = "removePages";

    /**
     * Validation & Localisation
     */

    protected static inputSchema = JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description"));
    protected static valueSchema = Joi.object({
        pageIndexes: CommaArrayJoiExt.comma_array().items(Joi.number().integer()).required()
            .label(i18next.t("values.pageIndexes.friendlyName", { ns: "removePages" })).description(i18next.t("values.pageIndexes.description", { ns: "removePages" }))
            .example("1").example("1, 2, 3, 4").example("4, 2, 4, 3").required()
    });
    protected static outputSchema = JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"));

    static schema = Joi.object({
        input: RemovePages.inputSchema,
        values: RemovePages.valueSchema.required(),
        output: RemovePages.outputSchema
    }).label(i18next.t("friendlyName", { ns: "removePages" })).description(i18next.t("description", { ns: "removePages" }));


    /**
     * Logic
     */

    /** PDF extraction, specify pages from one pdf and output them to a new pdf */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {

            const pdfDoc = await input.pdfLibDocument;
            const pageCount = pdfDoc.getPageCount();

            const pagesToKeep = invertSelection(this.actionValues.pageIndexes, pageCount);
        
            const newFile = await getPages(input, pagesToKeep);
            newFile.filename += "_removedPages";
            progressCallback({ curFileProgress: 1, operationProgress: index/max });

            return newFile;
        });
    }
}