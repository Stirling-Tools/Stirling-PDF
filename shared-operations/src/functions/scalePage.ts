import { Operator, Progress, oneToOne } from ".";

import Joi from "@stirling-tools/joi";
import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

import { PDFPage } from "pdf-lib";
import { PdfFile, RepresentationType } from "../wrappers/PdfFile";

export class ScalePage extends Operator {
    static type = "scalePage";

    /**
     * Validation & Localisation
     */

    protected static inputSchema = JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description"));
    protected static valueSchema = Joi.object({
        height: Joi.number().min(0)
            .label(i18next.t("values.height.friendlyName", { ns: "scalePage" })).description(i18next.t("values.height.description", { ns: "scalePage" }))
            .example("842").example("595").example("1190"),
        width: Joi.number().min(0)
            .label(i18next.t("values.width.friendlyName", { ns: "scalePage" })).description(i18next.t("values.width.description", { ns: "scalePage" }))
            .example("595").example("420").example("842"),
    }).or("height", "width");
    protected static outputSchema = JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"));

    static schema = Joi.object({
        input: ScalePage.inputSchema,
        values: ScalePage.valueSchema.required(),
        output: ScalePage.outputSchema
    }).label(i18next.t("friendlyName", { ns: "scalePage" })).description(i18next.t("description", { ns: "scalePage" }));


    /**
     * Logic
     */

    /** Detect and remove white pages */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {
            const pdfDoc = await input.pdfLibDocument;
            const pages = pdfDoc.getPages();
    
            pages.forEach(page => { ScalePage.resize(page, { height: this.actionValues.height, width: this.actionValues.width }) });
            
            progressCallback({ curFileProgress: 1, operationProgress: index/max });
            
            return new PdfFile(input.originalFilename, pdfDoc, RepresentationType.PDFLibDocument, input.filename+"_scaledPages");
        });
    }

    static resize(page: PDFPage, newSize: {width?:number,height?:number}) {
        const calculatedSize = ScalePage.calculateSize(page, newSize);
        const xRatio = calculatedSize.width / page.getWidth();
        const yRatio = calculatedSize.height / page.getHeight();
    
        page.setSize(calculatedSize.width, calculatedSize.height);
        page.scaleContent(xRatio, yRatio);
    }
    
    static calculateSize(page: PDFPage, newSize: {width?:number,height?:number}): {width:number,height:number} {
        if (!newSize.width && !newSize.height){
            throw new Error(`Sizes '${newSize}' cannot have null width and null height`);
        } else if (!newSize.width && newSize.height) {
            const oldSize = page.getSize();
            const ratio = oldSize.width / oldSize.height;
            return { width: newSize.height * ratio, height: newSize.height };
        } else if (newSize.width && !newSize.height) {
            const oldSize = page.getSize();
            const ratio = oldSize.height / oldSize.width;
            return { width: newSize.width, height: newSize.width * ratio };
        }
        return { width: newSize.width, height: newSize.height };
    }
}