
import jsQR from "jsqr";

import { detectEmptyPages } from "./common/detectEmptyPages.js";
import { getImagesOnPage } from "./common/getImagesOnPage.js";
import { selectPages } from "./subDocumentFunctions";
import { PdfFile } from '../wrappers/PdfFile.js';

export type SplitOnParamsType = {
    file: PdfFile;
    type: "BAR_CODE"|"QR_CODE"|"BLANK_PAGE";
    whiteThreashold: number;
}

export async function splitOn(params: SplitOnParamsType) {
    const { file, type, whiteThreashold } = params;

    let splitAtPages: number[] = [];
    
    console.log("File: ", file);

    switch (type) {
        case "BAR_CODE":
            // TODO: Implement
            throw new Error("This split-type has not been implemented yet");

        case "QR_CODE":
            splitAtPages = await getPagesWithQRCode(file);
            break;

        case "BLANK_PAGE":
            splitAtPages = await detectEmptyPages(file, whiteThreashold);
            break;
    
        default:
            throw new Error("An invalid split-type was provided.");
    }

    console.log("Split At Pages: ", splitAtPages);

    console.log("File: ", file);

    // Remove detected Pages & Split
    const pdfDoc = await file.pdfLibDocument;
    const numberOfPages = pdfDoc.getPageCount();

    let pagesArray: number[] = [];
    let splitAfter = splitAtPages.shift();
    const subDocuments: PdfFile[] = [];

    for (let i = 0; i < numberOfPages; i++) {
        console.log(i);
        if(i == splitAfter) {
            if(pagesArray.length > 0) {
                subDocuments.push(await selectPages({file, pagesToExtractArray:pagesArray}));
                pagesArray = [];
            }
            splitAfter = splitAtPages.shift();
        }
        else { // Skip splitAtPage
            console.log("PagesArray")
            pagesArray.push(i);
        }
    }
    if(pagesArray.length > 0) {
        subDocuments.push(await selectPages({file, pagesToExtractArray:pagesArray}));
    }
    pagesArray = [];

    return subDocuments;

    async function getPagesWithQRCode(file: PdfFile) {
        console.log("FileInQRPrev: ", file);
        const pdfDoc = await file.pdfJsDocument;
        console.log("FileInQRAfter: ", file);

        const pagesWithQR: number[] = [];
        for (let i = 0; i < pdfDoc.numPages; i++) {
            console.log("Page:", i, "/", pdfDoc.numPages);
            const page = await pdfDoc.getPage(i + 1);

            const images = await getImagesOnPage(page);
            // console.log("images:", images);
            for (const image of images) {
                const data = await checkForQROnImage(image);
                if(data == "https://github.com/Frooodle/Stirling-PDF") {
                    pagesWithQR.push(i);
                }
            }
        }
        if(pagesWithQR.length == 0) {
            console.warn("Could not find any QR Codes in the provided PDF.")
        }
        return pagesWithQR;
    }

    async function checkForQROnImage(image: any) {
        // TODO: There is an issue with the jsQR package (The package expects rgba but sometimes we have rgb), and the package seems to be stale, we could create a fork and fix the issue. In the meanwhile we just force rgba:
        // Check for rgb and convert to rgba

        if(image.data.length == image.width * image.height * 3) {
            const tmpArray = new Uint8ClampedArray(image.width * image.height * 4);

            // Iterate through the original array and add an alpha channel
            for (let i = 0, j = 0; i < image.data.length; i += 3, j += 4) {
                tmpArray[j] = image.data[i];     // Red channel
                tmpArray[j + 1] = image.data[i + 1]; // Green channel
                tmpArray[j + 2] = image.data[i + 2]; // Blue channel
                tmpArray[j + 3] = 255;               // Alpha channel (fully opaque)
            }

            image.data = tmpArray;
        }

        const code = jsQR(image.data, image.width, image.height);
        if(code)
            return code.data;
        else
            return null;
    }
};
