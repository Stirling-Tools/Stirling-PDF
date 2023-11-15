
import { PDFDocument } from 'pdf-lib';
import { PdfFile, RepresentationType } from '../wrappers/PdfFile.js';
import { detectEmptyPages } from "./common/detectEmptyPages.js";


export type SortPagesWithPresetParamsType = {
    file: PdfFile;
    sortPreset: string;
    fancyPageSelector: string;
}
export async function sortPagesWithPreset(params: SortPagesWithPresetParamsType) {
    const { file, sortPreset } = params;

    if (sortPreset === "CUSTOM_PAGE_ORDER") {
        return rearrangePages(params); // fancyPageSelector passed down with params
    }

    const sortFunction = sorts[sortPreset];
    if (!sortFunction) {
        throw new Error("Operation not supported");
    }

    const pdflibDocument = await file.pdflibDocument;
    
    const pageCount = pdflibDocument.getPageCount();
    const sortIndecies = sortFunction(pageCount);
    return selectPages({file: file, pagesToExtractArray: sortIndecies});
}

export type RearrangePagesParamsType = {
    file: PdfFile;
    sortPreset: string;
    fancyPageSelector: string;
}
export async function rearrangePages(params: RearrangePagesParamsType): Promise<PdfFile> {
    const { file, fancyPageSelector } = params;

    const pdflibDocument = await file.pdflibDocument;

    const pagesToExtractArray = parseFancyPageSelector(fancyPageSelector, pdflibDocument.getPageCount());
    const newDocument = selectPages({file: file, pagesToExtractArray});
    return newDocument;
};

export type SelectPagesParamsType = {
    file: PdfFile;
    pagesToExtractArray: number[];
}
export async function selectPages(params: SelectPagesParamsType): Promise<PdfFile> {
    const { file, pagesToExtractArray } = params;

    const pdflibDocument = await file.pdflibDocument;

    const subDocument = await PDFDocument.create();

    // Check that array max number is not larger pdf pages number
    if(Math.max(...pagesToExtractArray) >= pdflibDocument.getPageCount()) {
        throw new Error(`The PDF document only has ${pdflibDocument.getPageCount()} pages and you tried to extract page ${Math.max(...pagesToExtractArray)}`);
    }

    const copiedPages = await subDocument.copyPages(pdflibDocument, pagesToExtractArray);

    for (let i = 0; i < copiedPages.length; i++) {
        subDocument.addPage(copiedPages[i]);
    }

    return new PdfFile(file.originalFilename, subDocument, RepresentationType.PDFLibDocument, file.filename);
}

export type RemovePagesParamsType = {
    file: PdfFile;
    pagesToRemoveArray: number[];
}
export async function removePages(params: RemovePagesParamsType): Promise<PdfFile> {
    const { file, pagesToRemoveArray } = params;

    const pdflibDocument = await file.pdflibDocument;

    const pagesToExtractArray = invertSelection(pagesToRemoveArray, pdflibDocument.getPageIndices())
    return selectPages({file: file, pagesToExtractArray});
}

export type RemoveBlankPagesParamsType = {
    file: PdfFile;
    whiteThreashold: number;
}
export async function removeBlankPages(params: RemoveBlankPagesParamsType) {
    const { file, whiteThreashold } = params;

    const emptyPages = await detectEmptyPages(file, whiteThreashold);
    console.log("Empty Pages: ", emptyPages);
    return removePages({file, pagesToRemoveArray:emptyPages});
}


/**
 * Parse the page selector string used in the 'PDF Page Organizer'
 * @param pageOrderArr 
 * @param totalPages 
 * @returns 
 */
