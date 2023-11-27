
import Joi from 'joi';
import { PDFPage } from 'pdf-lib';
import { PdfFile, RepresentationType, JoiPdfFileSchema } from '../wrappers/PdfFile';

const whSchema = Joi.string().custom((value, helpers) => {
    console.log("value.pageSize", typeof value)
    try {
        const obj = JSON.parse(value);
        if (!obj.width && !obj.height) {
            return helpers.error('any.required', { message: 'At least one of width/height must be present' });
        }
        if (typeof obj.width != 'number' && typeof obj.width != 'undefined') {
            return helpers.error('any.invalid', { message: 'Width must be a number if present' });
        }
        if (typeof obj.height != 'number' && typeof obj.height != 'undefined') {
            return helpers.error('any.invalid', { message: 'Height must be a number if present' });
        }
        return obj;
    } catch (error) {
        return helpers.error('any.invalid', { message: 'Value must be a valid JSON' });
    }
});

export const ScalePageSchema = Joi.object({
    file: JoiPdfFileSchema.required(),
    pageSize: Joi.alternatives().try(whSchema, Joi.array().items(whSchema)).required(),
});


export type ScalePageParamsType = {
    file: PdfFile;
    pageSize: { width?:number,height?:number }|{ width?:number,height?:number }[];
}

export async function scalePage(params: ScalePageParamsType): Promise<PdfFile> {
    const { file, pageSize } = params;

    const pdfDoc = await file.pdfLibDocument;
    const pages = pdfDoc.getPages();

    if (Array.isArray(pageSize)) {
        if (pageSize.length != pages.length) {
            throw new Error(`Number of given sizes '${pageSize.length}' is not the same as the number of pages '${pages.length}'`)
        }
        for (let i=0; i<pageSize.length; i++) {
            resize(pages[i], pageSize[i]);
        }
    } else {
        pages.forEach(page => resize(page, pageSize));
    }
    
    return new PdfFile(file.originalFilename, pdfDoc, RepresentationType.PDFLibDocument, file.filename+"_scaledPages");
};

function resize(page: PDFPage, newSize: {width?:number,height?:number}) {
    const calculatedSize = calculateSize(page, newSize);
    const xRatio = calculatedSize.width / page.getWidth();
    const yRatio = calculatedSize.height / page.getHeight();

    page.setSize(calculatedSize.width, calculatedSize.height);
    page.scaleContent(xRatio, yRatio);
}

function calculateSize(page: PDFPage, newSize: {width?:number,height?:number}): {width:number,height:number} {
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
    return { width: newSize.width!, height: newSize.height! };
}

export const PageSize = Object.freeze({
    a4: {
        width: 594.96,
        height: 841.92
    },
    letter: {
        width: 612,
        height: 792
    }
});