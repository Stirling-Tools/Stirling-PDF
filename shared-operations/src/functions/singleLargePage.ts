
import { PdfFile, RepresentationType } from "../wrappers/PdfFile";
import { Operator, Progress, oneToOne } from ".";

import { PDFDocument } from "pdf-lib";

export class SingleLargePage extends Operator {
    /** Merging pages from multiple pdfs into a singe output document. */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input) => {
            const source = await input.pdfLibDocument;
            const pages = source.getPages();
            
            const result = await PDFDocument.create(); 

            // Calculate total height and maximum width
            let totalHeight = 0;
            let maxWidth = 0;
            pages.forEach(page => {
                const { width, height } = page.getSize();
                totalHeight += height;
                if (width > maxWidth) {
                    maxWidth = width;
                }
            });
 
            // Add a single large page to the new document
            const largePage = result.addPage([maxWidth, totalHeight]);
 
            const pageBytes = await source.save();
            
            // Draw each page from the original PDF onto the large page
            let currentHeight = 0;
            for (const page of pages) {
                const { width, height } = page.getSize();
 
                // Embed the original page into the new large page
                const [embeddedPage] = await result.embedPdf(pageBytes, [pages.indexOf(page)]);
 
                // Draw the embedded page onto the large page
                largePage.drawPage(embeddedPage, {
                    x: 0,
                    y: totalHeight - currentHeight - height,
                    width,
                    height,
                });
 
                currentHeight += height;
            }
            
            progressCallback({ curFileProgress: 0, operationProgress: 1 });

            return new PdfFile("mergedPDF", result, RepresentationType.PDFLibDocument, "extended_" + input.filename);
        });
    }
}