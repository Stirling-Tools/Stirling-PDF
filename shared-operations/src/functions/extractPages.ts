import { PdfFile, RepresentationType } from "../wrappers/PdfFile";
import { Operator, Progress, oneToOne } from ".";

import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import { getPages } from "./common/getPagesByIndex";
import { parsePageIndexSpecification } from "./common/pageIndexesUtils";
import CommaArrayJoiExt from "../wrappers/CommaArrayJoiExt";

export class ExtractPages extends Operator {
    static type = "extractPages";

    /**
     * Validation & Localisation
     */

    protected static inputSchema = JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description"));
    protected static valueSchema = Joi.object({
        pageIndexes: CommaArrayJoiExt.comma_array().items(Joi.number().integer()).required()
            .label(i18next.t("values.pageIndexes.friendlyName", { ns: "extractPages" })).description(i18next.t("values.pageIndexes.description", { ns: "extractPages" }))
            .example("1").example("1, 2, 3, 4").example("4, 2, 4, 3").required()
    });
    protected static outputSchema = JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"));

    static schema = Joi.object({
        input: ExtractPages.inputSchema,
        values: ExtractPages.valueSchema.required(),
        output: ExtractPages.outputSchema
    }).label(i18next.t("friendlyName", { ns: "extractPages" })).description(i18next.t("description", { ns: "extractPages" }));


    /**
     * Logic
     */

    /** PDF extraction, specify pages from one pdf and output them to a new pdf */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {
            const pdfLibDocument = await input.pdfLibDocument;

            let indexes = this.actionValues.pageIndexes;

            if (!Array.isArray(indexes)) {
                indexes = parsePageIndexSpecification(indexes, pdfLibDocument.getPageCount());
            }

            const newFile = await getPages(input, indexes);
            newFile.filename += "_extractedPages";
            progressCallback({ curFileProgress: 1, operationProgress: index/max });

            return newFile;
        });
    }
}
