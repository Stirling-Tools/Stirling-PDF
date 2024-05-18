import { Operator, Progress, oneToN } from ".";

import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import { PdfFile } from "../wrappers/PdfFile";

import { splitPagesByIndex } from "./common/splitPagesByIndex";
import { detectEmptyPages } from "./common/detectEmptyPages";
import { detectQRCodePages } from "./common/detectQRCodePages";


export class SplitPagesByPreset extends Operator {
    static type = "splitPagesByPreset";

    /**
     * Validation & Localisation
     */

    protected static inputSchema = JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description"));
    protected static valueSchema = Joi.alternatives().try(
            Joi.object({
                    type: Joi.string().valid("BAR_CODE").required()
                }),
                Joi.object({
                    type: Joi.string().valid("QR_CODE").required()
                }),
                Joi.object({
                    type: Joi.string().valid("BLANK_PAGE").required(),
                    whiteThreashold: Joi.number().min(0).max(255).required()
                }),
            )
            .label(i18next.t("values.splitSettings.friendlyName", { ns: "splitPagesByPreset" })).description(i18next.t("values.splitSettings.description", { ns: "splitPagesByPreset" })
        );
    protected static outputSchema = JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"));

    static schema = Joi.object({
        input: SplitPagesByPreset.inputSchema,
        values: SplitPagesByPreset.valueSchema.required(),
        output: SplitPagesByPreset.outputSchema
    }).label(i18next.t("friendlyName", { ns: "splitPagesByPreset" })).description(i18next.t("description", { ns: "splitPagesByPreset" }));


    /**
     * Logic
     */

    /** Detect and remove white pages */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToN<PdfFile, PdfFile>(input, async (input, index, max) => {
            let splitAtPages: number[];
            console.log("Running Detection...");

            switch (this.actionValues.type) {
                case "BAR_CODE":
                    // TODO: Implement
                    throw new Error("This split-type has not been implemented yet");

                case "QR_CODE":
                    splitAtPages = await detectQRCodePages(input);
                    break;

                case "BLANK_PAGE":
                    splitAtPages = await detectEmptyPages(input, this.actionValues.whiteThreashold);
                    break;
                
                default:
                    throw new Error("An invalid split-type was provided.");
            }
            console.log("Split at Pages: ", splitAtPages);

            const newFiles = await splitPagesByIndex(input, splitAtPages);
            for (let i = 0; i < newFiles.length; i++) {
                newFiles[i].filename += "_split-"+i;
            }
            progressCallback({ curFileProgress: 1, operationProgress: index/max });
            return newFiles;
        });
    }
}
