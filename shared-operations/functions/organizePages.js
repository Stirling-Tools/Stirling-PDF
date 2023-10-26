
import PDFLib from 'pdf-lib';

/**
 * @typedef {"CUSTOM_PAGE_ORDER"|"REVERSE_ORDER"|"DUPLEX_SORT"|"BOOKLET_SORT"|"ODD_EVEN_SPLIT"|"REMOVE_FIRST"|"REMOVE_LAST"|"REMOVE_FIRST_AND_LAST"} OrderOperation
 */

/**
 * 
 * @param {Uint16Array} snapshot
 * @param {OrderOperation} operation
 * @param {string} customOrderString
 * @param {import('pdf-lib')} PDFLib
 * @returns 
 */
export async function organizePages(snapshot, operation, customOrderString) {
    const pdfDoc = await PDFLib.PDFDocument.load(snapshot);
    let subDocument = await PDFLib.PDFDocument.create();
    const copiedPages = await subDocument.copyPages(pdfDoc, pdfDoc.getPageIndices());


    const pageCount = pdfDoc.getPages().length;

    switch (operation) {
        case "CUSTOM_PAGE_ORDER":
            console.log("Custom Order");
            const pageOrderArray = parseCustomPageOrder(customOrderString, pageCount);
            console.log(pageOrderArray);

            const customOrderedPages = pageOrderArray.map((pageIndex) => copiedPages[pageIndex]);
            customOrderedPages.forEach((page) => subDocument.addPage(page));
            break;
        case "REVERSE_ORDER":
            const reversedPages = [];
            for (let i = pageCount - 1; i >= 0; i--) {
                reversedPages.push(copiedPages[i]);
            }
            reversedPages.forEach((page) => subDocument.addPage(page));
            break;
        case 'DUPLEX_SORT': //TODO: Needs to be checked by someone who knows more about duplex printing.
            const duplexPages = [];
            const half = (pageCount + 1) / 2
            for (let i = 1; i <= half; i++) {
                duplexPages.push(copiedPages[i - 1]);
                if (i <= pageCount - half) {
                    duplexPages.push(copiedPages[pageCount - i]);
                }
            }
            duplexPages.forEach((page) => subDocument.addPage(page));
            break;
        case 'BOOKLET_SORT':
            const bookletPages = [];
            for (let i = 0; i < pageCount / 2; i++) {
                bookletPages.push(copiedPages[i]);
                bookletPages.push(copiedPages[pageCount - i - 1]);
            }
            bookletPages.forEach((page) => subDocument.addPage(page));
            break;
        case 'ODD_EVEN_SPLIT':
            const oddPages = [];
            const evenPages = [];
            for (let i = 0; i < pageCount; i++) {
                if (i % 2 === 0) {
                    evenPages.push(copiedPages[i]);
                } else {
                    oddPages.push(copiedPages[i]);
                }
            }
            oddPages.forEach((page) => subDocument.addPage(page));
            evenPages.forEach((page) => subDocument.addPage(page));
            break;
        case 'REMOVE_FIRST':
            pdfDoc.removePage(0);
            subDocument = pdfDoc;
            break;
        case 'REMOVE_LAST':
            pdfDoc.removePage(pageCount - 1);
            subDocument = pdfDoc;
            break;
        case 'REMOVE_FIRST_AND_LAST':
            pdfDoc.removePage(0);
            pdfDoc.removePage(pageCount - 2);
            subDocument = pdfDoc;
            break;
        default:
            throw new Error("Operation not supported");
            break;
    }

    return subDocument.save();
};

function parseCustomPageOrder(customOrder, pageCount) {
    const pageOrderArray = [];
    const ranges = customOrder.split(',');

    ranges.forEach((range) => {
        if (range.includes('-')) {
            const [start, end] = range.split('-').map(Number);
            for (let i = start; i <= end; i++) {
                pageOrderArray.push(i - 1);
            }
        } else if (range.includes('n')) {
            const [even, odd] = range.split('n').map(Number);
            for (let i = 1; i <= pageCount; i++) {
                if (i % 2 === 0) {
                    pageOrderArray.push((i * even) - 1);
                } else {
                    pageOrderArray.push((i * odd) - 1);
                }
            }
        } else {
            pageOrderArray.push(Number(range) - 1);
        }
    });

    return pageOrderArray;
}