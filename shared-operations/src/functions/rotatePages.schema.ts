import { OperatorAvailability, OperatorSchema } from ".";
import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import CommaArrayJoiExt from "../wrappers/CommaArrayJoiExt";

export default new OperatorSchema({
    joi: {
        label: i18next.t("friendlyName", { ns: "rotatePages" }),
        description: i18next.t("description", { ns: "rotatePages" }),
        inputSchema: JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description")),
        valueSchema: Joi.object({
            rotation: Joi.alternatives().try(
                    Joi.number().integer().min(-360).max(360).required(),
                    CommaArrayJoiExt.comma_array().items(Joi.number().integer().min(-360).max(360)).required()
                )
                .label(i18next.t("values.rotation.friendlyName", { ns: "rotatePages" })).description(i18next.t("values.rotation.description", { ns: "rotatePages" }))
                .example("90").example("-180").example("[90, 0, 270]"),
        }),
        outputSchema: JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description")),
    },
    materialSymbolName: "rotate_right",
    availability: OperatorAvailability.Both
});