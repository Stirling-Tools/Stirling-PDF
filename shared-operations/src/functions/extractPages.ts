
import { PdfFile, RepresentationType } from "../wrappers/PdfFile";
import { Operator, Progress, oneToOne } from ".";

import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import { getPages } from "./common/getPagesByIndex";
import { parsePageIndexSpecification } from "./common/pageIndexesUtils";

export interface ExtractPagesParamsType {
    file: PdfFile;
    pageIndexes: string | number[];
}
export async function extractPages(params: ExtractPagesParamsType): Promise<PdfFile> {
    const { file, pageIndexes } = params;
    const pdfLibDocument = await file.pdfLibDocument;

    let indexes = pageIndexes;

    if (!Array.isArray(indexes)) {
        indexes = parsePageIndexSpecification(indexes, pdfLibDocument.getPageCount());
    }

    const newFile = await getPages(file, indexes);
    newFile.filename += "_extractedPages";
    return newFile;
}


export class ExtractPages extends Operator {
    static type = "extractPages";

    /**
     * Validation & Localisation
     */

    protected static inputSchema = JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description"));
    protected static valueSchema = Joi.object({
        pageIndexes: Joi.array().items(Joi.number().integer()).required()
            .label(i18next.t("values.pageIndexes.friendlyName", { ns: "extractPages" })).description(i18next.t("values.pageIndexes.description", { ns: "extractPages" }))
            .example("3").example("4").required()
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

    /** PDF-Imposition, PDF-N-Up: Put multiple pages of the input document into a single page of the output document. - see: {@link https://en.wikipedia.org/wiki/N-up}  */
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
