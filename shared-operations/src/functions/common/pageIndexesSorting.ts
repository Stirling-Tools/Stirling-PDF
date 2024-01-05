
/**
 * @param pages A list of page indexes, or the number of total pages in the document (which will be converted into a list of page indexes).
 * @returns A reversed list of page indexes.
 */
function reverseSort(pages: number|number[]): number[] {
    const indexes = Array.isArray(pages) ? pages : [...Array(pages).keys()];
    return indexes.reverse();
}

/**
 * Sorts page indexes as if all fronts were scanned then all backs in reverse (1, n, 2, n-1, ...).
 * @param pages A list of page indexes, or the number of total pages in the document (which will be converted into a list of page indexes).
 * @returns A duplex-sorted list of page indexes.
 */
function duplexSort(pages: number|number[]): number[] {
    const indexes = Array.isArray(pages) ? pages : [...Array(pages).keys()];

    // Translated to JS from the original Java function
    const newPageOrder: number[] = [];
    const half = Math.floor((indexes.length + 1) / 2); // This ensures proper behavior with odd numbers of pages

    for (let i = 1; i <= half; i++) {
        newPageOrder.push(indexes[i - 1]);
        if (i <= indexes.length - half) {
            // Avoid going out of bounds
            newPageOrder.push(indexes[indexes.length - i]);
        }
    }

    return newPageOrder;
}

/**
 * TODO: This code is bugged. With even pages it is just duplexSort() and with odd pages, a page is duplicated!
 * 
 * Arranges pages for booklet printing (last, first, second, second last, ...).
 * @param pages A list of page indexes, or the number of total pages in the document (which will be converted into a list of page indexes).
 * @returns A booklet-sorted list of page indexes.
 */
function bookletSort(totalPages: number): number[] {
    const newPageOrder: number[] = [];
    for (let i = 0; i < totalPages / 2; i++) {
        newPageOrder.push(i);
        newPageOrder.push(totalPages - i - 1);
    }
    return newPageOrder;
}

/**
 * TODO: find out what this does
 * @param pages 
 * @returns 
 */
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

/**
 * Splits and arranges pages into odd and even numbered pages.
 * @param pages A list of page indexes, or the number of total pages in the document (which will be converted into a list of page indexes).
 * @returns An odd-even split list of page indexes.
 */
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

/**
 * Removes the first page from the list of index selections.
 * @param pages A list of page indexes, or the number of total pages in the document (which will be converted into a list of page indexes).
 * @returns The list of page indexes, without the first page.
 */
function removeFirst(totalPages: number): number[] {
    return [...Array(totalPages-1).keys()].map(i => i+1);
}

/**
 * Removes the last page from the list of index selections.
 * @param pages A list of page indexes, or the number of total pages in the document (which will be converted into a list of page indexes).
 * @returns The list of page indexes, without the last page.
 */
function removeLast(totalPages: number): number[] {
    return [...Array(totalPages-1).keys()];
}

/**
 * Removes the first and last pages from the list of index selections.
 * @param pages A list of page indexes, or the number of total pages in the document (which will be converted into a list of page indexes).
 * @returns The list of page indexes, without the first and last pages.
 */
function removeFirstAndLast(totalPages: number): number[] {
    return [...Array(totalPages-2).keys()].map(i => i+1);
}

export type SortFunction = (totalPages: number) => number[];
type Sorts = Record<string, SortFunction>;
export const Sorts: Sorts = Object.freeze({
    "REVERSE_ORDER": reverseSort,
    "DUPLEX_SORT": duplexSort,
    "BOOKLET_SORT": bookletSort,
    "SIDE_STITCH_BOOKLET_SORT": sideStitchBooklet,
    "ODD_EVEN_SPLIT": oddEvenSplit,
    "REMOVE_FIRST": removeFirst,
    "REMOVE_LAST": removeLast,
    "REMOVE_FIRST_AND_LAST": removeFirstAndLast,
});
