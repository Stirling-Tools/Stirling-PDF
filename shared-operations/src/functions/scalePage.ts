import { Operator, Progress, oneToOne } from ".";

import { PDFPage } from "pdf-lib";
import { PdfFile, RepresentationType } from "../wrappers/PdfFile";

export class ScalePage extends Operator {
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