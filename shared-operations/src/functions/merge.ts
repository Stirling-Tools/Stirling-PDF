
import { PdfFile, RepresentationType } from "../wrappers/PdfFile";
import { Operator, Progress, nToOne } from ".";

import { PDFDocument } from "pdf-lib";

export class Merge extends Operator {
    /** Merging pages from multiple pdfs into a singe output document. */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return nToOne<PdfFile, PdfFile>(input, async (input) => {
            const mergedPdf = await PDFDocument.create(); 

            for (let i = 0; i < input.length; i++) {
                progressCallback({ curFileProgress: 0, operationProgress: i/input.length });
                const pdfToMerge = await input[i].pdfLibDocument;
                const copiedPages = await mergedPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
                copiedPages.forEach((page, index, array) => {
                    progressCallback({ curFileProgress: index/array.length, operationProgress: i/input.length });
                    mergedPdf.addPage(page);
                });
                progressCallback({ curFileProgress: 1, operationProgress: i/input.length });
            }
            progressCallback({ curFileProgress: 1, operationProgress: 1 });


            const newName = "merged_" + input.map(input => input.filename).join("_and_");
            return new PdfFile("mergedPDF", mergedPdf, RepresentationType.PDFLibDocument, newName);

        });
    }
}