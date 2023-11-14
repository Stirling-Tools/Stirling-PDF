
import { PdfFile } from '../../wrappers/PdfFile';
import { PDFPageProxy } from "pdfjs-dist/types/src/display/api.js";
import { Image } from 'image-js';

import { getImagesOnPage } from "./getImagesOnPage.js";

export async function detectEmptyPages(file: PdfFile, whiteThreashold: number): Promise<number[]> {
    const pdfDoc = await file.pdfJsDocument;

    const emptyPages: number[] = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        console.log("Checking page " + i);

        if(!await hasText(page)) {
            console.log(`Found text on Page ${i}, page is not empty`);
            continue;
        }

        if(!await areImagesBlank(page, whiteThreashold)) {
            console.log(`Found non white image on Page ${i}, page is not empty`);
            continue;
        }

        console.log(`Page ${i} is empty.`);
        emptyPages.push(i - 1);
    }
    return emptyPages;
}

async function hasText(page: PDFPageProxy): Promise<boolean> {
    const textContent = await page.getTextContent();
    return textContent.items.length === 0;
}

async function areImagesBlank(page: PDFPageProxy, threshold: number): Promise<boolean> {
    const images = await getImagesOnPage(page);
    for (const image of images) {
        if(!await isImageBlank(image, threshold))
            return false;
    }
    return true;
}

async function isImageBlank(image: string | Uint8Array | ArrayBuffer, threshold: number): Promise<boolean> {
    var img = await Image.load(image);
    var grey = img.grey();
    var mean = grey.getMean();
    return mean[0] <= threshold;
}