import { OperatorSchema } from ".";
import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

export default new OperatorSchema(
    i18next.t("friendlyName", { ns: "removeBlankPages" }),
    i18next.t("description", { ns: "removeBlankPages" }),
    JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description")),
    Joi.object({
        whiteThreashold: Joi.number().min(0).max(255).required()
            .label(i18next.t("values.whiteThreashold.friendlyName", { ns: "removeBlankPages" })).description(i18next.t("values.whiteThreashold.description", { ns: "removeBlankPages" }))
            .example("10").example("0").example("255").required()
    }),
    JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"))
);