import { OperatorSchema } from ".";
import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import CommaArrayJoiExt from "../wrappers/CommaArrayJoiExt";

export default new OperatorSchema(
    i18next.t("friendlyName", { ns: "rotatePages" }),
    i18next.t("description", { ns: "rotatePages" }),
    JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description")),
    Joi.object({
        rotation: Joi.alternatives().try(
                Joi.number().integer().min(-360).max(360).required(),
                CommaArrayJoiExt.comma_array().items(Joi.number().integer().min(-360).max(360)).required()
            )
            .label(i18next.t("values.rotation.friendlyName", { ns: "rotatePages" })).description(i18next.t("values.rotation.description", { ns: "rotatePages" }))
            .example("90").example("-180").example("[90, 0, 270]"),
    }),
    JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"))
);