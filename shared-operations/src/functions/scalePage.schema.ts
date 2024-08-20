import { OperatorAvailability, OperatorSchema } from ".";
import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

export default new OperatorSchema({
    joi: {
        label: i18next.t("friendlyName", { ns: "scalePage" }),
        description: i18next.t("description", { ns: "scalePage" }),
        inputSchema: JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description")),
        valueSchema: Joi.object({
            height: Joi.number().min(0)
                .label(i18next.t("values.height.friendlyName", { ns: "scalePage" })).description(i18next.t("values.height.description", { ns: "scalePage" }))
                .example("842").example("595").example("1190"),
            width: Joi.number().min(0)
                .label(i18next.t("values.width.friendlyName", { ns: "scalePage" })).description(i18next.t("values.width.description", { ns: "scalePage" }))
                .example("595").example("420").example("842"),
        }).or("height", "width"),
        outputSchema: JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description")),
    },
    materialSymbolName: "zoom_out_map",
    availability: OperatorAvailability.Both
});