import { OperatorAvailability, OperatorSchema } from ".";
import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

export default new OperatorSchema({
    joi: {
        label: i18next.t("friendlyName", { ns: "singleLargePage" }),
        description: i18next.t("description", { ns: "singleLargePage" }),
        inputSchema: JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description")),
        valueSchema: Joi.object({}),
        outputSchema: JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description")),
    },
    materialSymbolName: "receipt",
    availability: OperatorAvailability.Both
}
);