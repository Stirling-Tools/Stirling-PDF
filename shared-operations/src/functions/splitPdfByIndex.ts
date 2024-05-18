import { PdfFile } from "../wrappers/PdfFile";
import { Operator, Progress, oneToN } from ".";

import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import CommaArrayJoiExt from "../wrappers/CommaArrayJoiExt";

import { splitPagesByIndex } from "./common/splitPagesByIndex";

export class SplitPdfByIndex extends Operator {
    static type = "splitPdfByIndex";

    /**
     * Validation & Localisation
     */

    protected static inputSchema = JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description"));
    protected static valueSchema = Joi.object({
        pageIndexes: CommaArrayJoiExt.comma_array().items(Joi.number().integer()).required()
            .label(i18next.t("values.pageIndexes.friendlyName", { ns: "splitPdfByIndex" })).description(i18next.t("values.pageIndexes.description", { ns: "splitPdfByIndex" }))
            .example("1").example("1, 2, 3, 4").example("4, 2, 4, 3")
    });
    protected static outputSchema = JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"));

    static schema = Joi.object({
        input: SplitPdfByIndex.inputSchema,
        values: SplitPdfByIndex.valueSchema.required(),
        output: SplitPdfByIndex.outputSchema
    }).label(i18next.t("friendlyName", { ns: "splitPdfByIndex" })).description(i18next.t("description", { ns: "splitPdfByIndex" }));


    /**
     * Logic
     */

    /** PDF extraction, specify pages from one pdf and output them to a new pdf */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToN<PdfFile, PdfFile>(input, async (input, index, max) => {

            const newFiles = await splitPagesByIndex(input, this.actionValues.pageIndexes);
            for (let i = 0; i < newFiles.length; i++) {
                newFiles[i].filename += "_split-" + i;
            }
            progressCallback({ curFileProgress: 1, operationProgress: index/max });

            return newFiles;
        });
    }
}