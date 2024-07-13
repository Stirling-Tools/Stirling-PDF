import { OperatorSchema } from ".";
import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import CommaArrayJoiExt from "../wrappers/CommaArrayJoiExt";

export default new OperatorSchema(
    i18next.t("friendlyName", { ns: "scaleContent" }),
    i18next.t("description", { ns: "scaleContent" }),
    JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description")),
    Joi.object({
        scaleFactor: Joi.alternatives().try(
                Joi.number().required(),
                CommaArrayJoiExt.comma_array().items(Joi.number()).required()
            )
            .label(i18next.t("values.scaleFactor.friendlyName", { ns: "scaleContent" })).description(i18next.t("values.scaleFactor.description", { ns: "scaleContent" }))
            .example("2").example("1.5").example("[1, 1.5, 0.9]"),
    }),
    JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"))
);