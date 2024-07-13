import { Operator, Progress, oneToOne } from ".";

import { degrees } from "pdf-lib";
import { PdfFile, RepresentationType } from "../wrappers/PdfFile";

export class RotatePages extends Operator {
    /** Detect and remove white pages */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {

            const pdfDoc = await input.pdfLibDocument;
            const pages = pdfDoc.getPages();

            // Different rotations applied to each page
            if (Array.isArray(this.actionValues.rotation)) {
                if (this.actionValues.rotation.length != pages.length) {
                    throw new Error(`Number of given rotations '${this.actionValues.rotation.length}' is not the same as the number of pages '${pages.length}'`);
                }
                for (let pageIdx = 0; pageIdx < this.actionValues.rotation.length; pageIdx++) {
                    const oldRotation = pages[pageIdx].getRotation().angle;
                    pages[pageIdx].setRotation(degrees(oldRotation + this.actionValues.rotation[pageIdx]));

                    progressCallback({ curFileProgress: pageIdx/pages.length, operationProgress: index/max });
                }
            } 
            // Only one rotation applied to each page
            else {
                pages.forEach((page, pageIdx) => {
                    // Change page size
                    const oldRotation = page.getRotation().angle;
                    page.setRotation(degrees(oldRotation + this.actionValues.rotation));
                    progressCallback({ curFileProgress: pageIdx/pages.length, operationProgress: index/max });
                });
            }

            progressCallback({ curFileProgress: 1, operationProgress: index/max });

            return new PdfFile(input.originalFilename, pdfDoc, RepresentationType.PDFLibDocument, input.filename + "_rotated");
        });
    }
}