function parseFancyPageSelector(pageNumbers: string, totalPages: number): number[] {
    // Translated to JS from the original Java function
    const pageOrderArr = pageNumbers.split(",")
    const newPageOrder: number[] = [];

    // loop through the page order array
    pageOrderArr.forEach(element => {
        if (element.toLocaleLowerCase() === "all") {
            for (var i = 0; i < totalPages; i++) {
                newPageOrder.push(i);
            }
            // As all pages are already added, no need to check further
            return;
        }
        else if (element.match("\\d*n\\+?-?\\d*|\\d*\\+?n")) {
            // Handle page order as a function
            var coefficient = 0;
            var constant = 0;
            var coefficientExists = false;
            var constantExists = false;

            if (element.includes("n")) {
                var parts = element.split("n");
                if (!parts[0]) {
                    coefficient = parseInt(parts[0]);
                    coefficientExists = true;
                }
                if (parts.length > 1 && parts[1]) {
                    constant = parseInt(parts[1]);
                    constantExists = true;
                }
            } else if (element.includes("+")) {
                constant = parseInt(element.replace("+", ""));
                constantExists = true;
            }

            for (var i = 1; i <= totalPages; i++) {
                var pageNum = coefficientExists ? coefficient * i : i;
                pageNum += constantExists ? constant : 0;

                if (pageNum <= totalPages && pageNum > 0) {
                    newPageOrder.push(pageNum - 1);
                }
            }
        } else if (element.includes("-")) {
            // split the range into start and end page
            const range = element.split("-");
            const start = parseInt(range[0]);
            var end = parseInt(range[1]);
            // check if the end page is greater than total pages
            if (end > totalPages) {
                end = totalPages;
            }
            // loop through the range of pages
            for (var j = start; j <= end; j++) {
                // print the current index
                newPageOrder.push(j - 1);
            }
        } else {
            // if the element is a single page
            newPageOrder.push(parseInt(element) - 1);
        }
    });

    return newPageOrder;
}

function invertSelection(selection: number[], pageIndecies: number[]): number[] {
    const pageIndeciesCopy = [...pageIndecies];
    return pageIndeciesCopy.filter(x => !selection.includes(x));
}

//////////////////
// Page Sorters //
//////////////////
function reverseSort(totalPages: number): number[] {
    return [...Array(totalPages).keys()].reverse();
}

function duplexSort(totalPages: number): number[] {
    // Translated to JS from the original Java function
    const newPageOrder: number[] = [];
    const half = Math.floor((totalPages + 1) / 2); // This ensures proper behavior with odd numbers of pages

    for (let i = 1; i <= half; i++) {
        newPageOrder.push(i - 1);
        if (i <= totalPages - half) {
            // Avoid going out of bounds
            newPageOrder.push(totalPages - i);
        }
    }

    return newPageOrder;
}

function bookletSort(totalPages: number): number[] {
    const newPageOrder: number[] = [];
    for (let i = 0; i < totalPages / 2; i++) {
        newPageOrder.push(i);
        newPageOrder.push(totalPages - i - 1);
    }
    return newPageOrder;
}

function sideStitchBooklet(totalPages: number): number[] {
    const newPageOrder: number[] = [];
    for (let i = 0; i < (totalPages + 3) / 4; i++) {
      const begin = i * 4;
      newPageOrder.push(Math.min(begin + 3, totalPages - 1));
      newPageOrder.push(Math.min(begin, totalPages - 1));
      newPageOrder.push(Math.min(begin + 1, totalPages - 1));
      newPageOrder.push(Math.min(begin + 2, totalPages - 1));
    }
    return newPageOrder;
}

function oddEvenSplit(totalPages: number): number[] {
    const newPageOrder: number[] = [];
    for (let i = 1; i <= totalPages; i += 2) {
      newPageOrder.push(i - 1);
    }
    for (let i = 2; i <= totalPages; i += 2) {
      newPageOrder.push(i - 1);
    }
    return newPageOrder;
}

function removeFirst(totalPages: number): number[] {
    return [...Array(totalPages-1).keys()].map(i => i+1);
}

function removeLast(totalPages: number): number[] {
    return [...Array(totalPages-1).keys()];
}

function removeFirstAndLast(totalPages: number): number[] {
    return [...Array(totalPages-2).keys()].map(i => i+1);
}

export type SortFunction = (totalPages: number) => number[];
type Sorts = {
    [key: string]: SortFunction;
};
export const sorts: Sorts = Object.freeze({
    "REVERSE_ORDER": reverseSort,
    "DUPLEX_SORT": duplexSort,
    "BOOKLET_SORT": bookletSort,
    "SIDE_STITCH_BOOKLET_SORT": sideStitchBooklet,
    "ODD_EVEN_SPLIT": oddEvenSplit,
    "REMOVE_FIRST": removeFirst,
    "REMOVE_LAST": removeLast,
    "REMOVE_FIRST_AND_LAST": removeFirstAndLast,
});
