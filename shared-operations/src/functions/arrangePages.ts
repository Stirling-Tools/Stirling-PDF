import { Operator, Progress, oneToOne } from ".";

import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import { PdfFile } from "../wrappers/PdfFile";
import { Sorts } from "./common/pageIndexesSorting";
import { getPages } from "./common/getPagesByIndex";

export class ArrangePages extends Operator {
    static type = "arrangePages";

    /**
     * Validation & Localisation
     */

    protected static inputSchema = JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description"));
    protected static valueSchema = Joi.object({
        arrangementConfig: Joi.string().valid(...[
                "REVERSE_ORDER",
                "DUPLEX_SORT",
                "BOOKLET_SORT",
                "SIDE_STITCH_BOOKLET_SORT",
                "ODD_EVEN_SPLIT",
                "REMOVE_FIRST",
                "REMOVE_LAST",
                "REMOVE_FIRST_AND_LAST"
            ]).required()
            .label(i18next.t("values.arrangementConfig.friendlyName", { ns: "arrangePages" })).description(i18next.t("values.arrangementConfig.description", { ns: "arrangePages" }))
            .example("REVERSE_ORDER").example("DUPLEX_SORT").example("BOOKLET_SORT").required()
    });
    protected static outputSchema = JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"));

    static schema = Joi.object({
        input: ArrangePages.inputSchema,
        values: ArrangePages.valueSchema.required(),
        output: ArrangePages.outputSchema
    }).label(i18next.t("friendlyName", { ns: "arrangePages" })).description(i18next.t("description", { ns: "arrangePages" }));


    /**
     * Logic
     */

    /** Detect and remove white pages */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {
            const pdfLibDocument = await input.pdfLibDocument;
            const pageCount = pdfLibDocument.getPageCount();

            const sortFunction = Sorts[this.actionValues.arrangementConfig];
            let sortIndexes = sortFunction(pageCount);
            
            const newFile = await getPages(input, sortIndexes);
            newFile.filename += "arrangedPages";

            progressCallback({ curFileProgress: 1, operationProgress: index/max });

            return newFile;
        });
    }
}