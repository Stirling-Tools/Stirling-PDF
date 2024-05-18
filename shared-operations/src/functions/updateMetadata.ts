import { PdfFile } from "../wrappers/PdfFile";
import { Operator, Progress, oneToOne } from ".";

import Joi from "@stirling-tools/joi";

import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

export class UpdateMetadata extends Operator {
    static type = "updateMetadata";

    /**
     * Validation & Localisation
     */

    protected static inputSchema = JoiPDFFileSchema.label(i18next.t("inputs.pdffile.name")).description(i18next.t("inputs.pdffile.description"));
    protected static valueSchema = Joi.object({
        deleteAll: Joi.boolean().invalid(false)
            .label(i18next.t("values.deleteAll.friendlyName", { ns: "updateMetadata" })).description(i18next.t("values.deleteAll.description", { ns: "updateMetadata" }))
            .example("true").example("false"),
        author: Joi.string().optional().allow('')
            .label(i18next.t("values.author.friendlyName", { ns: "updateMetadata" })).description(i18next.t("values.author.description", { ns: "updateMetadata" }))
            .example("John Doe").example("Anthony Stirling"),            // The author of the document
        creationDate: Joi.date().allow("").allow(null)
            .label(i18next.t("values.creationDate.friendlyName", { ns: "updateMetadata" })).description(i18next.t("values.creationDate.description", { ns: "updateMetadata" }))
            .example("YYYY-MM-DD").example("2023-01-27"),        // The creation date of the document (format: yyyy/MM/dd HH:mm:ss)
        creator: Joi.string().optional().allow('')
            .label(i18next.t("values.creator.friendlyName", { ns: "updateMetadata" })).description(i18next.t("values.creator.description", { ns: "updateMetadata" }))
            .example("John Doe").example("Anthony Stirling"),           // The creator of the document
        keywords: Joi.string().optional().allow('')
            .label(i18next.t("values.keywords.friendlyName", { ns: "updateMetadata" })).description(i18next.t("values.keywords.description", { ns: "updateMetadata" }))
            .example("General").example("finances, leisure").example("finances leisure"),          // The keywords for the document
        modificationDate: Joi.date().allow("").allow(null)
            .label(i18next.t("values.modificationDate.friendlyName", { ns: "updateMetadata" })).description(i18next.t("values.modificationDate.description", { ns: "updateMetadata" }))
            .example("YYYY-MM-DD").example("2023-01-27"),    // The modification date of the document (format: yyyy/MM/dd HH:mm:ss)
        producer: Joi.string().optional().allow('')
            .label(i18next.t("values.producer.friendlyName", { ns: "updateMetadata" })).description(i18next.t("values.producer.description", { ns: "updateMetadata" }))
            .example("John Doe").example("Anthony Stirling"),          // The producer of the document
        subject: Joi.string().optional().allow('')
            .label(i18next.t("values.subject.friendlyName", { ns: "updateMetadata" })).description(i18next.t("values.subject.description", { ns: "updateMetadata" }))
            .example("Subject").example("This is an example Subject."),           // The subject of the document
        title: Joi.string().optional().allow('')
            .label(i18next.t("values.title.friendlyName", { ns: "updateMetadata" })).description(i18next.t("values.title.description", { ns: "updateMetadata" }))
            .example("Title").example("This is an example title."),             // The title of the document
        
        // TODO: trapped?: string,           // The trapped status of the document
        
        // TODO: allRequestParams?: {[key: string]: [key: string]},  // Map list of key and value of custom parameters. Note these must start with customKey and customValue if they are non-standard
    });
    protected static outputSchema = JoiPDFFileSchema.label(i18next.t("outputs.pdffile.name")).description(i18next.t("outputs.pdffile.description"));

    static schema = Joi.object({
        input: UpdateMetadata.inputSchema,
        values: UpdateMetadata.valueSchema.required(),
        output: UpdateMetadata.outputSchema
    }).label(i18next.t("friendlyName", { ns: "updateMetadata" })).description(i18next.t("description", { ns: "updateMetadata" }));


    /**
     * Logic
     */

    /** PDF extraction, specify pages from one pdf and output them to a new pdf */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {

            const pdfDoc = await input.pdfLibDocument;

            if (this.actionValues.deleteAll) {
                pdfDoc.setAuthor("");
                pdfDoc.setCreationDate(new Date(0));
                pdfDoc.setCreator("");
                pdfDoc.setKeywords([]);
                pdfDoc.setModificationDate(new Date(0));
                pdfDoc.setProducer("");
                pdfDoc.setSubject("");
                pdfDoc.setTitle("");
            }
            
            if(this.actionValues.author)
                pdfDoc.setAuthor(this.actionValues.author);
            if(this.actionValues.creationDate)
                pdfDoc.setCreationDate(this.actionValues.creationDate);
            if(this.actionValues.creator)
                pdfDoc.setCreator(this.actionValues.creator);
            if(this.actionValues.keywords)
                pdfDoc.setKeywords(this.actionValues.keywords.split(","));
            if(this.actionValues.modificationDate)
                pdfDoc.setModificationDate(this.actionValues.modificationDate);
            if(this.actionValues.producer)
                pdfDoc.setProducer(this.actionValues.producer);
            if(this.actionValues.subject)
                pdfDoc.setSubject(this.actionValues.subject);
            if(this.actionValues.title)
                pdfDoc.setTitle(this.actionValues.title);

            // TODO: add trapped and custom metadata. May need another library

            progressCallback({ curFileProgress: 1, operationProgress: index/max });

            input.filename += "_updatedMetadata";
            return input;
        });
    }
}