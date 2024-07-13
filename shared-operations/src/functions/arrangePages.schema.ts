import { OperatorSchema } from ".";
import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

export default new OperatorSchema(
    i18next.t("friendlyName", { ns: "arrangePages" }),
    i18next.t("description", { ns: "arrangePages" }),
    JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description")),
    Joi.object({
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
    }),
    JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"))
);