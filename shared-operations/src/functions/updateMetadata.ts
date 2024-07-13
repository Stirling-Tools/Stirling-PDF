import { PdfFile } from "../wrappers/PdfFile";
import { Operator, Progress, oneToOne } from ".";

import Joi from "@stirling-tools/joi";

import { JoiPDFFileSchema } from "../wrappers/PdfFileJoi";

import i18next from "i18next";

export class UpdateMetadata extends Operator {
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