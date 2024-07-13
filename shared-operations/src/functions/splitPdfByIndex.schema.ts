import { OperatorSchema } from ".";
import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import CommaArrayJoiExt from "../wrappers/CommaArrayJoiExt";

export default new OperatorSchema(
    i18next.t("friendlyName", { ns: "splitPdfByIndex" }),
    i18next.t("description", { ns: "splitPdfByIndex" }),
    JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description")),
    Joi.object({
        pageIndexes: CommaArrayJoiExt.comma_array().items(Joi.number().integer()).required()
            .label(i18next.t("values.pageIndexes.friendlyName", { ns: "splitPdfByIndex" })).description(i18next.t("values.pageIndexes.description", { ns: "splitPdfByIndex" }))
            .example("1").example("1, 2, 3, 4").example("4, 2, 4, 3")
    }),
    JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"))
);