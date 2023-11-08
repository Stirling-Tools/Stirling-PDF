
import { PDFDocument } from 'pdf-lib';
import PDFJS from 'pdfjs-dist';

import { detectEmptyPages } from "./detectEmptyPages.js";
import { getImagesOnPage } from "./getImagesOnPage.js";
import { createSubDocument } from "./createSubDocument.js";
import { TypedArray, DocumentInitParameters } from 'pdfjs-dist/types/src/display/api.js';

export async function splitOn(
            snapshot: string | ArrayBuffer | Uint8Array,
            type: "BAR_CODE"|"QR_CODE"|"BLANK_PAGE",
            whiteThreashold: number,
            jsQR: (arg0: any, arg1: number, arg2: number) => any) {
    let splitAtPages: number[] = [];

    switch (type) {
        case "BAR_CODE":
            // TODO: Implement
            throw new Error("This split-type has not been implemented yet");

        case "QR_CODE":
            splitAtPages = await getPagesWithQRCode(snapshot);
            break;

        case "BLANK_PAGE":
            splitAtPages = await detectEmptyPages(snapshot, whiteThreashold);
            break;
    
        default:
            throw new Error("An invalid split-type was provided.");
    }

    console.log("Split At Pages: ", splitAtPages);

    // Remove detected Pages & Split
    const pdfDoc = await PDFDocument.load(snapshot);

    const numberOfPages = pdfDoc.getPages().length;

    let pagesArray: number[] = [];
    let splitAfter = splitAtPages.shift();
    const subDocuments: Uint8Array[] = [];

    for (let i = 0; i < numberOfPages; i++) {
        console.log(i);
        if(i == splitAfter) {
            if(pagesArray.length > 0) {
                subDocuments.push(await createSubDocument(pdfDoc, pagesArray));
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
        subDocuments.push(await createSubDocument(pdfDoc, pagesArray));
    }
    pagesArray = [];

    return subDocuments;

    async function getPagesWithQRCode(snapshot: string | ArrayBuffer | URL | TypedArray | DocumentInitParameters) {
        const pdfDoc = await PDFJS.getDocument(snapshot).promise;

        const pagesWithQR: number[] = [];
        for (let i = 0; i < pdfDoc.numPages; i++) {
            console.log("Page:", i, "/", pdfDoc.numPages);
            const page = await pdfDoc.getPage(i + 1);

            const images = await getImagesOnPage(page);
            console.log("images:", images);
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

    async function checkForQROnImage(image) {
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