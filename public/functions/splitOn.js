import { detectEmptyPages } from "./shared/detectEmptyPages";

/**
 * @typedef {"BAR_CODE"|"QR_CODE"|"BLANK_PAGE"} SplitType
 */

/**
 * 
 * @param {Uint16Array} snapshot
 * @param {SplitType} type
 * @param {} PDFJS
 * @param {} OpenCV
 * @param {} PDFLib
 * @param {} QRCode
 * @returns 
 */
export async function splitOn(snapshot, type, whiteThreashold, PDFJS, OpenCV, PDFLib, QRCode) {
    
    let splitAtPages = [];

    switch (type) {
        case "BAR_CODE":
            // TODO: Implement
            throw new Error("This split-type has not been implemented yet")
            break;

        case "QR_CODE":
            // TODO: Implement
            throw new Error("This split-type has not been implemented yet")
            break;

        case "BLANK_PAGE":
            splitAtPages = await detectEmptyPages(snapshot, whiteThreashold, PDFJS, OpenCV);
            break;
    
        default:
            throw new Error("An invalid split-type was provided.")
            break;
    }

    console.log("Split At Pages: ", splitAtPages);

    const pdfDoc = await PDFLib.PDFDocument.load(snapshot);

    // TODO: Remove detected Pages & Split

    return pdfDoc.save();
};