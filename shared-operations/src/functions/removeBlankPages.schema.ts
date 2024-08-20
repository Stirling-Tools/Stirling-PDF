import { OperatorAvailability, OperatorSchema } from ".";
import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

export default new OperatorSchema({
    joi: {
        label: i18next.t("friendlyName", { ns: "removeBlankPages" }),
        description: i18next.t("description", { ns: "removeBlankPages" }),
        inputSchema: JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description")),
        valueSchema: Joi.object({
            whiteThreashold: Joi.number().min(0).max(255).required()
                .label(i18next.t("values.whiteThreashold.friendlyName", { ns: "removeBlankPages" })).description(i18next.t("values.whiteThreashold.description", { ns: "removeBlankPages" }))
                .example("10").example("0").example("255").required()
        }),
        outputSchema: JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description")),
    },
    materialSymbolName: "filter_alt",
    availability: OperatorAvailability.Both
});