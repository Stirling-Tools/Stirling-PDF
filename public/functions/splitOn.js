import { detectEmptyPages } from "./shared/detectEmptyPages.js";
import { getImagesOnPage } from "./shared/getImagesOnPage.js";
import { createSubDocument } from "./shared/createSubDocument.js";

/**
 * @typedef {"BAR_CODE"|"QR_CODE"|"BLANK_PAGE"} SplitType
 */

/**
 * 
 * @param {Uint16Array} snapshot
 * @param {SplitType} type
 * @param {} PDFJS
 * @param {import('opencv-wasm')} OpenCV
 * @param {} PDFLib
 * @returns 
 */
export async function splitOn(snapshot, type, whiteThreashold, PDFJS, OpenCV, PDFLib, jsQR) {
    
    let splitAtPages = [];

    switch (type) {
        case "BAR_CODE":
            // TODO: Implement
            throw new Error("This split-type has not been implemented yet");
            break;

        case "QR_CODE":
            splitAtPages = await getPagesWithQRCode(snapshot);
            break;

        case "BLANK_PAGE":
            splitAtPages = await detectEmptyPages(snapshot, whiteThreashold, PDFJS, OpenCV);
            break;
    
        default:
            throw new Error("An invalid split-type was provided.")
            break;
    }

    console.log("Split At Pages: ", splitAtPages);

    // Remove detected Pages & Split
    const pdfDoc = await PDFLib.PDFDocument.load(snapshot);

    const numberOfPages = pdfDoc.getPages().length;

    let pagesArray = [];
    let splitAfter = splitAtPages.shift();
    const subDocuments = [];

    for (let i = 0; i < numberOfPages; i++) {
        console.log(i);
        if(i == splitAfter) {
            if(pagesArray.length > 0) {
                subDocuments.push(await createSubDocument(pdfDoc, pagesArray, PDFLib));
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
        subDocuments.push(await createSubDocument(pdfDoc, pagesArray, PDFLib)); 
    }
    pagesArray = [];

    return subDocuments;

    async function getPagesWithQRCode(snapshot) {
        const pdfDoc = await PDFJS.getDocument(snapshot).promise;

        const pagesWithQR = [];
        for (let i = 0; i < pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i + 1);

            const images = await getImagesOnPage(page, PDFJS);

            for (const image of images) {
                const data = await checkForQROnImage(image);
                if(data == "https://github.com/Frooodle/Stirling-PDF") {
                    pagesWithQR.push(i);
                }
            }
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