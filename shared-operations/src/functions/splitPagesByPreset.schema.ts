import { OperatorAvailability, OperatorSchema } from ".";
import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

export default new OperatorSchema({
    joi: {
        label: i18next.t("friendlyName", { ns: "splitPagesByPreset" }),
        description: i18next.t("description", { ns: "splitPagesByPreset" }),
        inputSchema: JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description")),
        valueSchema: Joi.alternatives().try(
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
        ),
        outputSchema: JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description")),
    },
    materialSymbolName: "water",
    availability: OperatorAvailability.Both
});