/**
 * @licstart The following is the entire license notice for the
 * JavaScript code in this page
 *
 * Copyright 2023 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @licend The above is the entire license notice for the
 * JavaScript code in this page
 */

(function webpackUniversalModuleDefinition(root, factory) {
    if (typeof exports === 'object' && typeof module === 'object')
        module.exports = root.pdfjsViewer = factory();
    else if (typeof define === 'function' && define.amd)
        define("pdfjs-dist/web/pdf_viewer", [], () => {
            return (root.pdfjsViewer = factory());
        });
    else if (typeof exports === 'object')
        exports["pdfjs-dist/web/pdf_viewer"] = root.pdfjsViewer = factory();
    else
        root["pdfjs-dist/web/pdf_viewer"] = root.pdfjsViewer = factory();
})(globalThis, () => {
    return /******/ (() => { // webpackBootstrap
        /******/
        "use strict";
        /******/
        var __webpack_modules__ = ([
            /* 0 */,
            /* 1 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.PDFFindController = exports.FindState = void 0;
                var _ui_utils = __w_pdfjs_require__(2);
                var _pdf_find_utils = __w_pdfjs_require__(3);
                var _pdfjsLib = __w_pdfjs_require__(4);
                const FindState = {
                    FOUND: 0,
                    NOT_FOUND: 1,
                    WRAPPED: 2,
                    PENDING: 3
                };
                exports.FindState = FindState;
                const FIND_TIMEOUT = 250;
                const MATCH_SCROLL_OFFSET_TOP = -50;
                const MATCH_SCROLL_OFFSET_LEFT = -400;
                const CHARACTERS_TO_NORMALIZE = {
                    "\u2010": "-",
                    "\u2018": "'",
                    "\u2019": "'",
                    "\u201A": "'",
                    "\u201B": "'",
                    "\u201C": '"',
                    "\u201D": '"',
                    "\u201E": '"',
                    "\u201F": '"',
                    "\u00BC": "1/4",
                    "\u00BD": "1/2",
                    "\u00BE": "3/4"
                };
                const DIACRITICS_EXCEPTION = new Set([0x3099, 0x309a, 0x094d, 0x09cd, 0x0a4d, 0x0acd, 0x0b4d, 0x0bcd, 0x0c4d, 0x0ccd, 0x0d3b, 0x0d3c, 0x0d4d, 0x0dca, 0x0e3a, 0x0eba, 0x0f84, 0x1039, 0x103a, 0x1714, 0x1734, 0x17d2, 0x1a60, 0x1b44, 0x1baa, 0x1bab, 0x1bf2, 0x1bf3, 0x2d7f, 0xa806, 0xa82c, 0xa8c4, 0xa953, 0xa9c0, 0xaaf6, 0xabed, 0x0c56, 0x0f71, 0x0f72, 0x0f7a, 0x0f7b, 0x0f7c, 0x0f7d, 0x0f80, 0x0f74]);
                let DIACRITICS_EXCEPTION_STR;
                const DIACRITICS_REG_EXP = /\p{M}+/gu;
                const SPECIAL_CHARS_REG_EXP = /([.*+?^${}()|[\]\\])|(\p{P})|(\s+)|(\p{M})|(\p{L})/gu;
                const NOT_DIACRITIC_FROM_END_REG_EXP = /([^\p{M}])\p{M}*$/u;
                const NOT_DIACRITIC_FROM_START_REG_EXP = /^\p{M}*([^\p{M}])/u;
                const SYLLABLES_REG_EXP = /[\uAC00-\uD7AF\uFA6C\uFACF-\uFAD1\uFAD5-\uFAD7]+/g;
                const SYLLABLES_LENGTHS = new Map();
                const FIRST_CHAR_SYLLABLES_REG_EXP = "[\\u1100-\\u1112\\ud7a4-\\ud7af\\ud84a\\ud84c\\ud850\\ud854\\ud857\\ud85f]";
                const NFKC_CHARS_TO_NORMALIZE = new Map();
                let noSyllablesRegExp = null;
                let withSyllablesRegExp = null;

                function normalize(text) {
                    const syllablePositions = [];
                    let m;
                    while ((m = SYLLABLES_REG_EXP.exec(text)) !== null) {
                        let {
                            index
                        } = m;
                        for (const char of m[0]) {
                            let len = SYLLABLES_LENGTHS.get(char);
                            if (!len) {
                                len = char.normalize("NFD").length;
                                SYLLABLES_LENGTHS.set(char, len);
                            }
                            syllablePositions.push([len, index++]);
                        }
                    }
                    let normalizationRegex;
                    if (syllablePositions.length === 0 && noSyllablesRegExp) {
                        normalizationRegex = noSyllablesRegExp;
                    } else if (syllablePositions.length > 0 && withSyllablesRegExp) {
                        normalizationRegex = withSyllablesRegExp;
                    } else {
                        const replace = Object.keys(CHARACTERS_TO_NORMALIZE).join("");
                        const toNormalizeWithNFKC = (0, _pdf_find_utils.getNormalizeWithNFKC)();
                        const CJK = "(?:\\p{Ideographic}|[\u3040-\u30FF])";
                        const HKDiacritics = "(?:\u3099|\u309A)";
                        const regexp = `([${replace}])|([${toNormalizeWithNFKC}])|(${HKDiacritics}\\n)|(\\p{M}+(?:-\\n)?)|(\\S-\\n)|(${CJK}\\n)|(\\n)`;
                        if (syllablePositions.length === 0) {
                            normalizationRegex = noSyllablesRegExp = new RegExp(regexp + "|(\\u0000)", "gum");
                        } else {
                            normalizationRegex = withSyllablesRegExp = new RegExp(regexp + `|(${FIRST_CHAR_SYLLABLES_REG_EXP})`, "gum");
                        }
                    }
                    const rawDiacriticsPositions = [];
                    while ((m = DIACRITICS_REG_EXP.exec(text)) !== null) {
                        rawDiacriticsPositions.push([m[0].length, m.index]);
                    }
                    let normalized = text.normalize("NFD");
                    const positions = [[0, 0]];
                    let rawDiacriticsIndex = 0;
                    let syllableIndex = 0;
                    let shift = 0;
                    let shiftOrigin = 0;
                    let eol = 0;
                    let hasDiacritics = false;
                    normalized = normalized.replace(normalizationRegex, (match, p1, p2, p3, p4, p5, p6, p7, p8, i) => {
                        i -= shiftOrigin;
                        if (p1) {
                            const replacement = CHARACTERS_TO_NORMALIZE[p1];
                            const jj = replacement.length;
                            for (let j = 1; j < jj; j++) {
                                positions.push([i - shift + j, shift - j]);
                            }
                            shift -= jj - 1;
                            return replacement;
                        }
                        if (p2) {
                            let replacement = NFKC_CHARS_TO_NORMALIZE.get(p2);
                            if (!replacement) {
                                replacement = p2.normalize("NFKC");
                                NFKC_CHARS_TO_NORMALIZE.set(p2, replacement);
                            }
                            const jj = replacement.length;
                            for (let j = 1; j < jj; j++) {
                                positions.push([i - shift + j, shift - j]);
                            }
                            shift -= jj - 1;
                            return replacement;
                        }
                        if (p3) {
                            hasDiacritics = true;
                            if (i + eol === rawDiacriticsPositions[rawDiacriticsIndex]?.[1]) {
                                ++rawDiacriticsIndex;
                            } else {
                                positions.push([i - 1 - shift + 1, shift - 1]);
                                shift -= 1;
                                shiftOrigin += 1;
                            }
                            positions.push([i - shift + 1, shift]);
                            shiftOrigin += 1;
                            eol += 1;
                            return p3.charAt(0);
                        }
                        if (p4) {
                            const hasTrailingDashEOL = p4.endsWith("\n");
                            const len = hasTrailingDashEOL ? p4.length - 2 : p4.length;
                            hasDiacritics = true;
                            let jj = len;
                            if (i + eol === rawDiacriticsPositions[rawDiacriticsIndex]?.[1]) {
                                jj -= rawDiacriticsPositions[rawDiacriticsIndex][0];
                                ++rawDiacriticsIndex;
                            }
                            for (let j = 1; j <= jj; j++) {
                                positions.push([i - 1 - shift + j, shift - j]);
                            }
                            shift -= jj;
                            shiftOrigin += jj;
                            if (hasTrailingDashEOL) {
                                i += len - 1;
                                positions.push([i - shift + 1, 1 + shift]);
                                shift += 1;
                                shiftOrigin += 1;
                                eol += 1;
                                return p4.slice(0, len);
                            }
                            return p4;
                        }
                        if (p5) {
                            const len = p5.length - 2;
                            positions.push([i - shift + len, 1 + shift]);
                            shift += 1;
                            shiftOrigin += 1;
                            eol += 1;
                            return p5.slice(0, -2);
                        }
                        if (p6) {
                            const len = p6.length - 1;
                            positions.push([i - shift + len, shift]);
                            shiftOrigin += 1;
                            eol += 1;
                            return p6.slice(0, -1);
                        }
                        if (p7) {
                            positions.push([i - shift + 1, shift - 1]);
                            shift -= 1;
                            shiftOrigin += 1;
                            eol += 1;
                            return " ";
                        }
                        if (i + eol === syllablePositions[syllableIndex]?.[1]) {
                            const newCharLen = syllablePositions[syllableIndex][0] - 1;
                            ++syllableIndex;
                            for (let j = 1; j <= newCharLen; j++) {
                                positions.push([i - (shift - j), shift - j]);
                            }
                            shift -= newCharLen;
                            shiftOrigin += newCharLen;
                        }
                        return p8;
                    });
                    positions.push([normalized.length, shift]);
                    return [normalized, positions, hasDiacritics];
                }

                function getOriginalIndex(diffs, pos, len) {
                    if (!diffs) {
                        return [pos, len];
                    }
                    const start = pos;
                    const end = pos + len - 1;
                    let i = (0, _ui_utils.binarySearchFirstItem)(diffs, x => x[0] >= start);
                    if (diffs[i][0] > start) {
                        --i;
                    }
                    let j = (0, _ui_utils.binarySearchFirstItem)(diffs, x => x[0] >= end, i);
                    if (diffs[j][0] > end) {
                        --j;
                    }
                    const oldStart = start + diffs[i][1];
                    const oldEnd = end + diffs[j][1];
                    const oldLen = oldEnd + 1 - oldStart;
                    return [oldStart, oldLen];
                }

                class PDFFindController {
                    #state = null;
                    #updateMatchesCountOnProgress = true;
                    #visitedPagesCount = 0;

                    constructor({
                                    linkService,
                                    eventBus,
                                    updateMatchesCountOnProgress = true
                                }) {
                        this._linkService = linkService;
                        this._eventBus = eventBus;
                        this.#updateMatchesCountOnProgress = updateMatchesCountOnProgress;
                        this.onIsPageVisible = null;
                        this.#reset();
                        eventBus._on("find", this.#onFind.bind(this));
                        eventBus._on("findbarclose", this.#onFindBarClose.bind(this));
                    }

                    get highlightMatches() {
                        return this._highlightMatches;
                    }

                    get pageMatches() {
                        return this._pageMatches;
                    }

                    get pageMatchesLength() {
                        return this._pageMatchesLength;
                    }

                    get selected() {
                        return this._selected;
                    }

                    get state() {
                        return this.#state;
                    }

                    setDocument(pdfDocument) {
                        if (this._pdfDocument) {
                            this.#reset();
                        }
                        if (!pdfDocument) {
                            return;
                        }
                        this._pdfDocument = pdfDocument;
                        this._firstPageCapability.resolve();
                    }

                    #onFind(state) {
                        if (!state) {
                            return;
                        }
                        if (state.phraseSearch === false) {
                            console.error("The `phraseSearch`-parameter was removed, please provide " + "an Array of strings in the `query`-parameter instead.");
                            if (typeof state.query === "string") {
                                state.query = state.query.match(/\S+/g);
                            }
                        }
                        const pdfDocument = this._pdfDocument;
                        const {
                            type
                        } = state;
                        if (this.#state === null || this.#shouldDirtyMatch(state)) {
                            this._dirtyMatch = true;
                        }
                        this.#state = state;
                        if (type !== "highlightallchange") {
                            this.#updateUIState(FindState.PENDING);
                        }
                        this._firstPageCapability.promise.then(() => {
                            if (!this._pdfDocument || pdfDocument && this._pdfDocument !== pdfDocument) {
                                return;
                            }
                            this.#extractText();
                            const findbarClosed = !this._highlightMatches;
                            const pendingTimeout = !!this._findTimeout;
                            if (this._findTimeout) {
                                clearTimeout(this._findTimeout);
                                this._findTimeout = null;
                            }
                            if (!type) {
                                this._findTimeout = setTimeout(() => {
                                    this.#nextMatch();
                                    this._findTimeout = null;
                                }, FIND_TIMEOUT);
                            } else if (this._dirtyMatch) {
                                this.#nextMatch();
                            } else if (type === "again") {
                                this.#nextMatch();
                                if (findbarClosed && this.#state.highlightAll) {
                                    this.#updateAllPages();
                                }
                            } else if (type === "highlightallchange") {
                                if (pendingTimeout) {
                                    this.#nextMatch();
                                } else {
                                    this._highlightMatches = true;
                                }
                                this.#updateAllPages();
                            } else {
                                this.#nextMatch();
                            }
                        });
                    }

                    scrollMatchIntoView({
                                            element = null,
                                            selectedLeft = 0,
                                            pageIndex = -1,
                                            matchIndex = -1
                                        }) {
                        if (!this._scrollMatches || !element) {
                            return;
                        } else if (matchIndex === -1 || matchIndex !== this._selected.matchIdx) {
                            return;
                        } else if (pageIndex === -1 || pageIndex !== this._selected.pageIdx) {
                            return;
                        }
                        this._scrollMatches = false;
                        const spot = {
                            top: MATCH_SCROLL_OFFSET_TOP,
                            left: selectedLeft + MATCH_SCROLL_OFFSET_LEFT
                        };
                        (0, _ui_utils.scrollIntoView)(element, spot, true);
                    }

                    #reset() {
                        this._highlightMatches = false;
                        this._scrollMatches = false;
                        this._pdfDocument = null;
                        this._pageMatches = [];
                        this._pageMatchesLength = [];
                        this.#visitedPagesCount = 0;
                        this.#state = null;
                        this._selected = {
                            pageIdx: -1,
                            matchIdx: -1
                        };
                        this._offset = {
                            pageIdx: null,
                            matchIdx: null,
                            wrapped: false
                        };
                        this._extractTextPromises = [];
                        this._pageContents = [];
                        this._pageDiffs = [];
                        this._hasDiacritics = [];
                        this._matchesCountTotal = 0;
                        this._pagesToSearch = null;
                        this._pendingFindMatches = new Set();
                        this._resumePageIdx = null;
                        this._dirtyMatch = false;
                        clearTimeout(this._findTimeout);
                        this._findTimeout = null;
                        this._firstPageCapability = new _pdfjsLib.PromiseCapability();
                    }

                    get #query() {
                        const {
                            query
                        } = this.#state;
                        if (typeof query === "string") {
                            if (query !== this._rawQuery) {
                                this._rawQuery = query;
                                [this._normalizedQuery] = normalize(query);
                            }
                            return this._normalizedQuery;
                        }
                        return (query || []).filter(q => !!q).map(q => normalize(q)[0]);
                    }

                    #shouldDirtyMatch(state) {
                        const newQuery = state.query,
                            prevQuery = this.#state.query;
                        const newType = typeof newQuery,
                            prevType = typeof prevQuery;
                        if (newType !== prevType) {
                            return true;
                        }
                        if (newType === "string") {
                            if (newQuery !== prevQuery) {
                                return true;
                            }
                        } else if (JSON.stringify(newQuery) !== JSON.stringify(prevQuery)) {
                            return true;
                        }
                        switch (state.type) {
                            case "again":
                                const pageNumber = this._selected.pageIdx + 1;
                                const linkService = this._linkService;
                                return pageNumber >= 1 && pageNumber <= linkService.pagesCount && pageNumber !== linkService.page && !(this.onIsPageVisible?.(pageNumber) ?? true);
                            case "highlightallchange":
                                return false;
                        }
                        return true;
                    }

                    #isEntireWord(content, startIdx, length) {
                        let match = content.slice(0, startIdx).match(NOT_DIACRITIC_FROM_END_REG_EXP);
                        if (match) {
                            const first = content.charCodeAt(startIdx);
                            const limit = match[1].charCodeAt(0);
                            if ((0, _pdf_find_utils.getCharacterType)(first) === (0, _pdf_find_utils.getCharacterType)(limit)) {
                                return false;
                            }
                        }
                        match = content.slice(startIdx + length).match(NOT_DIACRITIC_FROM_START_REG_EXP);
                        if (match) {
                            const last = content.charCodeAt(startIdx + length - 1);
                            const limit = match[1].charCodeAt(0);
                            if ((0, _pdf_find_utils.getCharacterType)(last) === (0, _pdf_find_utils.getCharacterType)(limit)) {
                                return false;
                            }
                        }
                        return true;
                    }

                    #calculateRegExpMatch(query, entireWord, pageIndex, pageContent) {
                        const matches = this._pageMatches[pageIndex] = [];
                        const matchesLength = this._pageMatchesLength[pageIndex] = [];
                        if (!query) {
                            return;
                        }
                        const diffs = this._pageDiffs[pageIndex];
                        let match;
                        while ((match = query.exec(pageContent)) !== null) {
                            if (entireWord && !this.#isEntireWord(pageContent, match.index, match[0].length)) {
                                continue;
                            }
                            const [matchPos, matchLen] = getOriginalIndex(diffs, match.index, match[0].length);
                            if (matchLen) {
                                matches.push(matchPos);
                                matchesLength.push(matchLen);
                            }
                        }
                    }

                    #convertToRegExpString(query, hasDiacritics) {
                        const {
                            matchDiacritics
                        } = this.#state;
                        let isUnicode = false;
                        query = query.replaceAll(SPECIAL_CHARS_REG_EXP, (match, p1, p2, p3, p4, p5) => {
                            if (p1) {
                                return `[ ]*\\${p1}[ ]*`;
                            }
                            if (p2) {
                                return `[ ]*${p2}[ ]*`;
                            }
                            if (p3) {
                                return "[ ]+";
                            }
                            if (matchDiacritics) {
                                return p4 || p5;
                            }
                            if (p4) {
                                return DIACRITICS_EXCEPTION.has(p4.charCodeAt(0)) ? p4 : "";
                            }
                            if (hasDiacritics) {
                                isUnicode = true;
                                return `${p5}\\p{M}*`;
                            }
                            return p5;
                        });
                        const trailingSpaces = "[ ]*";
                        if (query.endsWith(trailingSpaces)) {
                            query = query.slice(0, query.length - trailingSpaces.length);
                        }
                        if (matchDiacritics) {
                            if (hasDiacritics) {
                                DIACRITICS_EXCEPTION_STR ||= String.fromCharCode(...DIACRITICS_EXCEPTION);
                                isUnicode = true;
                                query = `${query}(?=[${DIACRITICS_EXCEPTION_STR}]|[^\\p{M}]|$)`;
                            }
                        }
                        return [isUnicode, query];
                    }

                    #calculateMatch(pageIndex) {
                        let query = this.#query;
                        if (query.length === 0) {
                            return;
                        }
                        const {
                            caseSensitive,
                            entireWord
                        } = this.#state;
                        const pageContent = this._pageContents[pageIndex];
                        const hasDiacritics = this._hasDiacritics[pageIndex];
                        let isUnicode = false;
                        if (typeof query === "string") {
                            [isUnicode, query] = this.#convertToRegExpString(query, hasDiacritics);
                        } else {
                            query = query.sort().reverse().map(q => {
                                const [isUnicodePart, queryPart] = this.#convertToRegExpString(q, hasDiacritics);
                                isUnicode ||= isUnicodePart;
                                return `(${queryPart})`;
                            }).join("|");
                        }
                        const flags = `g${isUnicode ? "u" : ""}${caseSensitive ? "" : "i"}`;
                        query = query ? new RegExp(query, flags) : null;
                        this.#calculateRegExpMatch(query, entireWord, pageIndex, pageContent);
                        if (this.#state.highlightAll) {
                            this.#updatePage(pageIndex);
                        }
                        if (this._resumePageIdx === pageIndex) {
                            this._resumePageIdx = null;
                            this.#nextPageMatch();
                        }
                        const pageMatchesCount = this._pageMatches[pageIndex].length;
                        this._matchesCountTotal += pageMatchesCount;
                        if (this.#updateMatchesCountOnProgress) {
                            if (pageMatchesCount > 0) {
                                this.#updateUIResultsCount();
                            }
                        } else if (++this.#visitedPagesCount === this._linkService.pagesCount) {
                            this.#updateUIResultsCount();
                        }
                    }

                    #extractText() {
                        if (this._extractTextPromises.length > 0) {
                            return;
                        }
                        let promise = Promise.resolve();
                        const textOptions = {
                            disableNormalization: true
                        };
                        for (let i = 0, ii = this._linkService.pagesCount; i < ii; i++) {
                            const extractTextCapability = new _pdfjsLib.PromiseCapability();
                            this._extractTextPromises[i] = extractTextCapability.promise;
                            promise = promise.then(() => {
                                return this._pdfDocument.getPage(i + 1).then(pdfPage => {
                                    return pdfPage.getTextContent(textOptions);
                                }).then(textContent => {
                                    const strBuf = [];
                                    for (const textItem of textContent.items) {
                                        strBuf.push(textItem.str);
                                        if (textItem.hasEOL) {
                                            strBuf.push("\n");
                                        }
                                    }
                                    [this._pageContents[i], this._pageDiffs[i], this._hasDiacritics[i]] = normalize(strBuf.join(""));
                                    extractTextCapability.resolve();
                                }, reason => {
                                    console.error(`Unable to get text content for page ${i + 1}`, reason);
                                    this._pageContents[i] = "";
                                    this._pageDiffs[i] = null;
                                    this._hasDiacritics[i] = false;
                                    extractTextCapability.resolve();
                                });
                            });
                        }
                    }

                    #updatePage(index) {
                        if (this._scrollMatches && this._selected.pageIdx === index) {
                            this._linkService.page = index + 1;
                        }
                        this._eventBus.dispatch("updatetextlayermatches", {
                            source: this,
                            pageIndex: index
                        });
                    }

                    #updateAllPages() {
                        this._eventBus.dispatch("updatetextlayermatches", {
                            source: this,
                            pageIndex: -1
                        });
                    }

                    #nextMatch() {
                        const previous = this.#state.findPrevious;
                        const currentPageIndex = this._linkService.page - 1;
                        const numPages = this._linkService.pagesCount;
                        this._highlightMatches = true;
                        if (this._dirtyMatch) {
                            this._dirtyMatch = false;
                            this._selected.pageIdx = this._selected.matchIdx = -1;
                            this._offset.pageIdx = currentPageIndex;
                            this._offset.matchIdx = null;
                            this._offset.wrapped = false;
                            this._resumePageIdx = null;
                            this._pageMatches.length = 0;
                            this._pageMatchesLength.length = 0;
                            this.#visitedPagesCount = 0;
                            this._matchesCountTotal = 0;
                            this.#updateAllPages();
                            for (let i = 0; i < numPages; i++) {
                                if (this._pendingFindMatches.has(i)) {
                                    continue;
                                }
                                this._pendingFindMatches.add(i);
                                this._extractTextPromises[i].then(() => {
                                    this._pendingFindMatches.delete(i);
                                    this.#calculateMatch(i);
                                });
                            }
                        }
                        const query = this.#query;
                        if (query.length === 0) {
                            this.#updateUIState(FindState.FOUND);
                            return;
                        }
                        if (this._resumePageIdx) {
                            return;
                        }
                        const offset = this._offset;
                        this._pagesToSearch = numPages;
                        if (offset.matchIdx !== null) {
                            const numPageMatches = this._pageMatches[offset.pageIdx].length;
                            if (!previous && offset.matchIdx + 1 < numPageMatches || previous && offset.matchIdx > 0) {
                                offset.matchIdx = previous ? offset.matchIdx - 1 : offset.matchIdx + 1;
                                this.#updateMatch(true);
                                return;
                            }
                            this.#advanceOffsetPage(previous);
                        }
                        this.#nextPageMatch();
                    }

                    #matchesReady(matches) {
                        const offset = this._offset;
                        const numMatches = matches.length;
                        const previous = this.#state.findPrevious;
                        if (numMatches) {
                            offset.matchIdx = previous ? numMatches - 1 : 0;
                            this.#updateMatch(true);
                            return true;
                        }
                        this.#advanceOffsetPage(previous);
                        if (offset.wrapped) {
                            offset.matchIdx = null;
                            if (this._pagesToSearch < 0) {
                                this.#updateMatch(false);
                                return true;
                            }
                        }
                        return false;
                    }

                    #nextPageMatch() {
                        if (this._resumePageIdx !== null) {
                            console.error("There can only be one pending page.");
                        }
                        let matches = null;
                        do {
                            const pageIdx = this._offset.pageIdx;
                            matches = this._pageMatches[pageIdx];
                            if (!matches) {
                                this._resumePageIdx = pageIdx;
                                break;
                            }
                        } while (!this.#matchesReady(matches));
                    }

                    #advanceOffsetPage(previous) {
                        const offset = this._offset;
                        const numPages = this._linkService.pagesCount;
                        offset.pageIdx = previous ? offset.pageIdx - 1 : offset.pageIdx + 1;
                        offset.matchIdx = null;
                        this._pagesToSearch--;
                        if (offset.pageIdx >= numPages || offset.pageIdx < 0) {
                            offset.pageIdx = previous ? numPages - 1 : 0;
                            offset.wrapped = true;
                        }
                    }

                    #updateMatch(found = false) {
                        let state = FindState.NOT_FOUND;
                        const wrapped = this._offset.wrapped;
                        this._offset.wrapped = false;
                        if (found) {
                            const previousPage = this._selected.pageIdx;
                            this._selected.pageIdx = this._offset.pageIdx;
                            this._selected.matchIdx = this._offset.matchIdx;
                            state = wrapped ? FindState.WRAPPED : FindState.FOUND;
                            if (previousPage !== -1 && previousPage !== this._selected.pageIdx) {
                                this.#updatePage(previousPage);
                            }
                        }
                        this.#updateUIState(state, this.#state.findPrevious);
                        if (this._selected.pageIdx !== -1) {
                            this._scrollMatches = true;
                            this.#updatePage(this._selected.pageIdx);
                        }
                    }

                    #onFindBarClose(evt) {
                        const pdfDocument = this._pdfDocument;
                        this._firstPageCapability.promise.then(() => {
                            if (!this._pdfDocument || pdfDocument && this._pdfDocument !== pdfDocument) {
                                return;
                            }
                            if (this._findTimeout) {
                                clearTimeout(this._findTimeout);
                                this._findTimeout = null;
                            }
                            if (this._resumePageIdx) {
                                this._resumePageIdx = null;
                                this._dirtyMatch = true;
                            }
                            this.#updateUIState(FindState.FOUND);
                            this._highlightMatches = false;
                            this.#updateAllPages();
                        });
                    }

                    #requestMatchesCount() {
                        const {
                            pageIdx,
                            matchIdx
                        } = this._selected;
                        let current = 0,
                            total = this._matchesCountTotal;
                        if (matchIdx !== -1) {
                            for (let i = 0; i < pageIdx; i++) {
                                current += this._pageMatches[i]?.length || 0;
                            }
                            current += matchIdx + 1;
                        }
                        if (current < 1 || current > total) {
                            current = total = 0;
                        }
                        return {
                            current,
                            total
                        };
                    }

                    #updateUIResultsCount() {
                        this._eventBus.dispatch("updatefindmatchescount", {
                            source: this,
                            matchesCount: this.#requestMatchesCount()
                        });
                    }

                    #updateUIState(state, previous = false) {
                        if (!this.#updateMatchesCountOnProgress && (this.#visitedPagesCount !== this._linkService.pagesCount || state === FindState.PENDING)) {
                            return;
                        }
                        this._eventBus.dispatch("updatefindcontrolstate", {
                            source: this,
                            state,
                            previous,
                            matchesCount: this.#requestMatchesCount(),
                            rawQuery: this.#state?.query ?? null
                        });
                    }
                }

                exports.PDFFindController = PDFFindController;

                /***/
            }),
            /* 2 */
            /***/ ((__unused_webpack_module, exports) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.animationStarted = exports.VERTICAL_PADDING = exports.UNKNOWN_SCALE = exports.TextLayerMode = exports.SpreadMode = exports.SidebarView = exports.ScrollMode = exports.SCROLLBAR_PADDING = exports.RenderingStates = exports.ProgressBar = exports.PresentationModeState = exports.OutputScale = exports.MIN_SCALE = exports.MAX_SCALE = exports.MAX_AUTO_SCALE = exports.DEFAULT_SCALE_VALUE = exports.DEFAULT_SCALE_DELTA = exports.DEFAULT_SCALE = exports.CursorTool = exports.AutoPrintRegExp = void 0;
                exports.apiPageLayoutToViewerModes = apiPageLayoutToViewerModes;
                exports.apiPageModeToSidebarView = apiPageModeToSidebarView;
                exports.approximateFraction = approximateFraction;
                exports.backtrackBeforeAllVisibleElements = backtrackBeforeAllVisibleElements;
                exports.binarySearchFirstItem = binarySearchFirstItem;
                exports.docStyle = void 0;
                exports.getActiveOrFocusedElement = getActiveOrFocusedElement;
                exports.getPageSizeInches = getPageSizeInches;
                exports.getVisibleElements = getVisibleElements;
                exports.isPortraitOrientation = isPortraitOrientation;
                exports.isValidRotation = isValidRotation;
                exports.isValidScrollMode = isValidScrollMode;
                exports.isValidSpreadMode = isValidSpreadMode;
                exports.normalizeWheelEventDelta = normalizeWheelEventDelta;
                exports.normalizeWheelEventDirection = normalizeWheelEventDirection;
                exports.parseQueryString = parseQueryString;
                exports.removeNullCharacters = removeNullCharacters;
                exports.roundToDivide = roundToDivide;
                exports.scrollIntoView = scrollIntoView;
                exports.toggleCheckedBtn = toggleCheckedBtn;
                exports.toggleExpandedBtn = toggleExpandedBtn;
                exports.watchScroll = watchScroll;
                const DEFAULT_SCALE_VALUE = "auto";
                exports.DEFAULT_SCALE_VALUE = DEFAULT_SCALE_VALUE;
                const DEFAULT_SCALE = 1.0;
                exports.DEFAULT_SCALE = DEFAULT_SCALE;
                const DEFAULT_SCALE_DELTA = 1.1;
                exports.DEFAULT_SCALE_DELTA = DEFAULT_SCALE_DELTA;
                const MIN_SCALE = 0.1;
                exports.MIN_SCALE = MIN_SCALE;
                const MAX_SCALE = 10.0;
                exports.MAX_SCALE = MAX_SCALE;
                const UNKNOWN_SCALE = 0;
                exports.UNKNOWN_SCALE = UNKNOWN_SCALE;
                const MAX_AUTO_SCALE = 1.25;
                exports.MAX_AUTO_SCALE = MAX_AUTO_SCALE;
                const SCROLLBAR_PADDING = 40;
                exports.SCROLLBAR_PADDING = SCROLLBAR_PADDING;
                const VERTICAL_PADDING = 5;
                exports.VERTICAL_PADDING = VERTICAL_PADDING;
                const RenderingStates = {
                    INITIAL: 0,
                    RUNNING: 1,
                    PAUSED: 2,
                    FINISHED: 3
                };
                exports.RenderingStates = RenderingStates;
                const PresentationModeState = {
                    UNKNOWN: 0,
                    NORMAL: 1,
                    CHANGING: 2,
                    FULLSCREEN: 3
                };
                exports.PresentationModeState = PresentationModeState;
                const SidebarView = {
                    UNKNOWN: -1,
                    NONE: 0,
                    THUMBS: 1,
                    OUTLINE: 2,
                    ATTACHMENTS: 3,
                    LAYERS: 4
                };
                exports.SidebarView = SidebarView;
                const TextLayerMode = {
                    DISABLE: 0,
                    ENABLE: 1,
                    ENABLE_PERMISSIONS: 2
                };
                exports.TextLayerMode = TextLayerMode;
                const ScrollMode = {
                    UNKNOWN: -1,
                    VERTICAL: 0,
                    HORIZONTAL: 1,
                    WRAPPED: 2,
                    PAGE: 3
                };
                exports.ScrollMode = ScrollMode;
                const SpreadMode = {
                    UNKNOWN: -1,
                    NONE: 0,
                    ODD: 1,
                    EVEN: 2
                };
                exports.SpreadMode = SpreadMode;
                const CursorTool = {
                    SELECT: 0,
                    HAND: 1,
                    ZOOM: 2
                };
                exports.CursorTool = CursorTool;
                const AutoPrintRegExp = /\bprint\s*\(/;
                exports.AutoPrintRegExp = AutoPrintRegExp;

                class OutputScale {
                    constructor() {
                        const pixelRatio = window.devicePixelRatio || 1;
                        this.sx = pixelRatio;
                        this.sy = pixelRatio;
                    }

                    get scaled() {
                        return this.sx !== 1 || this.sy !== 1;
                    }
                }

                exports.OutputScale = OutputScale;

                function scrollIntoView(element, spot, scrollMatches = false) {
                    let parent = element.offsetParent;
                    if (!parent) {
                        console.error("offsetParent is not set -- cannot scroll");
                        return;
                    }
                    let offsetY = element.offsetTop + element.clientTop;
                    let offsetX = element.offsetLeft + element.clientLeft;
                    while (parent.clientHeight === parent.scrollHeight && parent.clientWidth === parent.scrollWidth || scrollMatches && (parent.classList.contains("markedContent") || getComputedStyle(parent).overflow === "hidden")) {
                        offsetY += parent.offsetTop;
                        offsetX += parent.offsetLeft;
                        parent = parent.offsetParent;
                        if (!parent) {
                            return;
                        }
                    }
                    if (spot) {
                        if (spot.top !== undefined) {
                            offsetY += spot.top;
                        }
                        if (spot.left !== undefined) {
                            offsetX += spot.left;
                            parent.scrollLeft = offsetX;
                        }
                    }
                    parent.scrollTop = offsetY;
                }

                function watchScroll(viewAreaElement, callback) {
                    const debounceScroll = function (evt) {
                        if (rAF) {
                            return;
                        }
                        rAF = window.requestAnimationFrame(function viewAreaElementScrolled() {
                            rAF = null;
                            const currentX = viewAreaElement.scrollLeft;
                            const lastX = state.lastX;
                            if (currentX !== lastX) {
                                state.right = currentX > lastX;
                            }
                            state.lastX = currentX;
                            const currentY = viewAreaElement.scrollTop;
                            const lastY = state.lastY;
                            if (currentY !== lastY) {
                                state.down = currentY > lastY;
                            }
                            state.lastY = currentY;
                            callback(state);
                        });
                    };
                    const state = {
                        right: true,
                        down: true,
                        lastX: viewAreaElement.scrollLeft,
                        lastY: viewAreaElement.scrollTop,
                        _eventHandler: debounceScroll
                    };
                    let rAF = null;
                    viewAreaElement.addEventListener("scroll", debounceScroll, true);
                    return state;
                }

                function parseQueryString(query) {
                    const params = new Map();
                    for (const [key, value] of new URLSearchParams(query)) {
                        params.set(key.toLowerCase(), value);
                    }
                    return params;
                }

                const InvisibleCharactersRegExp = /[\x01-\x1F]/g;

                function removeNullCharacters(str, replaceInvisible = false) {
                    if (typeof str !== "string") {
                        console.error(`The argument must be a string.`);
                        return str;
                    }
                    if (replaceInvisible) {
                        str = str.replaceAll(InvisibleCharactersRegExp, " ");
                    }
                    return str.replaceAll("\x00", "");
                }

                function binarySearchFirstItem(items, condition, start = 0) {
                    let minIndex = start;
                    let maxIndex = items.length - 1;
                    if (maxIndex < 0 || !condition(items[maxIndex])) {
                        return items.length;
                    }
                    if (condition(items[minIndex])) {
                        return minIndex;
                    }
                    while (minIndex < maxIndex) {
                        const currentIndex = minIndex + maxIndex >> 1;
                        const currentItem = items[currentIndex];
                        if (condition(currentItem)) {
                            maxIndex = currentIndex;
                        } else {
                            minIndex = currentIndex + 1;
                        }
                    }
                    return minIndex;
                }

                function approximateFraction(x) {
                    if (Math.floor(x) === x) {
                        return [x, 1];
                    }
                    const xinv = 1 / x;
                    const limit = 8;
                    if (xinv > limit) {
                        return [1, limit];
                    } else if (Math.floor(xinv) === xinv) {
                        return [1, xinv];
                    }
                    const x_ = x > 1 ? xinv : x;
                    let a = 0,
                        b = 1,
                        c = 1,
                        d = 1;
                    while (true) {
                        const p = a + c,
                            q = b + d;
                        if (q > limit) {
                            break;
                        }
                        if (x_ <= p / q) {
                            c = p;
                            d = q;
                        } else {
                            a = p;
                            b = q;
                        }
                    }
                    let result;
                    if (x_ - a / b < c / d - x_) {
                        result = x_ === x ? [a, b] : [b, a];
                    } else {
                        result = x_ === x ? [c, d] : [d, c];
                    }
                    return result;
                }

                function roundToDivide(x, div) {
                    const r = x % div;
                    return r === 0 ? x : Math.round(x - r + div);
                }

                function getPageSizeInches({
                                               view,
                                               userUnit,
                                               rotate
                                           }) {
                    const [x1, y1, x2, y2] = view;
                    const changeOrientation = rotate % 180 !== 0;
                    const width = (x2 - x1) / 72 * userUnit;
                    const height = (y2 - y1) / 72 * userUnit;
                    return {
                        width: changeOrientation ? height : width,
                        height: changeOrientation ? width : height
                    };
                }

                function backtrackBeforeAllVisibleElements(index, views, top) {
                    if (index < 2) {
                        return index;
                    }
                    let elt = views[index].div;
                    let pageTop = elt.offsetTop + elt.clientTop;
                    if (pageTop >= top) {
                        elt = views[index - 1].div;
                        pageTop = elt.offsetTop + elt.clientTop;
                    }
                    for (let i = index - 2; i >= 0; --i) {
                        elt = views[i].div;
                        if (elt.offsetTop + elt.clientTop + elt.clientHeight <= pageTop) {
                            break;
                        }
                        index = i;
                    }
                    return index;
                }

                function getVisibleElements({
                                                scrollEl,
                                                views,
                                                sortByVisibility = false,
                                                horizontal = false,
                                                rtl = false
                                            }) {
                    const top = scrollEl.scrollTop,
                        bottom = top + scrollEl.clientHeight;
                    const left = scrollEl.scrollLeft,
                        right = left + scrollEl.clientWidth;

                    function isElementBottomAfterViewTop(view) {
                        const element = view.div;
                        const elementBottom = element.offsetTop + element.clientTop + element.clientHeight;
                        return elementBottom > top;
                    }

                    function isElementNextAfterViewHorizontally(view) {
                        const element = view.div;
                        const elementLeft = element.offsetLeft + element.clientLeft;
                        const elementRight = elementLeft + element.clientWidth;
                        return rtl ? elementLeft < right : elementRight > left;
                    }

                    const visible = [],
                        ids = new Set(),
                        numViews = views.length;
                    let firstVisibleElementInd = binarySearchFirstItem(views, horizontal ? isElementNextAfterViewHorizontally : isElementBottomAfterViewTop);
                    if (firstVisibleElementInd > 0 && firstVisibleElementInd < numViews && !horizontal) {
                        firstVisibleElementInd = backtrackBeforeAllVisibleElements(firstVisibleElementInd, views, top);
                    }
                    let lastEdge = horizontal ? right : -1;
                    for (let i = firstVisibleElementInd; i < numViews; i++) {
                        const view = views[i],
                            element = view.div;
                        const currentWidth = element.offsetLeft + element.clientLeft;
                        const currentHeight = element.offsetTop + element.clientTop;
                        const viewWidth = element.clientWidth,
                            viewHeight = element.clientHeight;
                        const viewRight = currentWidth + viewWidth;
                        const viewBottom = currentHeight + viewHeight;
                        if (lastEdge === -1) {
                            if (viewBottom >= bottom) {
                                lastEdge = viewBottom;
                            }
                        } else if ((horizontal ? currentWidth : currentHeight) > lastEdge) {
                            break;
                        }
                        if (viewBottom <= top || currentHeight >= bottom || viewRight <= left || currentWidth >= right) {
                            continue;
                        }
                        const hiddenHeight = Math.max(0, top - currentHeight) + Math.max(0, viewBottom - bottom);
                        const hiddenWidth = Math.max(0, left - currentWidth) + Math.max(0, viewRight - right);
                        const fractionHeight = (viewHeight - hiddenHeight) / viewHeight,
                            fractionWidth = (viewWidth - hiddenWidth) / viewWidth;
                        const percent = fractionHeight * fractionWidth * 100 | 0;
                        visible.push({
                            id: view.id,
                            x: currentWidth,
                            y: currentHeight,
                            view,
                            percent,
                            widthPercent: fractionWidth * 100 | 0
                        });
                        ids.add(view.id);
                    }
                    const first = visible[0],
                        last = visible.at(-1);
                    if (sortByVisibility) {
                        visible.sort(function (a, b) {
                            const pc = a.percent - b.percent;
                            if (Math.abs(pc) > 0.001) {
                                return -pc;
                            }
                            return a.id - b.id;
                        });
                    }
                    return {
                        first,
                        last,
                        views: visible,
                        ids
                    };
                }

                function normalizeWheelEventDirection(evt) {
                    let delta = Math.hypot(evt.deltaX, evt.deltaY);
                    const angle = Math.atan2(evt.deltaY, evt.deltaX);
                    if (-0.25 * Math.PI < angle && angle < 0.75 * Math.PI) {
                        delta = -delta;
                    }
                    return delta;
                }

                function normalizeWheelEventDelta(evt) {
                    const deltaMode = evt.deltaMode;
                    let delta = normalizeWheelEventDirection(evt);
                    const MOUSE_PIXELS_PER_LINE = 30;
                    const MOUSE_LINES_PER_PAGE = 30;
                    if (deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
                        delta /= MOUSE_PIXELS_PER_LINE * MOUSE_LINES_PER_PAGE;
                    } else if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
                        delta /= MOUSE_LINES_PER_PAGE;
                    }
                    return delta;
                }

                function isValidRotation(angle) {
                    return Number.isInteger(angle) && angle % 90 === 0;
                }

                function isValidScrollMode(mode) {
                    return Number.isInteger(mode) && Object.values(ScrollMode).includes(mode) && mode !== ScrollMode.UNKNOWN;
                }

                function isValidSpreadMode(mode) {
                    return Number.isInteger(mode) && Object.values(SpreadMode).includes(mode) && mode !== SpreadMode.UNKNOWN;
                }

                function isPortraitOrientation(size) {
                    return size.width <= size.height;
                }

                const animationStarted = new Promise(function (resolve) {
                    window.requestAnimationFrame(resolve);
                });
                exports.animationStarted = animationStarted;
                const docStyle = document.documentElement.style;
                exports.docStyle = docStyle;

                function clamp(v, min, max) {
                    return Math.min(Math.max(v, min), max);
                }

                class ProgressBar {
                    #classList = null;
                    #disableAutoFetchTimeout = null;
                    #percent = 0;
                    #style = null;
                    #visible = true;

                    constructor(bar) {
                        this.#classList = bar.classList;
                        this.#style = bar.style;
                    }

                    get percent() {
                        return this.#percent;
                    }

                    set percent(val) {
                        this.#percent = clamp(val, 0, 100);
                        if (isNaN(val)) {
                            this.#classList.add("indeterminate");
                            return;
                        }
                        this.#classList.remove("indeterminate");
                        this.#style.setProperty("--progressBar-percent", `${this.#percent}%`);
                    }

                    setWidth(viewer) {
                        if (!viewer) {
                            return;
                        }
                        const container = viewer.parentNode;
                        const scrollbarWidth = container.offsetWidth - viewer.offsetWidth;
                        if (scrollbarWidth > 0) {
                            this.#style.setProperty("--progressBar-end-offset", `${scrollbarWidth}px`);
                        }
                    }

                    setDisableAutoFetch(delay = 5000) {
                        if (isNaN(this.#percent)) {
                            return;
                        }
                        if (this.#disableAutoFetchTimeout) {
                            clearTimeout(this.#disableAutoFetchTimeout);
                        }
                        this.show();
                        this.#disableAutoFetchTimeout = setTimeout(() => {
                            this.#disableAutoFetchTimeout = null;
                            this.hide();
                        }, delay);
                    }

                    hide() {
                        if (!this.#visible) {
                            return;
                        }
                        this.#visible = false;
                        this.#classList.add("hidden");
                    }

                    show() {
                        if (this.#visible) {
                            return;
                        }
                        this.#visible = true;
                        this.#classList.remove("hidden");
                    }
                }

                exports.ProgressBar = ProgressBar;

                function getActiveOrFocusedElement() {
                    let curRoot = document;
                    let curActiveOrFocused = curRoot.activeElement || curRoot.querySelector(":focus");
                    while (curActiveOrFocused?.shadowRoot) {
                        curRoot = curActiveOrFocused.shadowRoot;
                        curActiveOrFocused = curRoot.activeElement || curRoot.querySelector(":focus");
                    }
                    return curActiveOrFocused;
                }

                function apiPageLayoutToViewerModes(layout) {
                    let scrollMode = ScrollMode.VERTICAL,
                        spreadMode = SpreadMode.NONE;
                    switch (layout) {
                        case "SinglePage":
                            scrollMode = ScrollMode.PAGE;
                            break;
                        case "OneColumn":
                            break;
                        case "TwoPageLeft":
                            scrollMode = ScrollMode.PAGE;
                        case "TwoColumnLeft":
                            spreadMode = SpreadMode.ODD;
                            break;
                        case "TwoPageRight":
                            scrollMode = ScrollMode.PAGE;
                        case "TwoColumnRight":
                            spreadMode = SpreadMode.EVEN;
                            break;
                    }
                    return {
                        scrollMode,
                        spreadMode
                    };
                }

                function apiPageModeToSidebarView(mode) {
                    switch (mode) {
                        case "UseNone":
                            return SidebarView.NONE;
                        case "UseThumbs":
                            return SidebarView.THUMBS;
                        case "UseOutlines":
                            return SidebarView.OUTLINE;
                        case "UseAttachments":
                            return SidebarView.ATTACHMENTS;
                        case "UseOC":
                            return SidebarView.LAYERS;
                    }
                    return SidebarView.NONE;
                }

                function toggleCheckedBtn(button, toggle, view = null) {
                    button.classList.toggle("toggled", toggle);
                    button.setAttribute("aria-checked", toggle);
                    view?.classList.toggle("hidden", !toggle);
                }

                function toggleExpandedBtn(button, toggle, view = null) {
                    button.classList.toggle("toggled", toggle);
                    button.setAttribute("aria-expanded", toggle);
                    view?.classList.toggle("hidden", !toggle);
                }

                /***/
            }),
            /* 3 */
            /***/ ((__unused_webpack_module, exports) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.CharacterType = void 0;
                exports.getCharacterType = getCharacterType;
                exports.getNormalizeWithNFKC = getNormalizeWithNFKC;
                const CharacterType = {
                    SPACE: 0,
                    ALPHA_LETTER: 1,
                    PUNCT: 2,
                    HAN_LETTER: 3,
                    KATAKANA_LETTER: 4,
                    HIRAGANA_LETTER: 5,
                    HALFWIDTH_KATAKANA_LETTER: 6,
                    THAI_LETTER: 7
                };
                exports.CharacterType = CharacterType;

                function isAlphabeticalScript(charCode) {
                    return charCode < 0x2e80;
                }

                function isAscii(charCode) {
                    return (charCode & 0xff80) === 0;
                }

                function isAsciiAlpha(charCode) {
                    return charCode >= 0x61 && charCode <= 0x7a || charCode >= 0x41 && charCode <= 0x5a;
                }

                function isAsciiDigit(charCode) {
                    return charCode >= 0x30 && charCode <= 0x39;
                }

                function isAsciiSpace(charCode) {
                    return charCode === 0x20 || charCode === 0x09 || charCode === 0x0d || charCode === 0x0a;
                }

                function isHan(charCode) {
                    return charCode >= 0x3400 && charCode <= 0x9fff || charCode >= 0xf900 && charCode <= 0xfaff;
                }

                function isKatakana(charCode) {
                    return charCode >= 0x30a0 && charCode <= 0x30ff;
                }

                function isHiragana(charCode) {
                    return charCode >= 0x3040 && charCode <= 0x309f;
                }

                function isHalfwidthKatakana(charCode) {
                    return charCode >= 0xff60 && charCode <= 0xff9f;
                }

                function isThai(charCode) {
                    return (charCode & 0xff80) === 0x0e00;
                }

                function getCharacterType(charCode) {
                    if (isAlphabeticalScript(charCode)) {
                        if (isAscii(charCode)) {
                            if (isAsciiSpace(charCode)) {
                                return CharacterType.SPACE;
                            } else if (isAsciiAlpha(charCode) || isAsciiDigit(charCode) || charCode === 0x5f) {
                                return CharacterType.ALPHA_LETTER;
                            }
                            return CharacterType.PUNCT;
                        } else if (isThai(charCode)) {
                            return CharacterType.THAI_LETTER;
                        } else if (charCode === 0xa0) {
                            return CharacterType.SPACE;
                        }
                        return CharacterType.ALPHA_LETTER;
                    }
                    if (isHan(charCode)) {
                        return CharacterType.HAN_LETTER;
                    } else if (isKatakana(charCode)) {
                        return CharacterType.KATAKANA_LETTER;
                    } else if (isHiragana(charCode)) {
                        return CharacterType.HIRAGANA_LETTER;
                    } else if (isHalfwidthKatakana(charCode)) {
                        return CharacterType.HALFWIDTH_KATAKANA_LETTER;
                    }
                    return CharacterType.ALPHA_LETTER;
                }

                let NormalizeWithNFKC;

                function getNormalizeWithNFKC() {
                    NormalizeWithNFKC ||= ` ¨ª¯²-µ¸-º¼-¾Ĳ-ĳĿ-ŀŉſǄ-ǌǱ-ǳʰ-ʸ˘-˝ˠ-ˤʹͺ;΄-΅·ϐ-ϖϰ-ϲϴ-ϵϹևٵ-ٸक़-य़ড়-ঢ়য়ਲ਼ਸ਼ਖ਼-ਜ਼ਫ਼ଡ଼-ଢ଼ำຳໜ-ໝ༌གྷཌྷདྷབྷཛྷཀྵჼᴬ-ᴮᴰ-ᴺᴼ-ᵍᵏ-ᵪᵸᶛ-ᶿẚ-ẛάέήίόύώΆ᾽-῁ΈΉ῍-῏ΐΊ῝-῟ΰΎ῭-`ΌΏ´-῾ - ‑‗․-… ″-‴‶-‷‼‾⁇-⁉⁗ ⁰-ⁱ⁴-₎ₐ-ₜ₨℀-℃℅-ℇ℉-ℓℕ-№ℙ-ℝ℠-™ℤΩℨK-ℭℯ-ℱℳ-ℹ℻-⅀ⅅ-ⅉ⅐-ⅿ↉∬-∭∯-∰〈-〉①-⓪⨌⩴-⩶⫝̸ⱼ-ⱽⵯ⺟⻳⼀-⿕　〶〸-〺゛-゜ゟヿㄱ-ㆎ㆒-㆟㈀-㈞㈠-㉇㉐-㉾㊀-㏿ꚜ-ꚝꝰꟲ-ꟴꟸ-ꟹꭜ-ꭟꭩ豈-嗀塚晴凞-羽蘒諸逸-都飯-舘並-龎ﬀ-ﬆﬓ-ﬗיִײַ-זּטּ-לּמּנּ-סּףּ-פּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-﷼︐-︙︰-﹄﹇-﹒﹔-﹦﹨-﹫ﹰ-ﹲﹴﹶ-ﻼ！-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ￠-￦`;
                    return NormalizeWithNFKC;
                }

                /***/
            }),
            /* 4 */
            /***/ ((module) => {


                module.exports = globalThis.pdfjsLib;

                /***/
            }),
            /* 5 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.SimpleLinkService = exports.PDFLinkService = exports.LinkTarget = void 0;
                var _ui_utils = __w_pdfjs_require__(2);
                const DEFAULT_LINK_REL = "noopener noreferrer nofollow";
                const LinkTarget = {
                    NONE: 0,
                    SELF: 1,
                    BLANK: 2,
                    PARENT: 3,
                    TOP: 4
                };
                exports.LinkTarget = LinkTarget;

                function addLinkAttributes(link, {
                    url,
                    target,
                    rel,
                    enabled = true
                } = {}) {
                    if (!url || typeof url !== "string") {
                        throw new Error('A valid "url" parameter must provided.');
                    }
                    if (enabled) {
                        link.href = link.title = url;
                    } else {
                        link.href = "";
                        link.title = `Disabled: ${url}`;
                        link.onclick = () => {
                            return false;
                        };
                    }
                    let targetStr = "";
                    switch (target) {
                        case LinkTarget.NONE:
                            break;
                        case LinkTarget.SELF:
                            targetStr = "_self";
                            break;
                        case LinkTarget.BLANK:
                            targetStr = "_blank";
                            break;
                        case LinkTarget.PARENT:
                            targetStr = "_parent";
                            break;
                        case LinkTarget.TOP:
                            targetStr = "_top";
                            break;
                    }
                    link.target = targetStr;
                    link.rel = typeof rel === "string" ? rel : DEFAULT_LINK_REL;
                }

                class PDFLinkService {
                    #pagesRefCache = new Map();

                    constructor({
                                    eventBus,
                                    externalLinkTarget = null,
                                    externalLinkRel = null,
                                    ignoreDestinationZoom = false
                                } = {}) {
                        this.eventBus = eventBus;
                        this.externalLinkTarget = externalLinkTarget;
                        this.externalLinkRel = externalLinkRel;
                        this.externalLinkEnabled = true;
                        this._ignoreDestinationZoom = ignoreDestinationZoom;
                        this.baseUrl = null;
                        this.pdfDocument = null;
                        this.pdfViewer = null;
                        this.pdfHistory = null;
                    }

                    setDocument(pdfDocument, baseUrl = null) {
                        this.baseUrl = baseUrl;
                        this.pdfDocument = pdfDocument;
                        this.#pagesRefCache.clear();
                    }

                    setViewer(pdfViewer) {
                        this.pdfViewer = pdfViewer;
                    }

                    setHistory(pdfHistory) {
                        this.pdfHistory = pdfHistory;
                    }

                    get pagesCount() {
                        return this.pdfDocument ? this.pdfDocument.numPages : 0;
                    }

                    get page() {
                        return this.pdfViewer.currentPageNumber;
                    }

                    set page(value) {
                        this.pdfViewer.currentPageNumber = value;
                    }

                    get rotation() {
                        return this.pdfViewer.pagesRotation;
                    }

                    set rotation(value) {
                        this.pdfViewer.pagesRotation = value;
                    }

                    get isInPresentationMode() {
                        return this.pdfViewer.isInPresentationMode;
                    }

                    #goToDestinationHelper(rawDest, namedDest = null, explicitDest) {
                        const destRef = explicitDest[0];
                        let pageNumber;
                        if (typeof destRef === "object" && destRef !== null) {
                            pageNumber = this._cachedPageNumber(destRef);
                            if (!pageNumber) {
                                this.pdfDocument.getPageIndex(destRef).then(pageIndex => {
                                    this.cachePageRef(pageIndex + 1, destRef);
                                    this.#goToDestinationHelper(rawDest, namedDest, explicitDest);
                                }).catch(() => {
                                    console.error(`PDFLinkService.#goToDestinationHelper: "${destRef}" is not ` + `a valid page reference, for dest="${rawDest}".`);
                                });
                                return;
                            }
                        } else if (Number.isInteger(destRef)) {
                            pageNumber = destRef + 1;
                        } else {
                            console.error(`PDFLinkService.#goToDestinationHelper: "${destRef}" is not ` + `a valid destination reference, for dest="${rawDest}".`);
                            return;
                        }
                        if (!pageNumber || pageNumber < 1 || pageNumber > this.pagesCount) {
                            console.error(`PDFLinkService.#goToDestinationHelper: "${pageNumber}" is not ` + `a valid page number, for dest="${rawDest}".`);
                            return;
                        }
                        if (this.pdfHistory) {
                            this.pdfHistory.pushCurrentPosition();
                            this.pdfHistory.push({
                                namedDest,
                                explicitDest,
                                pageNumber
                            });
                        }
                        this.pdfViewer.scrollPageIntoView({
                            pageNumber,
                            destArray: explicitDest,
                            ignoreDestinationZoom: this._ignoreDestinationZoom
                        });
                    }

                    async goToDestination(dest) {
                        if (!this.pdfDocument) {
                            return;
                        }
                        let namedDest, explicitDest;
                        if (typeof dest === "string") {
                            namedDest = dest;
                            explicitDest = await this.pdfDocument.getDestination(dest);
                        } else {
                            namedDest = null;
                            explicitDest = await dest;
                        }
                        if (!Array.isArray(explicitDest)) {
                            console.error(`PDFLinkService.goToDestination: "${explicitDest}" is not ` + `a valid destination array, for dest="${dest}".`);
                            return;
                        }
                        this.#goToDestinationHelper(dest, namedDest, explicitDest);
                    }

                    goToPage(val) {
                        if (!this.pdfDocument) {
                            return;
                        }
                        const pageNumber = typeof val === "string" && this.pdfViewer.pageLabelToPageNumber(val) || val | 0;
                        if (!(Number.isInteger(pageNumber) && pageNumber > 0 && pageNumber <= this.pagesCount)) {
                            console.error(`PDFLinkService.goToPage: "${val}" is not a valid page.`);
                            return;
                        }
                        if (this.pdfHistory) {
                            this.pdfHistory.pushCurrentPosition();
                            this.pdfHistory.pushPage(pageNumber);
                        }
                        this.pdfViewer.scrollPageIntoView({
                            pageNumber
                        });
                    }

                    addLinkAttributes(link, url, newWindow = false) {
                        addLinkAttributes(link, {
                            url,
                            target: newWindow ? LinkTarget.BLANK : this.externalLinkTarget,
                            rel: this.externalLinkRel,
                            enabled: this.externalLinkEnabled
                        });
                    }

                    getDestinationHash(dest) {
                        if (typeof dest === "string") {
                            if (dest.length > 0) {
                                return this.getAnchorUrl("#" + escape(dest));
                            }
                        } else if (Array.isArray(dest)) {
                            const str = JSON.stringify(dest);
                            if (str.length > 0) {
                                return this.getAnchorUrl("#" + escape(str));
                            }
                        }
                        return this.getAnchorUrl("");
                    }

                    getAnchorUrl(anchor) {
                        return this.baseUrl ? this.baseUrl + anchor : anchor;
                    }

                    setHash(hash) {
                        if (!this.pdfDocument) {
                            return;
                        }
                        let pageNumber, dest;
                        if (hash.includes("=")) {
                            const params = (0, _ui_utils.parseQueryString)(hash);
                            if (params.has("search")) {
                                const query = params.get("search").replaceAll('"', ""),
                                    phrase = params.get("phrase") === "true";
                                this.eventBus.dispatch("findfromurlhash", {
                                    source: this,
                                    query: phrase ? query : query.match(/\S+/g)
                                });
                            }
                            if (params.has("page")) {
                                pageNumber = params.get("page") | 0 || 1;
                            }
                            if (params.has("zoom")) {
                                const zoomArgs = params.get("zoom").split(",");
                                const zoomArg = zoomArgs[0];
                                const zoomArgNumber = parseFloat(zoomArg);
                                if (!zoomArg.includes("Fit")) {
                                    dest = [null, {
                                        name: "XYZ"
                                    }, zoomArgs.length > 1 ? zoomArgs[1] | 0 : null, zoomArgs.length > 2 ? zoomArgs[2] | 0 : null, zoomArgNumber ? zoomArgNumber / 100 : zoomArg];
                                } else if (zoomArg === "Fit" || zoomArg === "FitB") {
                                    dest = [null, {
                                        name: zoomArg
                                    }];
                                } else if (zoomArg === "FitH" || zoomArg === "FitBH" || zoomArg === "FitV" || zoomArg === "FitBV") {
                                    dest = [null, {
                                        name: zoomArg
                                    }, zoomArgs.length > 1 ? zoomArgs[1] | 0 : null];
                                } else if (zoomArg === "FitR") {
                                    if (zoomArgs.length !== 5) {
                                        console.error('PDFLinkService.setHash: Not enough parameters for "FitR".');
                                    } else {
                                        dest = [null, {
                                            name: zoomArg
                                        }, zoomArgs[1] | 0, zoomArgs[2] | 0, zoomArgs[3] | 0, zoomArgs[4] | 0];
                                    }
                                } else {
                                    console.error(`PDFLinkService.setHash: "${zoomArg}" is not a valid zoom value.`);
                                }
                            }
                            if (dest) {
                                this.pdfViewer.scrollPageIntoView({
                                    pageNumber: pageNumber || this.page,
                                    destArray: dest,
                                    allowNegativeOffset: true
                                });
                            } else if (pageNumber) {
                                this.page = pageNumber;
                            }
                            if (params.has("pagemode")) {
                                this.eventBus.dispatch("pagemode", {
                                    source: this,
                                    mode: params.get("pagemode")
                                });
                            }
                            if (params.has("nameddest")) {
                                this.goToDestination(params.get("nameddest"));
                            }
                        } else {
                            dest = unescape(hash);
                            try {
                                dest = JSON.parse(dest);
                                if (!Array.isArray(dest)) {
                                    dest = dest.toString();
                                }
                            } catch {
                            }
                            if (typeof dest === "string" || PDFLinkService.#isValidExplicitDestination(dest)) {
                                this.goToDestination(dest);
                                return;
                            }
                            console.error(`PDFLinkService.setHash: "${unescape(hash)}" is not a valid destination.`);
                        }
                    }

                    executeNamedAction(action) {
                        switch (action) {
                            case "GoBack":
                                this.pdfHistory?.back();
                                break;
                            case "GoForward":
                                this.pdfHistory?.forward();
                                break;
                            case "NextPage":
                                this.pdfViewer.nextPage();
                                break;
                            case "PrevPage":
                                this.pdfViewer.previousPage();
                                break;
                            case "LastPage":
                                this.page = this.pagesCount;
                                break;
                            case "FirstPage":
                                this.page = 1;
                                break;
                            default:
                                break;
                        }
                        this.eventBus.dispatch("namedaction", {
                            source: this,
                            action
                        });
                    }

                    async executeSetOCGState(action) {
                        const pdfDocument = this.pdfDocument;
                        const optionalContentConfig = await this.pdfViewer.optionalContentConfigPromise;
                        if (pdfDocument !== this.pdfDocument) {
                            return;
                        }
                        let operator;
                        for (const elem of action.state) {
                            switch (elem) {
                                case "ON":
                                case "OFF":
                                case "Toggle":
                                    operator = elem;
                                    continue;
                            }
                            switch (operator) {
                                case "ON":
                                    optionalContentConfig.setVisibility(elem, true);
                                    break;
                                case "OFF":
                                    optionalContentConfig.setVisibility(elem, false);
                                    break;
                                case "Toggle":
                                    const group = optionalContentConfig.getGroup(elem);
                                    if (group) {
                                        optionalContentConfig.setVisibility(elem, !group.visible);
                                    }
                                    break;
                            }
                        }
                        this.pdfViewer.optionalContentConfigPromise = Promise.resolve(optionalContentConfig);
                    }

                    cachePageRef(pageNum, pageRef) {
                        if (!pageRef) {
                            return;
                        }
                        const refStr = pageRef.gen === 0 ? `${pageRef.num}R` : `${pageRef.num}R${pageRef.gen}`;
                        this.#pagesRefCache.set(refStr, pageNum);
                    }

                    _cachedPageNumber(pageRef) {
                        if (!pageRef) {
                            return null;
                        }
                        const refStr = pageRef.gen === 0 ? `${pageRef.num}R` : `${pageRef.num}R${pageRef.gen}`;
                        return this.#pagesRefCache.get(refStr) || null;
                    }

                    static #isValidExplicitDestination(dest) {
                        if (!Array.isArray(dest)) {
                            return false;
                        }
                        const destLength = dest.length;
                        if (destLength < 2) {
                            return false;
                        }
                        const page = dest[0];
                        if (!(typeof page === "object" && Number.isInteger(page.num) && Number.isInteger(page.gen)) && !(Number.isInteger(page) && page >= 0)) {
                            return false;
                        }
                        const zoom = dest[1];
                        if (!(typeof zoom === "object" && typeof zoom.name === "string")) {
                            return false;
                        }
                        let allowNull = true;
                        switch (zoom.name) {
                            case "XYZ":
                                if (destLength !== 5) {
                                    return false;
                                }
                                break;
                            case "Fit":
                            case "FitB":
                                return destLength === 2;
                            case "FitH":
                            case "FitBH":
                            case "FitV":
                            case "FitBV":
                                if (destLength !== 3) {
                                    return false;
                                }
                                break;
                            case "FitR":
                                if (destLength !== 6) {
                                    return false;
                                }
                                allowNull = false;
                                break;
                            default:
                                return false;
                        }
                        for (let i = 2; i < destLength; i++) {
                            const param = dest[i];
                            if (!(typeof param === "number" || allowNull && param === null)) {
                                return false;
                            }
                        }
                        return true;
                    }
                }

                exports.PDFLinkService = PDFLinkService;

                class SimpleLinkService {
                    constructor() {
                        this.externalLinkEnabled = true;
                    }

                    get pagesCount() {
                        return 0;
                    }

                    get page() {
                        return 0;
                    }

                    set page(value) {
                    }

                    get rotation() {
                        return 0;
                    }

                    set rotation(value) {
                    }

                    get isInPresentationMode() {
                        return false;
                    }

                    async goToDestination(dest) {
                    }

                    goToPage(val) {
                    }

                    addLinkAttributes(link, url, newWindow = false) {
                        addLinkAttributes(link, {
                            url,
                            enabled: this.externalLinkEnabled
                        });
                    }

                    getDestinationHash(dest) {
                        return "#";
                    }

                    getAnchorUrl(hash) {
                        return "#";
                    }

                    setHash(hash) {
                    }

                    executeNamedAction(action) {
                    }

                    executeSetOCGState(action) {
                    }

                    cachePageRef(pageNum, pageRef) {
                    }
                }

                exports.SimpleLinkService = SimpleLinkService;

                /***/
            }),
            /* 6 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.AnnotationLayerBuilder = void 0;
                var _pdfjsLib = __w_pdfjs_require__(4);
                var _l10n_utils = __w_pdfjs_require__(7);
                var _ui_utils = __w_pdfjs_require__(2);

                class AnnotationLayerBuilder {
                    #onPresentationModeChanged = null;

                    constructor({
                                    pageDiv,
                                    pdfPage,
                                    linkService,
                                    downloadManager,
                                    annotationStorage = null,
                                    imageResourcesPath = "",
                                    renderForms = true,
                                    l10n = _l10n_utils.NullL10n,
                                    enableScripting = false,
                                    hasJSActionsPromise = null,
                                    fieldObjectsPromise = null,
                                    annotationCanvasMap = null,
                                    accessibilityManager = null
                                }) {
                        this.pageDiv = pageDiv;
                        this.pdfPage = pdfPage;
                        this.linkService = linkService;
                        this.downloadManager = downloadManager;
                        this.imageResourcesPath = imageResourcesPath;
                        this.renderForms = renderForms;
                        this.l10n = l10n;
                        this.annotationStorage = annotationStorage;
                        this.enableScripting = enableScripting;
                        this._hasJSActionsPromise = hasJSActionsPromise || Promise.resolve(false);
                        this._fieldObjectsPromise = fieldObjectsPromise || Promise.resolve(null);
                        this._annotationCanvasMap = annotationCanvasMap;
                        this._accessibilityManager = accessibilityManager;
                        this.annotationLayer = null;
                        this.div = null;
                        this._cancelled = false;
                        this._eventBus = linkService.eventBus;
                    }

                    async render(viewport, intent = "display") {
                        if (this.div) {
                            if (this._cancelled || !this.annotationLayer) {
                                return;
                            }
                            this.annotationLayer.update({
                                viewport: viewport.clone({
                                    dontFlip: true
                                })
                            });
                            return;
                        }
                        const [annotations, hasJSActions, fieldObjects] = await Promise.all([this.pdfPage.getAnnotations({
                            intent
                        }), this._hasJSActionsPromise, this._fieldObjectsPromise]);
                        if (this._cancelled) {
                            return;
                        }
                        const div = this.div = document.createElement("div");
                        div.className = "annotationLayer";
                        this.pageDiv.append(div);
                        if (annotations.length === 0) {
                            this.hide();
                            return;
                        }
                        this.annotationLayer = new _pdfjsLib.AnnotationLayer({
                            div,
                            accessibilityManager: this._accessibilityManager,
                            annotationCanvasMap: this._annotationCanvasMap,
                            l10n: this.l10n,
                            page: this.pdfPage,
                            viewport: viewport.clone({
                                dontFlip: true
                            })
                        });
                        await this.annotationLayer.render({
                            annotations,
                            imageResourcesPath: this.imageResourcesPath,
                            renderForms: this.renderForms,
                            linkService: this.linkService,
                            downloadManager: this.downloadManager,
                            annotationStorage: this.annotationStorage,
                            enableScripting: this.enableScripting,
                            hasJSActions,
                            fieldObjects
                        });
                        if (this.linkService.isInPresentationMode) {
                            this.#updatePresentationModeState(_ui_utils.PresentationModeState.FULLSCREEN);
                        }
                        if (!this.#onPresentationModeChanged) {
                            this.#onPresentationModeChanged = evt => {
                                this.#updatePresentationModeState(evt.state);
                            };
                            this._eventBus?._on("presentationmodechanged", this.#onPresentationModeChanged);
                        }
                    }

                    cancel() {
                        this._cancelled = true;
                        if (this.#onPresentationModeChanged) {
                            this._eventBus?._off("presentationmodechanged", this.#onPresentationModeChanged);
                            this.#onPresentationModeChanged = null;
                        }
                    }

                    hide() {
                        if (!this.div) {
                            return;
                        }
                        this.div.hidden = true;
                    }

                    #updatePresentationModeState(state) {
                        if (!this.div) {
                            return;
                        }
                        let disableFormElements = false;
                        switch (state) {
                            case _ui_utils.PresentationModeState.FULLSCREEN:
                                disableFormElements = true;
                                break;
                            case _ui_utils.PresentationModeState.NORMAL:
                                break;
                            default:
                                return;
                        }
                        for (const section of this.div.childNodes) {
                            if (section.hasAttribute("data-internal-link")) {
                                continue;
                            }
                            section.inert = disableFormElements;
                        }
                    }
                }

                exports.AnnotationLayerBuilder = AnnotationLayerBuilder;

                /***/
            }),
            /* 7 */
            /***/ ((__unused_webpack_module, exports) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.NullL10n = void 0;
                exports.getL10nFallback = getL10nFallback;
                const DEFAULT_L10N_STRINGS = {
                    of_pages: "of {{pagesCount}}",
                    page_of_pages: "({{pageNumber}} of {{pagesCount}})",
                    document_properties_kb: "{{size_kb}} KB ({{size_b}} bytes)",
                    document_properties_mb: "{{size_mb}} MB ({{size_b}} bytes)",
                    document_properties_date_string: "{{date}}, {{time}}",
                    document_properties_page_size_unit_inches: "in",
                    document_properties_page_size_unit_millimeters: "mm",
                    document_properties_page_size_orientation_portrait: "portrait",
                    document_properties_page_size_orientation_landscape: "landscape",
                    document_properties_page_size_name_a3: "A3",
                    document_properties_page_size_name_a4: "A4",
                    document_properties_page_size_name_letter: "Letter",
                    document_properties_page_size_name_legal: "Legal",
                    document_properties_page_size_dimension_string: "{{width}} × {{height}} {{unit}} ({{orientation}})",
                    document_properties_page_size_dimension_name_string: "{{width}} × {{height}} {{unit}} ({{name}}, {{orientation}})",
                    document_properties_linearized_yes: "Yes",
                    document_properties_linearized_no: "No",
                    additional_layers: "Additional Layers",
                    page_landmark: "Page {{page}}",
                    thumb_page_title: "Page {{page}}",
                    thumb_page_canvas: "Thumbnail of Page {{page}}",
                    find_reached_top: "Reached top of document, continued from bottom",
                    find_reached_bottom: "Reached end of document, continued from top",
                    "find_match_count[one]": "{{current}} of {{total}} match",
                    "find_match_count[other]": "{{current}} of {{total}} matches",
                    "find_match_count_limit[one]": "More than {{limit}} match",
                    "find_match_count_limit[other]": "More than {{limit}} matches",
                    find_not_found: "Phrase not found",
                    page_scale_width: "Page Width",
                    page_scale_fit: "Page Fit",
                    page_scale_auto: "Automatic Zoom",
                    page_scale_actual: "Actual Size",
                    page_scale_percent: "{{scale}}%",
                    loading_error: "An error occurred while loading the PDF.",
                    invalid_file_error: "Invalid or corrupted PDF file.",
                    missing_file_error: "Missing PDF file.",
                    unexpected_response_error: "Unexpected server response.",
                    rendering_error: "An error occurred while rendering the page.",
                    annotation_date_string: "{{date}}, {{time}}",
                    printing_not_supported: "Warning: Printing is not fully supported by this browser.",
                    printing_not_ready: "Warning: The PDF is not fully loaded for printing.",
                    web_fonts_disabled: "Web fonts are disabled: unable to use embedded PDF fonts.",
                    free_text2_default_content: "Start typing…",
                    editor_free_text2_aria_label: "Text Editor",
                    editor_ink2_aria_label: "Draw Editor",
                    editor_ink_canvas_aria_label: "User-created image",
                    editor_alt_text_button_label: "Alt text",
                    editor_alt_text_edit_button_label: "Edit alt text",
                    editor_alt_text_decorative_tooltip: "Marked as decorative"
                };
                {
                    DEFAULT_L10N_STRINGS.print_progress_percent = "{{progress}}%";
                }

                function getL10nFallback(key, args) {
                    switch (key) {
                        case "find_match_count":
                            key = `find_match_count[${args.total === 1 ? "one" : "other"}]`;
                            break;
                        case "find_match_count_limit":
                            key = `find_match_count_limit[${args.limit === 1 ? "one" : "other"}]`;
                            break;
                    }
                    return DEFAULT_L10N_STRINGS[key] || "";
                }

                function formatL10nValue(text, args) {
                    if (!args) {
                        return text;
                    }
                    return text.replaceAll(/\{\{\s*(\w+)\s*\}\}/g, (all, name) => {
                        return name in args ? args[name] : "{{" + name + "}}";
                    });
                }

                const NullL10n = {
                    async getLanguage() {
                        return "en-us";
                    },
                    async getDirection() {
                        return "ltr";
                    },
                    async get(key, args = null, fallback = getL10nFallback(key, args)) {
                        return formatL10nValue(fallback, args);
                    },
                    async translate(element) {
                    }
                };
                exports.NullL10n = NullL10n;

                /***/
            }),
            /* 8 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.DownloadManager = void 0;
                var _pdfjsLib = __w_pdfjs_require__(4);
                ;

                function download(blobUrl, filename) {
                    const a = document.createElement("a");
                    if (!a.click) {
                        throw new Error('DownloadManager: "a.click()" is not supported.');
                    }
                    a.href = blobUrl;
                    a.target = "_parent";
                    if ("download" in a) {
                        a.download = filename;
                    }
                    (document.body || document.documentElement).append(a);
                    a.click();
                    a.remove();
                }

                class DownloadManager {
                    #openBlobUrls = new WeakMap();

                    downloadUrl(url, filename, _options) {
                        if (!(0, _pdfjsLib.createValidAbsoluteUrl)(url, "http://example.com")) {
                            console.error(`downloadUrl - not a valid URL: ${url}`);
                            return;
                        }
                        download(url + "#pdfjs.action=download", filename);
                    }

                    downloadData(data, filename, contentType) {
                        const blobUrl = URL.createObjectURL(new Blob([data], {
                            type: contentType
                        }));
                        download(blobUrl, filename);
                    }

                    openOrDownloadData(element, data, filename) {
                        const isPdfData = (0, _pdfjsLib.isPdfFile)(filename);
                        const contentType = isPdfData ? "application/pdf" : "";
                        this.downloadData(data, filename, contentType);
                        return false;
                    }

                    download(blob, url, filename, _options) {
                        const blobUrl = URL.createObjectURL(blob);
                        download(blobUrl, filename);
                    }
                }

                exports.DownloadManager = DownloadManager;

                /***/
            }),
            /* 9 */
            /***/ ((__unused_webpack_module, exports) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.WaitOnType = exports.EventBus = exports.AutomationEventBus = void 0;
                exports.waitOnEventOrTimeout = waitOnEventOrTimeout;
                const WaitOnType = {
                    EVENT: "event",
                    TIMEOUT: "timeout"
                };
                exports.WaitOnType = WaitOnType;

                function waitOnEventOrTimeout({
                                                  target,
                                                  name,
                                                  delay = 0
                                              }) {
                    return new Promise(function (resolve, reject) {
                        if (typeof target !== "object" || !(name && typeof name === "string") || !(Number.isInteger(delay) && delay >= 0)) {
                            throw new Error("waitOnEventOrTimeout - invalid parameters.");
                        }

                        function handler(type) {
                            if (target instanceof EventBus) {
                                target._off(name, eventHandler);
                            } else {
                                target.removeEventListener(name, eventHandler);
                            }
                            if (timeout) {
                                clearTimeout(timeout);
                            }
                            resolve(type);
                        }

                        const eventHandler = handler.bind(null, WaitOnType.EVENT);
                        if (target instanceof EventBus) {
                            target._on(name, eventHandler);
                        } else {
                            target.addEventListener(name, eventHandler);
                        }
                        const timeoutHandler = handler.bind(null, WaitOnType.TIMEOUT);
                        const timeout = setTimeout(timeoutHandler, delay);
                    });
                }

                class EventBus {
                    #listeners = Object.create(null);

                    on(eventName, listener, options = null) {
                        this._on(eventName, listener, {
                            external: true,
                            once: options?.once
                        });
                    }

                    off(eventName, listener, options = null) {
                        this._off(eventName, listener, {
                            external: true,
                            once: options?.once
                        });
                    }

                    dispatch(eventName, data) {
                        const eventListeners = this.#listeners[eventName];
                        if (!eventListeners || eventListeners.length === 0) {
                            return;
                        }
                        let externalListeners;
                        for (const {
                            listener,
                            external,
                            once
                        } of eventListeners.slice(0)) {
                            if (once) {
                                this._off(eventName, listener);
                            }
                            if (external) {
                                (externalListeners ||= []).push(listener);
                                continue;
                            }
                            listener(data);
                        }
                        if (externalListeners) {
                            for (const listener of externalListeners) {
                                listener(data);
                            }
                            externalListeners = null;
                        }
                    }

                    _on(eventName, listener, options = null) {
                        const eventListeners = this.#listeners[eventName] ||= [];
                        eventListeners.push({
                            listener,
                            external: options?.external === true,
                            once: options?.once === true
                        });
                    }

                    _off(eventName, listener, options = null) {
                        const eventListeners = this.#listeners[eventName];
                        if (!eventListeners) {
                            return;
                        }
                        for (let i = 0, ii = eventListeners.length; i < ii; i++) {
                            if (eventListeners[i].listener === listener) {
                                eventListeners.splice(i, 1);
                                return;
                            }
                        }
                    }
                }

                exports.EventBus = EventBus;

                class AutomationEventBus extends EventBus {
                    dispatch(eventName, data) {
                        throw new Error("Not implemented: AutomationEventBus.dispatch");
                    }
                }

                exports.AutomationEventBus = AutomationEventBus;

                /***/
            }),
            /* 10 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.GenericL10n = void 0;
                __w_pdfjs_require__(11);
                var _l10n_utils = __w_pdfjs_require__(7);
                const PARTIAL_LANG_CODES = {
                    en: "en-US",
                    es: "es-ES",
                    fy: "fy-NL",
                    ga: "ga-IE",
                    gu: "gu-IN",
                    hi: "hi-IN",
                    hy: "hy-AM",
                    nb: "nb-NO",
                    ne: "ne-NP",
                    nn: "nn-NO",
                    pa: "pa-IN",
                    pt: "pt-PT",
                    sv: "sv-SE",
                    zh: "zh-CN"
                };

                function fixupLangCode(langCode) {
                    return PARTIAL_LANG_CODES[langCode?.toLowerCase()] || langCode;
                }

                class GenericL10n {
                    constructor(lang) {
                        const {
                            webL10n
                        } = document;
                        this._lang = lang;
                        this._ready = new Promise((resolve, reject) => {
                            webL10n.setLanguage(fixupLangCode(lang), () => {
                                resolve(webL10n);
                            });
                        });
                    }

                    async getLanguage() {
                        const l10n = await this._ready;
                        return l10n.getLanguage();
                    }

                    async getDirection() {
                        const l10n = await this._ready;
                        return l10n.getDirection();
                    }

                    async get(key, args = null, fallback = (0, _l10n_utils.getL10nFallback)(key, args)) {
                        const l10n = await this._ready;
                        return l10n.get(key, args, fallback);
                    }

                    async translate(element) {
                        const l10n = await this._ready;
                        return l10n.translate(element);
                    }
                }

                exports.GenericL10n = GenericL10n;

                /***/
            }),
            /* 11 */
            /***/ (() => {


                document.webL10n = function (window, document) {
                    var gL10nData = {};
                    var gTextData = '';
                    var gTextProp = 'textContent';
                    var gLanguage = '';
                    var gMacros = {};
                    var gReadyState = 'loading';
                    var gAsyncResourceLoading = true;

                    function getL10nResourceLinks() {
                        return document.querySelectorAll('link[type="application/l10n"]');
                    }

                    function getL10nDictionary() {
                        var script = document.querySelector('script[type="application/l10n"]');
                        return script ? JSON.parse(script.innerHTML) : null;
                    }

                    function getTranslatableChildren(element) {
                        return element ? element.querySelectorAll('*[data-l10n-id]') : [];
                    }

                    function getL10nAttributes(element) {
                        if (!element) return {};
                        var l10nId = element.getAttribute('data-l10n-id');
                        var l10nArgs = element.getAttribute('data-l10n-args');
                        var args = {};
                        if (l10nArgs) {
                            try {
                                args = JSON.parse(l10nArgs);
                            } catch (e) {
                                console.warn('could not parse arguments for #' + l10nId);
                            }
                        }
                        return {
                            id: l10nId,
                            args: args
                        };
                    }

                    function xhrLoadText(url, onSuccess, onFailure) {
                        onSuccess = onSuccess || function _onSuccess(data) {
                        };
                        onFailure = onFailure || function _onFailure() {
                        };
                        var xhr = new XMLHttpRequest();
                        xhr.open('GET', url, gAsyncResourceLoading);
                        if (xhr.overrideMimeType) {
                            xhr.overrideMimeType('text/plain; charset=utf-8');
                        }
                        xhr.onreadystatechange = function () {
                            if (xhr.readyState == 4) {
                                if (xhr.status == 200 || xhr.status === 0) {
                                    onSuccess(xhr.responseText);
                                } else {
                                    onFailure();
                                }
                            }
                        };
                        xhr.onerror = onFailure;
                        xhr.ontimeout = onFailure;
                        try {
                            xhr.send(null);
                        } catch (e) {
                            onFailure();
                        }
                    }

                    function parseResource(href, lang, successCallback, failureCallback) {
                        var baseURL = href.replace(/[^\/]*$/, '') || './';

                        function evalString(text) {
                            if (text.lastIndexOf('\\') < 0) return text;
                            return text.replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\b/g, '\b').replace(/\\f/g, '\f').replace(/\\{/g, '{').replace(/\\}/g, '}').replace(/\\"/g, '"').replace(/\\'/g, "'");
                        }

                        function parseProperties(text, parsedPropertiesCallback) {
                            var dictionary = {};
                            var reBlank = /^\s*|\s*$/;
                            var reComment = /^\s*#|^\s*$/;
                            var reSection = /^\s*\[(.*)\]\s*$/;
                            var reImport = /^\s*@import\s+url\((.*)\)\s*$/i;
                            var reSplit = /^([^=\s]*)\s*=\s*(.+)$/;

                            function parseRawLines(rawText, extendedSyntax, parsedRawLinesCallback) {
                                var entries = rawText.replace(reBlank, '').split(/[\r\n]+/);
                                var currentLang = '*';
                                var genericLang = lang.split('-', 1)[0];
                                var skipLang = false;
                                var match = '';

                                function nextEntry() {
                                    while (true) {
                                        if (!entries.length) {
                                            parsedRawLinesCallback();
                                            return;
                                        }
                                        var line = entries.shift();
                                        if (reComment.test(line)) continue;
                                        if (extendedSyntax) {
                                            match = reSection.exec(line);
                                            if (match) {
                                                currentLang = match[1].toLowerCase();
                                                skipLang = currentLang !== '*' && currentLang !== lang && currentLang !== genericLang;
                                                continue;
                                            } else if (skipLang) {
                                                continue;
                                            }
                                            match = reImport.exec(line);
                                            if (match) {
                                                loadImport(baseURL + match[1], nextEntry);
                                                return;
                                            }
                                        }
                                        var tmp = line.match(reSplit);
                                        if (tmp && tmp.length == 3) {
                                            dictionary[tmp[1]] = evalString(tmp[2]);
                                        }
                                    }
                                }

                                nextEntry();
                            }

                            function loadImport(url, callback) {
                                xhrLoadText(url, function (content) {
                                    parseRawLines(content, false, callback);
                                }, function () {
                                    console.warn(url + ' not found.');
                                    callback();
                                });
                            }

                            parseRawLines(text, true, function () {
                                parsedPropertiesCallback(dictionary);
                            });
                        }

                        xhrLoadText(href, function (response) {
                            gTextData += response;
                            parseProperties(response, function (data) {
                                for (var key in data) {
                                    var id,
                                        prop,
                                        index = key.lastIndexOf('.');
                                    if (index > 0) {
                                        id = key.substring(0, index);
                                        prop = key.substring(index + 1);
                                    } else {
                                        id = key;
                                        prop = gTextProp;
                                    }
                                    if (!gL10nData[id]) {
                                        gL10nData[id] = {};
                                    }
                                    gL10nData[id][prop] = data[key];
                                }
                                if (successCallback) {
                                    successCallback();
                                }
                            });
                        }, failureCallback);
                    }

                    function loadLocale(lang, callback) {
                        if (lang) {
                            lang = lang.toLowerCase();
                        }
                        callback = callback || function _callback() {
                        };
                        clear();
                        gLanguage = lang;
                        var langLinks = getL10nResourceLinks();
                        var langCount = langLinks.length;
                        if (langCount === 0) {
                            var dict = getL10nDictionary();
                            if (dict && dict.locales && dict.default_locale) {
                                console.log('using the embedded JSON directory, early way out');
                                gL10nData = dict.locales[lang];
                                if (!gL10nData) {
                                    var defaultLocale = dict.default_locale.toLowerCase();
                                    for (var anyCaseLang in dict.locales) {
                                        anyCaseLang = anyCaseLang.toLowerCase();
                                        if (anyCaseLang === lang) {
                                            gL10nData = dict.locales[lang];
                                            break;
                                        } else if (anyCaseLang === defaultLocale) {
                                            gL10nData = dict.locales[defaultLocale];
                                        }
                                    }
                                }
                                callback();
                            } else {
                                console.log('no resource to load, early way out');
                            }
                            gReadyState = 'complete';
                            return;
                        }
                        var onResourceLoaded = null;
                        var gResourceCount = 0;
                        onResourceLoaded = function () {
                            gResourceCount++;
                            if (gResourceCount >= langCount) {
                                callback();
                                gReadyState = 'complete';
                            }
                        };

                        function L10nResourceLink(link) {
                            var href = link.href;
                            this.load = function (lang, callback) {
                                parseResource(href, lang, callback, function () {
                                    console.warn(href + ' not found.');
                                    console.warn('"' + lang + '" resource not found');
                                    gLanguage = '';
                                    callback();
                                });
                            };
                        }

                        for (var i = 0; i < langCount; i++) {
                            var resource = new L10nResourceLink(langLinks[i]);
                            resource.load(lang, onResourceLoaded);
                        }
                    }

                    function clear() {
                        gL10nData = {};
                        gTextData = '';
                        gLanguage = '';
                    }

                    function getPluralRules(lang) {
                        var locales2rules = {
                            'af': 3,
                            'ak': 4,
                            'am': 4,
                            'ar': 1,
                            'asa': 3,
                            'az': 0,
                            'be': 11,
                            'bem': 3,
                            'bez': 3,
                            'bg': 3,
                            'bh': 4,
                            'bm': 0,
                            'bn': 3,
                            'bo': 0,
                            'br': 20,
                            'brx': 3,
                            'bs': 11,
                            'ca': 3,
                            'cgg': 3,
                            'chr': 3,
                            'cs': 12,
                            'cy': 17,
                            'da': 3,
                            'de': 3,
                            'dv': 3,
                            'dz': 0,
                            'ee': 3,
                            'el': 3,
                            'en': 3,
                            'eo': 3,
                            'es': 3,
                            'et': 3,
                            'eu': 3,
                            'fa': 0,
                            'ff': 5,
                            'fi': 3,
                            'fil': 4,
                            'fo': 3,
                            'fr': 5,
                            'fur': 3,
                            'fy': 3,
                            'ga': 8,
                            'gd': 24,
                            'gl': 3,
                            'gsw': 3,
                            'gu': 3,
                            'guw': 4,
                            'gv': 23,
                            'ha': 3,
                            'haw': 3,
                            'he': 2,
                            'hi': 4,
                            'hr': 11,
                            'hu': 0,
                            'id': 0,
                            'ig': 0,
                            'ii': 0,
                            'is': 3,
                            'it': 3,
                            'iu': 7,
                            'ja': 0,
                            'jmc': 3,
                            'jv': 0,
                            'ka': 0,
                            'kab': 5,
                            'kaj': 3,
                            'kcg': 3,
                            'kde': 0,
                            'kea': 0,
                            'kk': 3,
                            'kl': 3,
                            'km': 0,
                            'kn': 0,
                            'ko': 0,
                            'ksb': 3,
                            'ksh': 21,
                            'ku': 3,
                            'kw': 7,
                            'lag': 18,
                            'lb': 3,
                            'lg': 3,
                            'ln': 4,
                            'lo': 0,
                            'lt': 10,
                            'lv': 6,
                            'mas': 3,
                            'mg': 4,
                            'mk': 16,
                            'ml': 3,
                            'mn': 3,
                            'mo': 9,
                            'mr': 3,
                            'ms': 0,
                            'mt': 15,
                            'my': 0,
                            'nah': 3,
                            'naq': 7,
                            'nb': 3,
                            'nd': 3,
                            'ne': 3,
                            'nl': 3,
                            'nn': 3,
                            'no': 3,
                            'nr': 3,
                            'nso': 4,
                            'ny': 3,
                            'nyn': 3,
                            'om': 3,
                            'or': 3,
                            'pa': 3,
                            'pap': 3,
                            'pl': 13,
                            'ps': 3,
                            'pt': 3,
                            'rm': 3,
                            'ro': 9,
                            'rof': 3,
                            'ru': 11,
                            'rwk': 3,
                            'sah': 0,
                            'saq': 3,
                            'se': 7,
                            'seh': 3,
                            'ses': 0,
                            'sg': 0,
                            'sh': 11,
                            'shi': 19,
                            'sk': 12,
                            'sl': 14,
                            'sma': 7,
                            'smi': 7,
                            'smj': 7,
                            'smn': 7,
                            'sms': 7,
                            'sn': 3,
                            'so': 3,
                            'sq': 3,
                            'sr': 11,
                            'ss': 3,
                            'ssy': 3,
                            'st': 3,
                            'sv': 3,
                            'sw': 3,
                            'syr': 3,
                            'ta': 3,
                            'te': 3,
                            'teo': 3,
                            'th': 0,
                            'ti': 4,
                            'tig': 3,
                            'tk': 3,
                            'tl': 4,
                            'tn': 3,
                            'to': 0,
                            'tr': 0,
                            'ts': 3,
                            'tzm': 22,
                            'uk': 11,
                            'ur': 3,
                            've': 3,
                            'vi': 0,
                            'vun': 3,
                            'wa': 4,
                            'wae': 3,
                            'wo': 0,
                            'xh': 3,
                            'xog': 3,
                            'yo': 0,
                            'zh': 0,
                            'zu': 3
                        };

                        function isIn(n, list) {
                            return list.indexOf(n) !== -1;
                        }

                        function isBetween(n, start, end) {
                            return start <= n && n <= end;
                        }

                        var pluralRules = {
                            '0': function (n) {
                                return 'other';
                            },
                            '1': function (n) {
                                if (isBetween(n % 100, 3, 10)) return 'few';
                                if (n === 0) return 'zero';
                                if (isBetween(n % 100, 11, 99)) return 'many';
                                if (n == 2) return 'two';
                                if (n == 1) return 'one';
                                return 'other';
                            },
                            '2': function (n) {
                                if (n !== 0 && n % 10 === 0) return 'many';
                                if (n == 2) return 'two';
                                if (n == 1) return 'one';
                                return 'other';
                            },
                            '3': function (n) {
                                if (n == 1) return 'one';
                                return 'other';
                            },
                            '4': function (n) {
                                if (isBetween(n, 0, 1)) return 'one';
                                return 'other';
                            },
                            '5': function (n) {
                                if (isBetween(n, 0, 2) && n != 2) return 'one';
                                return 'other';
                            },
                            '6': function (n) {
                                if (n === 0) return 'zero';
                                if (n % 10 == 1 && n % 100 != 11) return 'one';
                                return 'other';
                            },
                            '7': function (n) {
                                if (n == 2) return 'two';
                                if (n == 1) return 'one';
                                return 'other';
                            },
                            '8': function (n) {
                                if (isBetween(n, 3, 6)) return 'few';
                                if (isBetween(n, 7, 10)) return 'many';
                                if (n == 2) return 'two';
                                if (n == 1) return 'one';
                                return 'other';
                            },
                            '9': function (n) {
                                if (n === 0 || n != 1 && isBetween(n % 100, 1, 19)) return 'few';
                                if (n == 1) return 'one';
                                return 'other';
                            },
                            '10': function (n) {
                                if (isBetween(n % 10, 2, 9) && !isBetween(n % 100, 11, 19)) return 'few';
                                if (n % 10 == 1 && !isBetween(n % 100, 11, 19)) return 'one';
                                return 'other';
                            },
                            '11': function (n) {
                                if (isBetween(n % 10, 2, 4) && !isBetween(n % 100, 12, 14)) return 'few';
                                if (n % 10 === 0 || isBetween(n % 10, 5, 9) || isBetween(n % 100, 11, 14)) return 'many';
                                if (n % 10 == 1 && n % 100 != 11) return 'one';
                                return 'other';
                            },
                            '12': function (n) {
                                if (isBetween(n, 2, 4)) return 'few';
                                if (n == 1) return 'one';
                                return 'other';
                            },
                            '13': function (n) {
                                if (isBetween(n % 10, 2, 4) && !isBetween(n % 100, 12, 14)) return 'few';
                                if (n != 1 && isBetween(n % 10, 0, 1) || isBetween(n % 10, 5, 9) || isBetween(n % 100, 12, 14)) return 'many';
                                if (n == 1) return 'one';
                                return 'other';
                            },
                            '14': function (n) {
                                if (isBetween(n % 100, 3, 4)) return 'few';
                                if (n % 100 == 2) return 'two';
                                if (n % 100 == 1) return 'one';
                                return 'other';
                            },
                            '15': function (n) {
                                if (n === 0 || isBetween(n % 100, 2, 10)) return 'few';
                                if (isBetween(n % 100, 11, 19)) return 'many';
                                if (n == 1) return 'one';
                                return 'other';
                            },
                            '16': function (n) {
                                if (n % 10 == 1 && n != 11) return 'one';
                                return 'other';
                            },
                            '17': function (n) {
                                if (n == 3) return 'few';
                                if (n === 0) return 'zero';
                                if (n == 6) return 'many';
                                if (n == 2) return 'two';
                                if (n == 1) return 'one';
                                return 'other';
                            },
                            '18': function (n) {
                                if (n === 0) return 'zero';
                                if (isBetween(n, 0, 2) && n !== 0 && n != 2) return 'one';
                                return 'other';
                            },
                            '19': function (n) {
                                if (isBetween(n, 2, 10)) return 'few';
                                if (isBetween(n, 0, 1)) return 'one';
                                return 'other';
                            },
                            '20': function (n) {
                                if ((isBetween(n % 10, 3, 4) || n % 10 == 9) && !(isBetween(n % 100, 10, 19) || isBetween(n % 100, 70, 79) || isBetween(n % 100, 90, 99))) return 'few';
                                if (n % 1000000 === 0 && n !== 0) return 'many';
                                if (n % 10 == 2 && !isIn(n % 100, [12, 72, 92])) return 'two';
                                if (n % 10 == 1 && !isIn(n % 100, [11, 71, 91])) return 'one';
                                return 'other';
                            },
                            '21': function (n) {
                                if (n === 0) return 'zero';
                                if (n == 1) return 'one';
                                return 'other';
                            },
                            '22': function (n) {
                                if (isBetween(n, 0, 1) || isBetween(n, 11, 99)) return 'one';
                                return 'other';
                            },
                            '23': function (n) {
                                if (isBetween(n % 10, 1, 2) || n % 20 === 0) return 'one';
                                return 'other';
                            },
                            '24': function (n) {
                                if (isBetween(n, 3, 10) || isBetween(n, 13, 19)) return 'few';
                                if (isIn(n, [2, 12])) return 'two';
                                if (isIn(n, [1, 11])) return 'one';
                                return 'other';
                            }
                        };
                        var index = locales2rules[lang.replace(/-.*$/, '')];
                        if (!(index in pluralRules)) {
                            console.warn('plural form unknown for [' + lang + ']');
                            return function () {
                                return 'other';
                            };
                        }
                        return pluralRules[index];
                    }

                    gMacros.plural = function (str, param, key, prop) {
                        var n = parseFloat(param);
                        if (isNaN(n)) return str;
                        if (prop != gTextProp) return str;
                        if (!gMacros._pluralRules) {
                            gMacros._pluralRules = getPluralRules(gLanguage);
                        }
                        var index = '[' + gMacros._pluralRules(n) + ']';
                        if (n === 0 && key + '[zero]' in gL10nData) {
                            str = gL10nData[key + '[zero]'][prop];
                        } else if (n == 1 && key + '[one]' in gL10nData) {
                            str = gL10nData[key + '[one]'][prop];
                        } else if (n == 2 && key + '[two]' in gL10nData) {
                            str = gL10nData[key + '[two]'][prop];
                        } else if (key + index in gL10nData) {
                            str = gL10nData[key + index][prop];
                        } else if (key + '[other]' in gL10nData) {
                            str = gL10nData[key + '[other]'][prop];
                        }
                        return str;
                    };

                    function getL10nData(key, args, fallback) {
                        var data = gL10nData[key];
                        if (!data) {
                            console.warn('#' + key + ' is undefined.');
                            if (!fallback) {
                                return null;
                            }
                            data = fallback;
                        }
                        var rv = {};
                        for (var prop in data) {
                            var str = data[prop];
                            str = substIndexes(str, args, key, prop);
                            str = substArguments(str, args, key);
                            rv[prop] = str;
                        }
                        return rv;
                    }

                    function substIndexes(str, args, key, prop) {
                        var reIndex = /\{\[\s*([a-zA-Z]+)\(([a-zA-Z]+)\)\s*\]\}/;
                        var reMatch = reIndex.exec(str);
                        if (!reMatch || !reMatch.length) return str;
                        var macroName = reMatch[1];
                        var paramName = reMatch[2];
                        var param;
                        if (args && paramName in args) {
                            param = args[paramName];
                        } else if (paramName in gL10nData) {
                            param = gL10nData[paramName];
                        }
                        if (macroName in gMacros) {
                            var macro = gMacros[macroName];
                            str = macro(str, param, key, prop);
                        }
                        return str;
                    }

                    function substArguments(str, args, key) {
                        var reArgs = /\{\{\s*(.+?)\s*\}\}/g;
                        return str.replace(reArgs, function (matched_text, arg) {
                            if (args && arg in args) {
                                return args[arg];
                            }
                            if (arg in gL10nData) {
                                return gL10nData[arg];
                            }
                            console.log('argument {{' + arg + '}} for #' + key + ' is undefined.');
                            return matched_text;
                        });
                    }

                    function translateElement(element) {
                        var l10n = getL10nAttributes(element);
                        if (!l10n.id) return;
                        var data = getL10nData(l10n.id, l10n.args);
                        if (!data) {
                            console.warn('#' + l10n.id + ' is undefined.');
                            return;
                        }
                        if (data[gTextProp]) {
                            if (getChildElementCount(element) === 0) {
                                element[gTextProp] = data[gTextProp];
                            } else {
                                var children = element.childNodes;
                                var found = false;
                                for (var i = 0, l = children.length; i < l; i++) {
                                    if (children[i].nodeType === 3 && /\S/.test(children[i].nodeValue)) {
                                        if (found) {
                                            children[i].nodeValue = '';
                                        } else {
                                            children[i].nodeValue = data[gTextProp];
                                            found = true;
                                        }
                                    }
                                }
                                if (!found) {
                                    var textNode = document.createTextNode(data[gTextProp]);
                                    element.prepend(textNode);
                                }
                            }
                            delete data[gTextProp];
                        }
                        for (var k in data) {
                            element[k] = data[k];
                        }
                    }

                    function getChildElementCount(element) {
                        if (element.children) {
                            return element.children.length;
                        }
                        if (typeof element.childElementCount !== 'undefined') {
                            return element.childElementCount;
                        }
                        var count = 0;
                        for (var i = 0; i < element.childNodes.length; i++) {
                            count += element.nodeType === 1 ? 1 : 0;
                        }
                        return count;
                    }

                    function translateFragment(element) {
                        element = element || document.documentElement;
                        var children = getTranslatableChildren(element);
                        var elementCount = children.length;
                        for (var i = 0; i < elementCount; i++) {
                            translateElement(children[i]);
                        }
                        translateElement(element);
                    }

                    return {
                        get: function (key, args, fallbackString) {
                            var index = key.lastIndexOf('.');
                            var prop = gTextProp;
                            if (index > 0) {
                                prop = key.substring(index + 1);
                                key = key.substring(0, index);
                            }
                            var fallback;
                            if (fallbackString) {
                                fallback = {};
                                fallback[prop] = fallbackString;
                            }
                            var data = getL10nData(key, args, fallback);
                            if (data && prop in data) {
                                return data[prop];
                            }
                            return '{{' + key + '}}';
                        },
                        getData: function () {
                            return gL10nData;
                        },
                        getText: function () {
                            return gTextData;
                        },
                        getLanguage: function () {
                            return gLanguage;
                        },
                        setLanguage: function (lang, callback) {
                            loadLocale(lang, function () {
                                if (callback) callback();
                            });
                        },
                        getDirection: function () {
                            var rtlList = ['ar', 'he', 'fa', 'ps', 'ur'];
                            var shortCode = gLanguage.split('-', 1)[0];
                            return rtlList.indexOf(shortCode) >= 0 ? 'rtl' : 'ltr';
                        },
                        translate: translateFragment,
                        getReadyState: function () {
                            return gReadyState;
                        },
                        ready: function (callback) {
                            if (!callback) {
                                return;
                            } else if (gReadyState == 'complete' || gReadyState == 'interactive') {
                                window.setTimeout(function () {
                                    callback();
                                });
                            } else if (document.addEventListener) {
                                document.addEventListener('localized', function once() {
                                    document.removeEventListener('localized', once);
                                    callback();
                                });
                            }
                        }
                    };
                }(window, document);

                /***/
            }),
            /* 12 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.PDFHistory = void 0;
                exports.isDestArraysEqual = isDestArraysEqual;
                exports.isDestHashesEqual = isDestHashesEqual;
                var _ui_utils = __w_pdfjs_require__(2);
                var _event_utils = __w_pdfjs_require__(9);
                const HASH_CHANGE_TIMEOUT = 1000;
                const POSITION_UPDATED_THRESHOLD = 50;
                const UPDATE_VIEWAREA_TIMEOUT = 1000;

                function getCurrentHash() {
                    return document.location.hash;
                }

                class PDFHistory {
                    constructor({
                                    linkService,
                                    eventBus
                                }) {
                        this.linkService = linkService;
                        this.eventBus = eventBus;
                        this._initialized = false;
                        this._fingerprint = "";
                        this.reset();
                        this._boundEvents = null;
                        this.eventBus._on("pagesinit", () => {
                            this._isPagesLoaded = false;
                            this.eventBus._on("pagesloaded", evt => {
                                this._isPagesLoaded = !!evt.pagesCount;
                            }, {
                                once: true
                            });
                        });
                    }

                    initialize({
                                   fingerprint,
                                   resetHistory = false,
                                   updateUrl = false
                               }) {
                        if (!fingerprint || typeof fingerprint !== "string") {
                            console.error('PDFHistory.initialize: The "fingerprint" must be a non-empty string.');
                            return;
                        }
                        if (this._initialized) {
                            this.reset();
                        }
                        const reInitialized = this._fingerprint !== "" && this._fingerprint !== fingerprint;
                        this._fingerprint = fingerprint;
                        this._updateUrl = updateUrl === true;
                        this._initialized = true;
                        this._bindEvents();
                        const state = window.history.state;
                        this._popStateInProgress = false;
                        this._blockHashChange = 0;
                        this._currentHash = getCurrentHash();
                        this._numPositionUpdates = 0;
                        this._uid = this._maxUid = 0;
                        this._destination = null;
                        this._position = null;
                        if (!this._isValidState(state, true) || resetHistory) {
                            const {
                                hash,
                                page,
                                rotation
                            } = this._parseCurrentHash(true);
                            if (!hash || reInitialized || resetHistory) {
                                this._pushOrReplaceState(null, true);
                                return;
                            }
                            this._pushOrReplaceState({
                                hash,
                                page,
                                rotation
                            }, true);
                            return;
                        }
                        const destination = state.destination;
                        this._updateInternalState(destination, state.uid, true);
                        if (destination.rotation !== undefined) {
                            this._initialRotation = destination.rotation;
                        }
                        if (destination.dest) {
                            this._initialBookmark = JSON.stringify(destination.dest);
                            this._destination.page = null;
                        } else if (destination.hash) {
                            this._initialBookmark = destination.hash;
                        } else if (destination.page) {
                            this._initialBookmark = `page=${destination.page}`;
                        }
                    }

                    reset() {
                        if (this._initialized) {
                            this._pageHide();
                            this._initialized = false;
                            this._unbindEvents();
                        }
                        if (this._updateViewareaTimeout) {
                            clearTimeout(this._updateViewareaTimeout);
                            this._updateViewareaTimeout = null;
                        }
                        this._initialBookmark = null;
                        this._initialRotation = null;
                    }

                    push({
                             namedDest = null,
                             explicitDest,
                             pageNumber
                         }) {
                        if (!this._initialized) {
                            return;
                        }
                        if (namedDest && typeof namedDest !== "string") {
                            console.error("PDFHistory.push: " + `"${namedDest}" is not a valid namedDest parameter.`);
                            return;
                        } else if (!Array.isArray(explicitDest)) {
                            console.error("PDFHistory.push: " + `"${explicitDest}" is not a valid explicitDest parameter.`);
                            return;
                        } else if (!this._isValidPage(pageNumber)) {
                            if (pageNumber !== null || this._destination) {
                                console.error("PDFHistory.push: " + `"${pageNumber}" is not a valid pageNumber parameter.`);
                                return;
                            }
                        }
                        const hash = namedDest || JSON.stringify(explicitDest);
                        if (!hash) {
                            return;
                        }
                        let forceReplace = false;
                        if (this._destination && (isDestHashesEqual(this._destination.hash, hash) || isDestArraysEqual(this._destination.dest, explicitDest))) {
                            if (this._destination.page) {
                                return;
                            }
                            forceReplace = true;
                        }
                        if (this._popStateInProgress && !forceReplace) {
                            return;
                        }
                        this._pushOrReplaceState({
                            dest: explicitDest,
                            hash,
                            page: pageNumber,
                            rotation: this.linkService.rotation
                        }, forceReplace);
                        if (!this._popStateInProgress) {
                            this._popStateInProgress = true;
                            Promise.resolve().then(() => {
                                this._popStateInProgress = false;
                            });
                        }
                    }

                    pushPage(pageNumber) {
                        if (!this._initialized) {
                            return;
                        }
                        if (!this._isValidPage(pageNumber)) {
                            console.error(`PDFHistory.pushPage: "${pageNumber}" is not a valid page number.`);
                            return;
                        }
                        if (this._destination?.page === pageNumber) {
                            return;
                        }
                        if (this._popStateInProgress) {
                            return;
                        }
                        this._pushOrReplaceState({
                            dest: null,
                            hash: `page=${pageNumber}`,
                            page: pageNumber,
                            rotation: this.linkService.rotation
                        });
                        if (!this._popStateInProgress) {
                            this._popStateInProgress = true;
                            Promise.resolve().then(() => {
                                this._popStateInProgress = false;
                            });
                        }
                    }

                    pushCurrentPosition() {
                        if (!this._initialized || this._popStateInProgress) {
                            return;
                        }
                        this._tryPushCurrentPosition();
                    }

                    back() {
                        if (!this._initialized || this._popStateInProgress) {
                            return;
                        }
                        const state = window.history.state;
                        if (this._isValidState(state) && state.uid > 0) {
                            window.history.back();
                        }
                    }

                    forward() {
                        if (!this._initialized || this._popStateInProgress) {
                            return;
                        }
                        const state = window.history.state;
                        if (this._isValidState(state) && state.uid < this._maxUid) {
                            window.history.forward();
                        }
                    }

                    get popStateInProgress() {
                        return this._initialized && (this._popStateInProgress || this._blockHashChange > 0);
                    }

                    get initialBookmark() {
                        return this._initialized ? this._initialBookmark : null;
                    }

                    get initialRotation() {
                        return this._initialized ? this._initialRotation : null;
                    }

                    _pushOrReplaceState(destination, forceReplace = false) {
                        const shouldReplace = forceReplace || !this._destination;
                        const newState = {
                            fingerprint: this._fingerprint,
                            uid: shouldReplace ? this._uid : this._uid + 1,
                            destination
                        };
                        this._updateInternalState(destination, newState.uid);
                        let newUrl;
                        if (this._updateUrl && destination?.hash) {
                            const baseUrl = document.location.href.split("#")[0];
                            if (!baseUrl.startsWith("file://")) {
                                newUrl = `${baseUrl}#${destination.hash}`;
                            }
                        }
                        if (shouldReplace) {
                            window.history.replaceState(newState, "", newUrl);
                        } else {
                            window.history.pushState(newState, "", newUrl);
                        }
                    }

                    _tryPushCurrentPosition(temporary = false) {
                        if (!this._position) {
                            return;
                        }
                        let position = this._position;
                        if (temporary) {
                            position = Object.assign(Object.create(null), this._position);
                            position.temporary = true;
                        }
                        if (!this._destination) {
                            this._pushOrReplaceState(position);
                            return;
                        }
                        if (this._destination.temporary) {
                            this._pushOrReplaceState(position, true);
                            return;
                        }
                        if (this._destination.hash === position.hash) {
                            return;
                        }
                        if (!this._destination.page && (POSITION_UPDATED_THRESHOLD <= 0 || this._numPositionUpdates <= POSITION_UPDATED_THRESHOLD)) {
                            return;
                        }
                        let forceReplace = false;
                        if (this._destination.page >= position.first && this._destination.page <= position.page) {
                            if (this._destination.dest !== undefined || !this._destination.first) {
                                return;
                            }
                            forceReplace = true;
                        }
                        this._pushOrReplaceState(position, forceReplace);
                    }

                    _isValidPage(val) {
                        return Number.isInteger(val) && val > 0 && val <= this.linkService.pagesCount;
                    }

                    _isValidState(state, checkReload = false) {
                        if (!state) {
                            return false;
                        }
                        if (state.fingerprint !== this._fingerprint) {
                            if (checkReload) {
                                if (typeof state.fingerprint !== "string" || state.fingerprint.length !== this._fingerprint.length) {
                                    return false;
                                }
                                const [perfEntry] = performance.getEntriesByType("navigation");
                                if (perfEntry?.type !== "reload") {
                                    return false;
                                }
                            } else {
                                return false;
                            }
                        }
                        if (!Number.isInteger(state.uid) || state.uid < 0) {
                            return false;
                        }
                        if (state.destination === null || typeof state.destination !== "object") {
                            return false;
                        }
                        return true;
                    }

                    _updateInternalState(destination, uid, removeTemporary = false) {
                        if (this._updateViewareaTimeout) {
                            clearTimeout(this._updateViewareaTimeout);
                            this._updateViewareaTimeout = null;
                        }
                        if (removeTemporary && destination?.temporary) {
                            delete destination.temporary;
                        }
                        this._destination = destination;
                        this._uid = uid;
                        this._maxUid = Math.max(this._maxUid, uid);
                        this._numPositionUpdates = 0;
                    }

                    _parseCurrentHash(checkNameddest = false) {
                        const hash = unescape(getCurrentHash()).substring(1);
                        const params = (0, _ui_utils.parseQueryString)(hash);
                        const nameddest = params.get("nameddest") || "";
                        let page = params.get("page") | 0;
                        if (!this._isValidPage(page) || checkNameddest && nameddest.length > 0) {
                            page = null;
                        }
                        return {
                            hash,
                            page,
                            rotation: this.linkService.rotation
                        };
                    }

                    _updateViewarea({
                                        location
                                    }) {
                        if (this._updateViewareaTimeout) {
                            clearTimeout(this._updateViewareaTimeout);
                            this._updateViewareaTimeout = null;
                        }
                        this._position = {
                            hash: location.pdfOpenParams.substring(1),
                            page: this.linkService.page,
                            first: location.pageNumber,
                            rotation: location.rotation
                        };
                        if (this._popStateInProgress) {
                            return;
                        }
                        if (POSITION_UPDATED_THRESHOLD > 0 && this._isPagesLoaded && this._destination && !this._destination.page) {
                            this._numPositionUpdates++;
                        }
                        if (UPDATE_VIEWAREA_TIMEOUT > 0) {
                            this._updateViewareaTimeout = setTimeout(() => {
                                if (!this._popStateInProgress) {
                                    this._tryPushCurrentPosition(true);
                                }
                                this._updateViewareaTimeout = null;
                            }, UPDATE_VIEWAREA_TIMEOUT);
                        }
                    }

                    _popState({
                                  state
                              }) {
                        const newHash = getCurrentHash(),
                            hashChanged = this._currentHash !== newHash;
                        this._currentHash = newHash;
                        if (!state) {
                            this._uid++;
                            const {
                                hash,
                                page,
                                rotation
                            } = this._parseCurrentHash();
                            this._pushOrReplaceState({
                                hash,
                                page,
                                rotation
                            }, true);
                            return;
                        }
                        if (!this._isValidState(state)) {
                            return;
                        }
                        this._popStateInProgress = true;
                        if (hashChanged) {
                            this._blockHashChange++;
                            (0, _event_utils.waitOnEventOrTimeout)({
                                target: window,
                                name: "hashchange",
                                delay: HASH_CHANGE_TIMEOUT
                            }).then(() => {
                                this._blockHashChange--;
                            });
                        }
                        const destination = state.destination;
                        this._updateInternalState(destination, state.uid, true);
                        if ((0, _ui_utils.isValidRotation)(destination.rotation)) {
                            this.linkService.rotation = destination.rotation;
                        }
                        if (destination.dest) {
                            this.linkService.goToDestination(destination.dest);
                        } else if (destination.hash) {
                            this.linkService.setHash(destination.hash);
                        } else if (destination.page) {
                            this.linkService.page = destination.page;
                        }
                        Promise.resolve().then(() => {
                            this._popStateInProgress = false;
                        });
                    }

                    _pageHide() {
                        if (!this._destination || this._destination.temporary) {
                            this._tryPushCurrentPosition();
                        }
                    }

                    _bindEvents() {
                        if (this._boundEvents) {
                            return;
                        }
                        this._boundEvents = {
                            updateViewarea: this._updateViewarea.bind(this),
                            popState: this._popState.bind(this),
                            pageHide: this._pageHide.bind(this)
                        };
                        this.eventBus._on("updateviewarea", this._boundEvents.updateViewarea);
                        window.addEventListener("popstate", this._boundEvents.popState);
                        window.addEventListener("pagehide", this._boundEvents.pageHide);
                    }

                    _unbindEvents() {
                        if (!this._boundEvents) {
                            return;
                        }
                        this.eventBus._off("updateviewarea", this._boundEvents.updateViewarea);
                        window.removeEventListener("popstate", this._boundEvents.popState);
                        window.removeEventListener("pagehide", this._boundEvents.pageHide);
                        this._boundEvents = null;
                    }
                }

                exports.PDFHistory = PDFHistory;

                function isDestHashesEqual(destHash, pushHash) {
                    if (typeof destHash !== "string" || typeof pushHash !== "string") {
                        return false;
                    }
                    if (destHash === pushHash) {
                        return true;
                    }
                    const nameddest = (0, _ui_utils.parseQueryString)(destHash).get("nameddest");
                    if (nameddest === pushHash) {
                        return true;
                    }
                    return false;
                }

                function isDestArraysEqual(firstDest, secondDest) {
                    function isEntryEqual(first, second) {
                        if (typeof first !== typeof second) {
                            return false;
                        }
                        if (Array.isArray(first) || Array.isArray(second)) {
                            return false;
                        }
                        if (first !== null && typeof first === "object" && second !== null) {
                            if (Object.keys(first).length !== Object.keys(second).length) {
                                return false;
                            }
                            for (const key in first) {
                                if (!isEntryEqual(first[key], second[key])) {
                                    return false;
                                }
                            }
                            return true;
                        }
                        return first === second || Number.isNaN(first) && Number.isNaN(second);
                    }

                    if (!(Array.isArray(firstDest) && Array.isArray(secondDest))) {
                        return false;
                    }
                    if (firstDest.length !== secondDest.length) {
                        return false;
                    }
                    for (let i = 0, ii = firstDest.length; i < ii; i++) {
                        if (!isEntryEqual(firstDest[i], secondDest[i])) {
                            return false;
                        }
                    }
                    return true;
                }

                /***/
            }),
            /* 13 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.PDFPageView = void 0;
                var _pdfjsLib = __w_pdfjs_require__(4);
                var _ui_utils = __w_pdfjs_require__(2);
                var _annotation_editor_layer_builder = __w_pdfjs_require__(14);
                var _annotation_layer_builder = __w_pdfjs_require__(6);
                var _app_options = __w_pdfjs_require__(15);
                var _l10n_utils = __w_pdfjs_require__(7);
                var _pdf_link_service = __w_pdfjs_require__(5);
                var _struct_tree_layer_builder = __w_pdfjs_require__(16);
                var _text_accessibility = __w_pdfjs_require__(17);
                var _text_highlighter = __w_pdfjs_require__(18);
                var _text_layer_builder = __w_pdfjs_require__(19);
                var _xfa_layer_builder = __w_pdfjs_require__(20);
                const MAX_CANVAS_PIXELS = _app_options.compatibilityParams.maxCanvasPixels || 16777216;
                const DEFAULT_LAYER_PROPERTIES = () => {
                    return {
                        annotationEditorUIManager: null,
                        annotationStorage: null,
                        downloadManager: null,
                        enableScripting: false,
                        fieldObjectsPromise: null,
                        findController: null,
                        hasJSActionsPromise: null,
                        get linkService() {
                            return new _pdf_link_service.SimpleLinkService();
                        }
                    };
                };

                class PDFPageView {
                    #annotationMode = _pdfjsLib.AnnotationMode.ENABLE_FORMS;
                    #hasRestrictedScaling = false;
                    #layerProperties = null;
                    #loadingId = null;
                    #previousRotation = null;
                    #renderError = null;
                    #renderingState = _ui_utils.RenderingStates.INITIAL;
                    #textLayerMode = _ui_utils.TextLayerMode.ENABLE;
                    #useThumbnailCanvas = {
                        directDrawing: true,
                        initialOptionalContent: true,
                        regularAnnotations: true
                    };
                    #viewportMap = new WeakMap();

                    constructor(options) {
                        const container = options.container;
                        const defaultViewport = options.defaultViewport;
                        this.id = options.id;
                        this.renderingId = "page" + this.id;
                        this.#layerProperties = options.layerProperties || DEFAULT_LAYER_PROPERTIES;
                        this.pdfPage = null;
                        this.pageLabel = null;
                        this.rotation = 0;
                        this.scale = options.scale || _ui_utils.DEFAULT_SCALE;
                        this.viewport = defaultViewport;
                        this.pdfPageRotate = defaultViewport.rotation;
                        this._optionalContentConfigPromise = options.optionalContentConfigPromise || null;
                        this.#textLayerMode = options.textLayerMode ?? _ui_utils.TextLayerMode.ENABLE;
                        this.#annotationMode = options.annotationMode ?? _pdfjsLib.AnnotationMode.ENABLE_FORMS;
                        this.imageResourcesPath = options.imageResourcesPath || "";
                        this.isOffscreenCanvasSupported = options.isOffscreenCanvasSupported ?? true;
                        this.maxCanvasPixels = options.maxCanvasPixels ?? MAX_CANVAS_PIXELS;
                        this.pageColors = options.pageColors || null;
                        this.eventBus = options.eventBus;
                        this.renderingQueue = options.renderingQueue;
                        this.l10n = options.l10n || _l10n_utils.NullL10n;
                        this.renderTask = null;
                        this.resume = null;
                        this._isStandalone = !this.renderingQueue?.hasViewer();
                        this._container = container;
                        if (options.useOnlyCssZoom) {
                            console.error("useOnlyCssZoom was removed, please use `maxCanvasPixels = 0` instead.");
                            this.maxCanvasPixels = 0;
                        }
                        this._annotationCanvasMap = null;
                        this.annotationLayer = null;
                        this.annotationEditorLayer = null;
                        this.textLayer = null;
                        this.zoomLayer = null;
                        this.xfaLayer = null;
                        this.structTreeLayer = null;
                        const div = document.createElement("div");
                        div.className = "page";
                        div.setAttribute("data-page-number", this.id);
                        div.setAttribute("role", "region");
                        this.l10n.get("page_landmark", {
                            page: this.id
                        }).then(msg => {
                            div.setAttribute("aria-label", msg);
                        });
                        this.div = div;
                        this.#setDimensions();
                        container?.append(div);
                        if (this._isStandalone) {
                            container?.style.setProperty("--scale-factor", this.scale * _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS);
                            const {
                                optionalContentConfigPromise
                            } = options;
                            if (optionalContentConfigPromise) {
                                optionalContentConfigPromise.then(optionalContentConfig => {
                                    if (optionalContentConfigPromise !== this._optionalContentConfigPromise) {
                                        return;
                                    }
                                    this.#useThumbnailCanvas.initialOptionalContent = optionalContentConfig.hasInitialVisibility;
                                });
                            }
                        }
                    }

                    get renderingState() {
                        return this.#renderingState;
                    }

                    set renderingState(state) {
                        if (state === this.#renderingState) {
                            return;
                        }
                        this.#renderingState = state;
                        if (this.#loadingId) {
                            clearTimeout(this.#loadingId);
                            this.#loadingId = null;
                        }
                        switch (state) {
                            case _ui_utils.RenderingStates.PAUSED:
                                this.div.classList.remove("loading");
                                break;
                            case _ui_utils.RenderingStates.RUNNING:
                                this.div.classList.add("loadingIcon");
                                this.#loadingId = setTimeout(() => {
                                    this.div.classList.add("loading");
                                    this.#loadingId = null;
                                }, 0);
                                break;
                            case _ui_utils.RenderingStates.INITIAL:
                            case _ui_utils.RenderingStates.FINISHED:
                                this.div.classList.remove("loadingIcon", "loading");
                                break;
                        }
                    }

                    #setDimensions() {
                        const {
                            viewport
                        } = this;
                        if (this.pdfPage) {
                            if (this.#previousRotation === viewport.rotation) {
                                return;
                            }
                            this.#previousRotation = viewport.rotation;
                        }
                        (0, _pdfjsLib.setLayerDimensions)(this.div, viewport, true, false);
                    }

                    setPdfPage(pdfPage) {
                        if (this._isStandalone && (this.pageColors?.foreground === "CanvasText" || this.pageColors?.background === "Canvas")) {
                            this._container?.style.setProperty("--hcm-highligh-filter", pdfPage.filterFactory.addHighlightHCMFilter("CanvasText", "Canvas", "HighlightText", "Highlight"));
                        }
                        this.pdfPage = pdfPage;
                        this.pdfPageRotate = pdfPage.rotate;
                        const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
                        this.viewport = pdfPage.getViewport({
                            scale: this.scale * _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS,
                            rotation: totalRotation
                        });
                        this.#setDimensions();
                        this.reset();
                    }

                    destroy() {
                        this.reset();
                        this.pdfPage?.cleanup();
                    }

                    get _textHighlighter() {
                        return (0, _pdfjsLib.shadow)(this, "_textHighlighter", new _text_highlighter.TextHighlighter({
                            pageIndex: this.id - 1,
                            eventBus: this.eventBus,
                            findController: this.#layerProperties().findController
                        }));
                    }

                    async #renderAnnotationLayer() {
                        let error = null;
                        try {
                            await this.annotationLayer.render(this.viewport, "display");
                        } catch (ex) {
                            console.error(`#renderAnnotationLayer: "${ex}".`);
                            error = ex;
                        } finally {
                            this.eventBus.dispatch("annotationlayerrendered", {
                                source: this,
                                pageNumber: this.id,
                                error
                            });
                        }
                    }

                    async #renderAnnotationEditorLayer() {
                        let error = null;
                        try {
                            await this.annotationEditorLayer.render(this.viewport, "display");
                        } catch (ex) {
                            console.error(`#renderAnnotationEditorLayer: "${ex}".`);
                            error = ex;
                        } finally {
                            this.eventBus.dispatch("annotationeditorlayerrendered", {
                                source: this,
                                pageNumber: this.id,
                                error
                            });
                        }
                    }

                    async #renderXfaLayer() {
                        let error = null;
                        try {
                            const result = await this.xfaLayer.render(this.viewport, "display");
                            if (result?.textDivs && this._textHighlighter) {
                                this.#buildXfaTextContentItems(result.textDivs);
                            }
                        } catch (ex) {
                            console.error(`#renderXfaLayer: "${ex}".`);
                            error = ex;
                        } finally {
                            this.eventBus.dispatch("xfalayerrendered", {
                                source: this,
                                pageNumber: this.id,
                                error
                            });
                        }
                    }

                    async #renderTextLayer() {
                        const {
                            pdfPage,
                            textLayer,
                            viewport
                        } = this;
                        if (!textLayer) {
                            return;
                        }
                        let error = null;
                        try {
                            if (!textLayer.renderingDone) {
                                const readableStream = pdfPage.streamTextContent({
                                    includeMarkedContent: true,
                                    disableNormalization: true
                                });
                                textLayer.setTextContentSource(readableStream);
                            }
                            await textLayer.render(viewport);
                        } catch (ex) {
                            if (ex instanceof _pdfjsLib.AbortException) {
                                return;
                            }
                            console.error(`#renderTextLayer: "${ex}".`);
                            error = ex;
                        }
                        this.eventBus.dispatch("textlayerrendered", {
                            source: this,
                            pageNumber: this.id,
                            numTextDivs: textLayer.numTextDivs,
                            error
                        });
                        this.#renderStructTreeLayer();
                    }

                    async #renderStructTreeLayer() {
                        if (!this.textLayer) {
                            return;
                        }
                        this.structTreeLayer ||= new _struct_tree_layer_builder.StructTreeLayerBuilder();
                        const tree = await (!this.structTreeLayer.renderingDone ? this.pdfPage.getStructTree() : null);
                        const treeDom = this.structTreeLayer?.render(tree);
                        if (treeDom) {
                            this.canvas?.append(treeDom);
                        }
                        this.structTreeLayer?.show();
                    }

                    async #buildXfaTextContentItems(textDivs) {
                        const text = await this.pdfPage.getTextContent();
                        const items = [];
                        for (const item of text.items) {
                            items.push(item.str);
                        }
                        this._textHighlighter.setTextMapping(textDivs, items);
                        this._textHighlighter.enable();
                    }

                    _resetZoomLayer(removeFromDOM = false) {
                        if (!this.zoomLayer) {
                            return;
                        }
                        const zoomLayerCanvas = this.zoomLayer.firstChild;
                        this.#viewportMap.delete(zoomLayerCanvas);
                        zoomLayerCanvas.width = 0;
                        zoomLayerCanvas.height = 0;
                        if (removeFromDOM) {
                            this.zoomLayer.remove();
                        }
                        this.zoomLayer = null;
                    }

                    reset({
                              keepZoomLayer = false,
                              keepAnnotationLayer = false,
                              keepAnnotationEditorLayer = false,
                              keepXfaLayer = false,
                              keepTextLayer = false
                          } = {}) {
                        this.cancelRendering({
                            keepAnnotationLayer,
                            keepAnnotationEditorLayer,
                            keepXfaLayer,
                            keepTextLayer
                        });
                        this.renderingState = _ui_utils.RenderingStates.INITIAL;
                        const div = this.div;
                        const childNodes = div.childNodes,
                            zoomLayerNode = keepZoomLayer && this.zoomLayer || null,
                            annotationLayerNode = keepAnnotationLayer && this.annotationLayer?.div || null,
                            annotationEditorLayerNode = keepAnnotationEditorLayer && this.annotationEditorLayer?.div || null,
                            xfaLayerNode = keepXfaLayer && this.xfaLayer?.div || null,
                            textLayerNode = keepTextLayer && this.textLayer?.div || null;
                        for (let i = childNodes.length - 1; i >= 0; i--) {
                            const node = childNodes[i];
                            switch (node) {
                                case zoomLayerNode:
                                case annotationLayerNode:
                                case annotationEditorLayerNode:
                                case xfaLayerNode:
                                case textLayerNode:
                                    continue;
                            }
                            node.remove();
                        }
                        div.removeAttribute("data-loaded");
                        if (annotationLayerNode) {
                            this.annotationLayer.hide();
                        }
                        if (annotationEditorLayerNode) {
                            this.annotationEditorLayer.hide();
                        }
                        if (xfaLayerNode) {
                            this.xfaLayer.hide();
                        }
                        if (textLayerNode) {
                            this.textLayer.hide();
                        }
                        this.structTreeLayer?.hide();
                        if (!zoomLayerNode) {
                            if (this.canvas) {
                                this.#viewportMap.delete(this.canvas);
                                this.canvas.width = 0;
                                this.canvas.height = 0;
                                delete this.canvas;
                            }
                            this._resetZoomLayer();
                        }
                    }

                    update({
                               scale = 0,
                               rotation = null,
                               optionalContentConfigPromise = null,
                               drawingDelay = -1
                           }) {
                        this.scale = scale || this.scale;
                        if (typeof rotation === "number") {
                            this.rotation = rotation;
                        }
                        if (optionalContentConfigPromise instanceof Promise) {
                            this._optionalContentConfigPromise = optionalContentConfigPromise;
                            optionalContentConfigPromise.then(optionalContentConfig => {
                                if (optionalContentConfigPromise !== this._optionalContentConfigPromise) {
                                    return;
                                }
                                this.#useThumbnailCanvas.initialOptionalContent = optionalContentConfig.hasInitialVisibility;
                            });
                        }
                        this.#useThumbnailCanvas.directDrawing = true;
                        const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
                        this.viewport = this.viewport.clone({
                            scale: this.scale * _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS,
                            rotation: totalRotation
                        });
                        this.#setDimensions();
                        if (this._isStandalone) {
                            this._container?.style.setProperty("--scale-factor", this.viewport.scale);
                        }
                        if (this.canvas) {
                            let onlyCssZoom = false;
                            if (this.#hasRestrictedScaling) {
                                if (this.maxCanvasPixels === 0) {
                                    onlyCssZoom = true;
                                } else if (this.maxCanvasPixels > 0) {
                                    const {
                                        width,
                                        height
                                    } = this.viewport;
                                    const {
                                        sx,
                                        sy
                                    } = this.outputScale;
                                    onlyCssZoom = (Math.floor(width) * sx | 0) * (Math.floor(height) * sy | 0) > this.maxCanvasPixels;
                                }
                            }
                            const postponeDrawing = !onlyCssZoom && drawingDelay >= 0 && drawingDelay < 1000;
                            if (postponeDrawing || onlyCssZoom) {
                                if (postponeDrawing && this.renderingState !== _ui_utils.RenderingStates.FINISHED) {
                                    this.cancelRendering({
                                        keepZoomLayer: true,
                                        keepAnnotationLayer: true,
                                        keepAnnotationEditorLayer: true,
                                        keepXfaLayer: true,
                                        keepTextLayer: true,
                                        cancelExtraDelay: drawingDelay
                                    });
                                    this.renderingState = _ui_utils.RenderingStates.FINISHED;
                                    this.#useThumbnailCanvas.directDrawing = false;
                                }
                                this.cssTransform({
                                    target: this.canvas,
                                    redrawAnnotationLayer: true,
                                    redrawAnnotationEditorLayer: true,
                                    redrawXfaLayer: true,
                                    redrawTextLayer: !postponeDrawing,
                                    hideTextLayer: postponeDrawing
                                });
                                if (postponeDrawing) {
                                    return;
                                }
                                this.eventBus.dispatch("pagerendered", {
                                    source: this,
                                    pageNumber: this.id,
                                    cssTransform: true,
                                    timestamp: performance.now(),
                                    error: this.#renderError
                                });
                                return;
                            }
                            if (!this.zoomLayer && !this.canvas.hidden) {
                                this.zoomLayer = this.canvas.parentNode;
                                this.zoomLayer.style.position = "absolute";
                            }
                        }
                        if (this.zoomLayer) {
                            this.cssTransform({
                                target: this.zoomLayer.firstChild
                            });
                        }
                        this.reset({
                            keepZoomLayer: true,
                            keepAnnotationLayer: true,
                            keepAnnotationEditorLayer: true,
                            keepXfaLayer: true,
                            keepTextLayer: true
                        });
                    }

                    cancelRendering({
                                        keepAnnotationLayer = false,
                                        keepAnnotationEditorLayer = false,
                                        keepXfaLayer = false,
                                        keepTextLayer = false,
                                        cancelExtraDelay = 0
                                    } = {}) {
                        if (this.renderTask) {
                            this.renderTask.cancel(cancelExtraDelay);
                            this.renderTask = null;
                        }
                        this.resume = null;
                        if (this.textLayer && (!keepTextLayer || !this.textLayer.div)) {
                            this.textLayer.cancel();
                            this.textLayer = null;
                        }
                        if (this.structTreeLayer && !this.textLayer) {
                            this.structTreeLayer = null;
                        }
                        if (this.annotationLayer && (!keepAnnotationLayer || !this.annotationLayer.div)) {
                            this.annotationLayer.cancel();
                            this.annotationLayer = null;
                            this._annotationCanvasMap = null;
                        }
                        if (this.annotationEditorLayer && (!keepAnnotationEditorLayer || !this.annotationEditorLayer.div)) {
                            this.annotationEditorLayer.cancel();
                            this.annotationEditorLayer = null;
                        }
                        if (this.xfaLayer && (!keepXfaLayer || !this.xfaLayer.div)) {
                            this.xfaLayer.cancel();
                            this.xfaLayer = null;
                            this._textHighlighter?.disable();
                        }
                    }

                    cssTransform({
                                     target,
                                     redrawAnnotationLayer = false,
                                     redrawAnnotationEditorLayer = false,
                                     redrawXfaLayer = false,
                                     redrawTextLayer = false,
                                     hideTextLayer = false
                                 }) {
                        if (!target.hasAttribute("zooming")) {
                            target.setAttribute("zooming", true);
                            const {
                                style
                            } = target;
                            style.width = style.height = "";
                        }
                        const originalViewport = this.#viewportMap.get(target);
                        if (this.viewport !== originalViewport) {
                            const relativeRotation = this.viewport.rotation - originalViewport.rotation;
                            const absRotation = Math.abs(relativeRotation);
                            let scaleX = 1,
                                scaleY = 1;
                            if (absRotation === 90 || absRotation === 270) {
                                const {
                                    width,
                                    height
                                } = this.viewport;
                                scaleX = height / width;
                                scaleY = width / height;
                            }
                            target.style.transform = `rotate(${relativeRotation}deg) scale(${scaleX}, ${scaleY})`;
                        }
                        if (redrawAnnotationLayer && this.annotationLayer) {
                            this.#renderAnnotationLayer();
                        }
                        if (redrawAnnotationEditorLayer && this.annotationEditorLayer) {
                            this.#renderAnnotationEditorLayer();
                        }
                        if (redrawXfaLayer && this.xfaLayer) {
                            this.#renderXfaLayer();
                        }
                        if (this.textLayer) {
                            if (hideTextLayer) {
                                this.textLayer.hide();
                                this.structTreeLayer?.hide();
                            } else if (redrawTextLayer) {
                                this.#renderTextLayer();
                            }
                        }
                    }

                    get width() {
                        return this.viewport.width;
                    }

                    get height() {
                        return this.viewport.height;
                    }

                    getPagePoint(x, y) {
                        return this.viewport.convertToPdfPoint(x, y);
                    }

                    async #finishRenderTask(renderTask, error = null) {
                        if (renderTask === this.renderTask) {
                            this.renderTask = null;
                        }
                        if (error instanceof _pdfjsLib.RenderingCancelledException) {
                            this.#renderError = null;
                            return;
                        }
                        this.#renderError = error;
                        this.renderingState = _ui_utils.RenderingStates.FINISHED;
                        this._resetZoomLayer(true);
                        this.#useThumbnailCanvas.regularAnnotations = !renderTask.separateAnnots;
                        this.eventBus.dispatch("pagerendered", {
                            source: this,
                            pageNumber: this.id,
                            cssTransform: false,
                            timestamp: performance.now(),
                            error: this.#renderError
                        });
                        if (error) {
                            throw error;
                        }
                    }

                    async draw() {
                        if (this.renderingState !== _ui_utils.RenderingStates.INITIAL) {
                            console.error("Must be in new state before drawing");
                            this.reset();
                        }
                        const {
                            div,
                            l10n,
                            pageColors,
                            pdfPage,
                            viewport
                        } = this;
                        if (!pdfPage) {
                            this.renderingState = _ui_utils.RenderingStates.FINISHED;
                            throw new Error("pdfPage is not loaded");
                        }
                        this.renderingState = _ui_utils.RenderingStates.RUNNING;
                        const canvasWrapper = document.createElement("div");
                        canvasWrapper.classList.add("canvasWrapper");
                        div.append(canvasWrapper);
                        if (!this.textLayer && this.#textLayerMode !== _ui_utils.TextLayerMode.DISABLE && !pdfPage.isPureXfa) {
                            this._accessibilityManager ||= new _text_accessibility.TextAccessibilityManager();
                            this.textLayer = new _text_layer_builder.TextLayerBuilder({
                                highlighter: this._textHighlighter,
                                accessibilityManager: this._accessibilityManager,
                                isOffscreenCanvasSupported: this.isOffscreenCanvasSupported,
                                enablePermissions: this.#textLayerMode === _ui_utils.TextLayerMode.ENABLE_PERMISSIONS
                            });
                            div.append(this.textLayer.div);
                        }
                        if (!this.annotationLayer && this.#annotationMode !== _pdfjsLib.AnnotationMode.DISABLE) {
                            const {
                                annotationStorage,
                                downloadManager,
                                enableScripting,
                                fieldObjectsPromise,
                                hasJSActionsPromise,
                                linkService
                            } = this.#layerProperties();
                            this._annotationCanvasMap ||= new Map();
                            this.annotationLayer = new _annotation_layer_builder.AnnotationLayerBuilder({
                                pageDiv: div,
                                pdfPage,
                                annotationStorage,
                                imageResourcesPath: this.imageResourcesPath,
                                renderForms: this.#annotationMode === _pdfjsLib.AnnotationMode.ENABLE_FORMS,
                                linkService,
                                downloadManager,
                                l10n,
                                enableScripting,
                                hasJSActionsPromise,
                                fieldObjectsPromise,
                                annotationCanvasMap: this._annotationCanvasMap,
                                accessibilityManager: this._accessibilityManager
                            });
                        }
                        const renderContinueCallback = cont => {
                            showCanvas?.(false);
                            if (this.renderingQueue && !this.renderingQueue.isHighestPriority(this)) {
                                this.renderingState = _ui_utils.RenderingStates.PAUSED;
                                this.resume = () => {
                                    this.renderingState = _ui_utils.RenderingStates.RUNNING;
                                    cont();
                                };
                                return;
                            }
                            cont();
                        };
                        const {
                            width,
                            height
                        } = viewport;
                        const canvas = document.createElement("canvas");
                        canvas.setAttribute("role", "presentation");
                        canvas.hidden = true;
                        const hasHCM = !!(pageColors?.background && pageColors?.foreground);
                        let showCanvas = isLastShow => {
                            if (!hasHCM || isLastShow) {
                                canvas.hidden = false;
                                showCanvas = null;
                            }
                        };
                        canvasWrapper.append(canvas);
                        this.canvas = canvas;
                        const ctx = canvas.getContext("2d", {
                            alpha: false
                        });
                        const outputScale = this.outputScale = new _ui_utils.OutputScale();
                        if (this.maxCanvasPixels === 0) {
                            const invScale = 1 / this.scale;
                            outputScale.sx *= invScale;
                            outputScale.sy *= invScale;
                            this.#hasRestrictedScaling = true;
                        } else if (this.maxCanvasPixels > 0) {
                            const pixelsInViewport = width * height;
                            const maxScale = Math.sqrt(this.maxCanvasPixels / pixelsInViewport);
                            if (outputScale.sx > maxScale || outputScale.sy > maxScale) {
                                outputScale.sx = maxScale;
                                outputScale.sy = maxScale;
                                this.#hasRestrictedScaling = true;
                            } else {
                                this.#hasRestrictedScaling = false;
                            }
                        }
                        const sfx = (0, _ui_utils.approximateFraction)(outputScale.sx);
                        const sfy = (0, _ui_utils.approximateFraction)(outputScale.sy);
                        canvas.width = (0, _ui_utils.roundToDivide)(width * outputScale.sx, sfx[0]);
                        canvas.height = (0, _ui_utils.roundToDivide)(height * outputScale.sy, sfy[0]);
                        const {
                            style
                        } = canvas;
                        style.width = (0, _ui_utils.roundToDivide)(width, sfx[1]) + "px";
                        style.height = (0, _ui_utils.roundToDivide)(height, sfy[1]) + "px";
                        this.#viewportMap.set(canvas, viewport);
                        const transform = outputScale.scaled ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0] : null;
                        const renderContext = {
                            canvasContext: ctx,
                            transform,
                            viewport,
                            annotationMode: this.#annotationMode,
                            optionalContentConfigPromise: this._optionalContentConfigPromise,
                            annotationCanvasMap: this._annotationCanvasMap,
                            pageColors
                        };
                        const renderTask = this.renderTask = this.pdfPage.render(renderContext);
                        renderTask.onContinue = renderContinueCallback;
                        const resultPromise = renderTask.promise.then(async () => {
                            showCanvas?.(true);
                            await this.#finishRenderTask(renderTask);
                            this.#renderTextLayer();
                            if (this.annotationLayer) {
                                await this.#renderAnnotationLayer();
                            }
                            if (!this.annotationEditorLayer) {
                                const {
                                    annotationEditorUIManager
                                } = this.#layerProperties();
                                if (!annotationEditorUIManager) {
                                    return;
                                }
                                this.annotationEditorLayer = new _annotation_editor_layer_builder.AnnotationEditorLayerBuilder({
                                    uiManager: annotationEditorUIManager,
                                    pageDiv: div,
                                    pdfPage,
                                    l10n,
                                    accessibilityManager: this._accessibilityManager,
                                    annotationLayer: this.annotationLayer?.annotationLayer
                                });
                            }
                            this.#renderAnnotationEditorLayer();
                        }, error => {
                            if (!(error instanceof _pdfjsLib.RenderingCancelledException)) {
                                showCanvas?.(true);
                            }
                            return this.#finishRenderTask(renderTask, error);
                        });
                        if (pdfPage.isPureXfa) {
                            if (!this.xfaLayer) {
                                const {
                                    annotationStorage,
                                    linkService
                                } = this.#layerProperties();
                                this.xfaLayer = new _xfa_layer_builder.XfaLayerBuilder({
                                    pageDiv: div,
                                    pdfPage,
                                    annotationStorage,
                                    linkService
                                });
                            } else if (this.xfaLayer.div) {
                                div.append(this.xfaLayer.div);
                            }
                            this.#renderXfaLayer();
                        }
                        div.setAttribute("data-loaded", true);
                        this.eventBus.dispatch("pagerender", {
                            source: this,
                            pageNumber: this.id
                        });
                        return resultPromise;
                    }

                    setPageLabel(label) {
                        this.pageLabel = typeof label === "string" ? label : null;
                        if (this.pageLabel !== null) {
                            this.div.setAttribute("data-page-label", this.pageLabel);
                        } else {
                            this.div.removeAttribute("data-page-label");
                        }
                    }

                    get thumbnailCanvas() {
                        const {
                            directDrawing,
                            initialOptionalContent,
                            regularAnnotations
                        } = this.#useThumbnailCanvas;
                        return directDrawing && initialOptionalContent && regularAnnotations ? this.canvas : null;
                    }
                }

                exports.PDFPageView = PDFPageView;

                /***/
            }),
            /* 14 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.AnnotationEditorLayerBuilder = void 0;
                var _pdfjsLib = __w_pdfjs_require__(4);
                var _l10n_utils = __w_pdfjs_require__(7);

                class AnnotationEditorLayerBuilder {
                    #annotationLayer = null;
                    #uiManager;

                    constructor(options) {
                        this.pageDiv = options.pageDiv;
                        this.pdfPage = options.pdfPage;
                        this.accessibilityManager = options.accessibilityManager;
                        this.l10n = options.l10n || _l10n_utils.NullL10n;
                        this.annotationEditorLayer = null;
                        this.div = null;
                        this._cancelled = false;
                        this.#uiManager = options.uiManager;
                        this.#annotationLayer = options.annotationLayer || null;
                    }

                    async render(viewport, intent = "display") {
                        if (intent !== "display") {
                            return;
                        }
                        if (this._cancelled) {
                            return;
                        }
                        const clonedViewport = viewport.clone({
                            dontFlip: true
                        });
                        if (this.div) {
                            this.annotationEditorLayer.update({
                                viewport: clonedViewport
                            });
                            this.show();
                            return;
                        }
                        const div = this.div = document.createElement("div");
                        div.className = "annotationEditorLayer";
                        div.tabIndex = 0;
                        div.hidden = true;
                        div.dir = this.#uiManager.direction;
                        this.pageDiv.append(div);
                        this.annotationEditorLayer = new _pdfjsLib.AnnotationEditorLayer({
                            uiManager: this.#uiManager,
                            div,
                            accessibilityManager: this.accessibilityManager,
                            pageIndex: this.pdfPage.pageNumber - 1,
                            l10n: this.l10n,
                            viewport: clonedViewport,
                            annotationLayer: this.#annotationLayer
                        });
                        const parameters = {
                            viewport: clonedViewport,
                            div,
                            annotations: null,
                            intent
                        };
                        this.annotationEditorLayer.render(parameters);
                        this.show();
                    }

                    cancel() {
                        this._cancelled = true;
                        if (!this.div) {
                            return;
                        }
                        this.pageDiv = null;
                        this.annotationEditorLayer.destroy();
                        this.div.remove();
                    }

                    hide() {
                        if (!this.div) {
                            return;
                        }
                        this.div.hidden = true;
                    }

                    show() {
                        if (!this.div || this.annotationEditorLayer.isEmpty) {
                            return;
                        }
                        this.div.hidden = false;
                    }
                }

                exports.AnnotationEditorLayerBuilder = AnnotationEditorLayerBuilder;

                /***/
            }),
            /* 15 */
            /***/ ((__unused_webpack_module, exports) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.compatibilityParams = exports.OptionKind = exports.AppOptions = void 0;
                const compatibilityParams = Object.create(null);
                exports.compatibilityParams = compatibilityParams;
                {
                    const userAgent = navigator.userAgent || "";
                    const platform = navigator.platform || "";
                    const maxTouchPoints = navigator.maxTouchPoints || 1;
                    const isAndroid = /Android/.test(userAgent);
                    const isIOS = /\b(iPad|iPhone|iPod)(?=;)/.test(userAgent) || platform === "MacIntel" && maxTouchPoints > 1;
                    (function checkCanvasSizeLimitation() {
                        if (isIOS || isAndroid) {
                            compatibilityParams.maxCanvasPixels = 5242880;
                        }
                    })();
                }
                const OptionKind = {
                    VIEWER: 0x02,
                    API: 0x04,
                    WORKER: 0x08,
                    PREFERENCE: 0x80
                };
                exports.OptionKind = OptionKind;
                const defaultOptions = {
                    annotationEditorMode: {
                        value: 0,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    annotationMode: {
                        value: 2,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    cursorToolOnLoad: {
                        value: 0,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    defaultZoomDelay: {
                        value: 400,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    defaultZoomValue: {
                        value: "",
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    disableHistory: {
                        value: false,
                        kind: OptionKind.VIEWER
                    },
                    disablePageLabels: {
                        value: false,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    enablePermissions: {
                        value: false,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    enablePrintAutoRotate: {
                        value: true,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    enableScripting: {
                        value: true,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    enableStampEditor: {
                        value: true,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    externalLinkRel: {
                        value: "noopener noreferrer nofollow",
                        kind: OptionKind.VIEWER
                    },
                    externalLinkTarget: {
                        value: 0,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    historyUpdateUrl: {
                        value: false,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    ignoreDestinationZoom: {
                        value: false,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    imageResourcesPath: {
                        value: "./images/",
                        kind: OptionKind.VIEWER
                    },
                    maxCanvasPixels: {
                        value: 16777216,
                        kind: OptionKind.VIEWER
                    },
                    forcePageColors: {
                        value: false,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    pageColorsBackground: {
                        value: "Canvas",
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    pageColorsForeground: {
                        value: "CanvasText",
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    pdfBugEnabled: {
                        value: false,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    printResolution: {
                        value: 150,
                        kind: OptionKind.VIEWER
                    },
                    sidebarViewOnLoad: {
                        value: -1,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    scrollModeOnLoad: {
                        value: -1,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    spreadModeOnLoad: {
                        value: -1,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    textLayerMode: {
                        value: 1,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    viewerCssTheme: {
                        value: 0,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    viewOnLoad: {
                        value: 0,
                        kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                    },
                    cMapPacked: {
                        value: true,
                        kind: OptionKind.API
                    },
                    cMapUrl: {
                        value: "../web/cmaps/",
                        kind: OptionKind.API
                    },
                    disableAutoFetch: {
                        value: false,
                        kind: OptionKind.API + OptionKind.PREFERENCE
                    },
                    disableFontFace: {
                        value: false,
                        kind: OptionKind.API + OptionKind.PREFERENCE
                    },
                    disableRange: {
                        value: false,
                        kind: OptionKind.API + OptionKind.PREFERENCE
                    },
                    disableStream: {
                        value: false,
                        kind: OptionKind.API + OptionKind.PREFERENCE
                    },
                    docBaseUrl: {
                        value: "",
                        kind: OptionKind.API
                    },
                    enableXfa: {
                        value: true,
                        kind: OptionKind.API + OptionKind.PREFERENCE
                    },
                    fontExtraProperties: {
                        value: false,
                        kind: OptionKind.API
                    },
                    isEvalSupported: {
                        value: true,
                        kind: OptionKind.API
                    },
                    isOffscreenCanvasSupported: {
                        value: true,
                        kind: OptionKind.API
                    },
                    maxImageSize: {
                        value: -1,
                        kind: OptionKind.API
                    },
                    pdfBug: {
                        value: false,
                        kind: OptionKind.API
                    },
                    standardFontDataUrl: {
                        value: "../web/standard_fonts/",
                        kind: OptionKind.API
                    },
                    verbosity: {
                        value: 1,
                        kind: OptionKind.API
                    },
                    workerPort: {
                        value: null,
                        kind: OptionKind.WORKER
                    },
                    workerSrc: {
                        value: "../build/pdf.worker.js",
                        kind: OptionKind.WORKER
                    }
                };
                {
                    defaultOptions.defaultUrl = {
                        value: "compressed.tracemonkey-pldi-09.pdf",
                        kind: OptionKind.VIEWER
                    };
                    defaultOptions.disablePreferences = {
                        value: false,
                        kind: OptionKind.VIEWER
                    };
                    defaultOptions.locale = {
                        value: navigator.language || "en-US",
                        kind: OptionKind.VIEWER
                    };
                    defaultOptions.sandboxBundleSrc = {
                        value: "../build/pdf.sandbox.js",
                        kind: OptionKind.VIEWER
                    };
                }
                const userOptions = Object.create(null);

                class AppOptions {
                    constructor() {
                        throw new Error("Cannot initialize AppOptions.");
                    }

                    static get(name) {
                        const userOption = userOptions[name];
                        if (userOption !== undefined) {
                            return userOption;
                        }
                        const defaultOption = defaultOptions[name];
                        if (defaultOption !== undefined) {
                            return compatibilityParams[name] ?? defaultOption.value;
                        }
                        return undefined;
                    }

                    static getAll(kind = null) {
                        const options = Object.create(null);
                        for (const name in defaultOptions) {
                            const defaultOption = defaultOptions[name];
                            if (kind) {
                                if ((kind & defaultOption.kind) === 0) {
                                    continue;
                                }
                                if (kind === OptionKind.PREFERENCE) {
                                    const value = defaultOption.value,
                                        valueType = typeof value;
                                    if (valueType === "boolean" || valueType === "string" || valueType === "number" && Number.isInteger(value)) {
                                        options[name] = value;
                                        continue;
                                    }
                                    throw new Error(`Invalid type for preference: ${name}`);
                                }
                            }
                            const userOption = userOptions[name];
                            options[name] = userOption !== undefined ? userOption : compatibilityParams[name] ?? defaultOption.value;
                        }
                        return options;
                    }

                    static set(name, value) {
                        userOptions[name] = value;
                    }

                    static setAll(options) {
                        for (const name in options) {
                            userOptions[name] = options[name];
                        }
                    }

                    static remove(name) {
                        delete userOptions[name];
                    }
                }

                exports.AppOptions = AppOptions;
                {
                    AppOptions._hasUserOptions = function () {
                        return Object.keys(userOptions).length > 0;
                    };
                }

                /***/
            }),
            /* 16 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.StructTreeLayerBuilder = void 0;
                var _ui_utils = __w_pdfjs_require__(2);
                const PDF_ROLE_TO_HTML_ROLE = {
                    Document: null,
                    DocumentFragment: null,
                    Part: "group",
                    Sect: "group",
                    Div: "group",
                    Aside: "note",
                    NonStruct: "none",
                    P: null,
                    H: "heading",
                    Title: null,
                    FENote: "note",
                    Sub: "group",
                    Lbl: null,
                    Span: null,
                    Em: null,
                    Strong: null,
                    Link: "link",
                    Annot: "note",
                    Form: "form",
                    Ruby: null,
                    RB: null,
                    RT: null,
                    RP: null,
                    Warichu: null,
                    WT: null,
                    WP: null,
                    L: "list",
                    LI: "listitem",
                    LBody: null,
                    Table: "table",
                    TR: "row",
                    TH: "columnheader",
                    TD: "cell",
                    THead: "columnheader",
                    TBody: null,
                    TFoot: null,
                    Caption: null,
                    Figure: "figure",
                    Formula: null,
                    Artifact: null
                };
                const HEADING_PATTERN = /^H(\d+)$/;

                class StructTreeLayerBuilder {
                    #treeDom = undefined;

                    get renderingDone() {
                        return this.#treeDom !== undefined;
                    }

                    render(structTree) {
                        if (this.#treeDom !== undefined) {
                            return this.#treeDom;
                        }
                        const treeDom = this.#walk(structTree);
                        treeDom?.classList.add("structTree");
                        return this.#treeDom = treeDom;
                    }

                    hide() {
                        if (this.#treeDom && !this.#treeDom.hidden) {
                            this.#treeDom.hidden = true;
                        }
                    }

                    show() {
                        if (this.#treeDom?.hidden) {
                            this.#treeDom.hidden = false;
                        }
                    }

                    #setAttributes(structElement, htmlElement) {
                        const {
                            alt,
                            id,
                            lang
                        } = structElement;
                        if (alt !== undefined) {
                            htmlElement.setAttribute("aria-label", (0, _ui_utils.removeNullCharacters)(alt));
                        }
                        if (id !== undefined) {
                            htmlElement.setAttribute("aria-owns", id);
                        }
                        if (lang !== undefined) {
                            htmlElement.setAttribute("lang", (0, _ui_utils.removeNullCharacters)(lang, true));
                        }
                    }

                    #walk(node) {
                        if (!node) {
                            return null;
                        }
                        const element = document.createElement("span");
                        if ("role" in node) {
                            const {
                                role
                            } = node;
                            const match = role.match(HEADING_PATTERN);
                            if (match) {
                                element.setAttribute("role", "heading");
                                element.setAttribute("aria-level", match[1]);
                            } else if (PDF_ROLE_TO_HTML_ROLE[role]) {
                                element.setAttribute("role", PDF_ROLE_TO_HTML_ROLE[role]);
                            }
                        }
                        this.#setAttributes(node, element);
                        if (node.children) {
                            if (node.children.length === 1 && "id" in node.children[0]) {
                                this.#setAttributes(node.children[0], element);
                            } else {
                                for (const kid of node.children) {
                                    element.append(this.#walk(kid));
                                }
                            }
                        }
                        return element;
                    }
                }

                exports.StructTreeLayerBuilder = StructTreeLayerBuilder;

                /***/
            }),
            /* 17 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.TextAccessibilityManager = void 0;
                var _ui_utils = __w_pdfjs_require__(2);

                class TextAccessibilityManager {
                    #enabled = false;
                    #textChildren = null;
                    #textNodes = new Map();
                    #waitingElements = new Map();

                    setTextMapping(textDivs) {
                        this.#textChildren = textDivs;
                    }

                    static #compareElementPositions(e1, e2) {
                        const rect1 = e1.getBoundingClientRect();
                        const rect2 = e2.getBoundingClientRect();
                        if (rect1.width === 0 && rect1.height === 0) {
                            return +1;
                        }
                        if (rect2.width === 0 && rect2.height === 0) {
                            return -1;
                        }
                        const top1 = rect1.y;
                        const bot1 = rect1.y + rect1.height;
                        const mid1 = rect1.y + rect1.height / 2;
                        const top2 = rect2.y;
                        const bot2 = rect2.y + rect2.height;
                        const mid2 = rect2.y + rect2.height / 2;
                        if (mid1 <= top2 && mid2 >= bot1) {
                            return -1;
                        }
                        if (mid2 <= top1 && mid1 >= bot2) {
                            return +1;
                        }
                        const centerX1 = rect1.x + rect1.width / 2;
                        const centerX2 = rect2.x + rect2.width / 2;
                        return centerX1 - centerX2;
                    }

                    enable() {
                        if (this.#enabled) {
                            throw new Error("TextAccessibilityManager is already enabled.");
                        }
                        if (!this.#textChildren) {
                            throw new Error("Text divs and strings have not been set.");
                        }
                        this.#enabled = true;
                        this.#textChildren = this.#textChildren.slice();
                        this.#textChildren.sort(TextAccessibilityManager.#compareElementPositions);
                        if (this.#textNodes.size > 0) {
                            const textChildren = this.#textChildren;
                            for (const [id, nodeIndex] of this.#textNodes) {
                                const element = document.getElementById(id);
                                if (!element) {
                                    this.#textNodes.delete(id);
                                    continue;
                                }
                                this.#addIdToAriaOwns(id, textChildren[nodeIndex]);
                            }
                        }
                        for (const [element, isRemovable] of this.#waitingElements) {
                            this.addPointerInTextLayer(element, isRemovable);
                        }
                        this.#waitingElements.clear();
                    }

                    disable() {
                        if (!this.#enabled) {
                            return;
                        }
                        this.#waitingElements.clear();
                        this.#textChildren = null;
                        this.#enabled = false;
                    }

                    removePointerInTextLayer(element) {
                        if (!this.#enabled) {
                            this.#waitingElements.delete(element);
                            return;
                        }
                        const children = this.#textChildren;
                        if (!children || children.length === 0) {
                            return;
                        }
                        const {
                            id
                        } = element;
                        const nodeIndex = this.#textNodes.get(id);
                        if (nodeIndex === undefined) {
                            return;
                        }
                        const node = children[nodeIndex];
                        this.#textNodes.delete(id);
                        let owns = node.getAttribute("aria-owns");
                        if (owns?.includes(id)) {
                            owns = owns.split(" ").filter(x => x !== id).join(" ");
                            if (owns) {
                                node.setAttribute("aria-owns", owns);
                            } else {
                                node.removeAttribute("aria-owns");
                                node.setAttribute("role", "presentation");
                            }
                        }
                    }

                    #addIdToAriaOwns(id, node) {
                        const owns = node.getAttribute("aria-owns");
                        if (!owns?.includes(id)) {
                            node.setAttribute("aria-owns", owns ? `${owns} ${id}` : id);
                        }
                        node.removeAttribute("role");
                    }

                    addPointerInTextLayer(element, isRemovable) {
                        const {
                            id
                        } = element;
                        if (!id) {
                            return null;
                        }
                        if (!this.#enabled) {
                            this.#waitingElements.set(element, isRemovable);
                            return null;
                        }
                        if (isRemovable) {
                            this.removePointerInTextLayer(element);
                        }
                        const children = this.#textChildren;
                        if (!children || children.length === 0) {
                            return null;
                        }
                        const index = (0, _ui_utils.binarySearchFirstItem)(children, node => TextAccessibilityManager.#compareElementPositions(element, node) < 0);
                        const nodeIndex = Math.max(0, index - 1);
                        const child = children[nodeIndex];
                        this.#addIdToAriaOwns(id, child);
                        this.#textNodes.set(id, nodeIndex);
                        const parent = child.parentNode;
                        return parent?.classList.contains("markedContent") ? parent.id : null;
                    }

                    moveElementInDOM(container, element, contentElement, isRemovable) {
                        const id = this.addPointerInTextLayer(contentElement, isRemovable);
                        if (!container.hasChildNodes()) {
                            container.append(element);
                            return id;
                        }
                        const children = Array.from(container.childNodes).filter(node => node !== element);
                        if (children.length === 0) {
                            return id;
                        }
                        const elementToCompare = contentElement || element;
                        const index = (0, _ui_utils.binarySearchFirstItem)(children, node => TextAccessibilityManager.#compareElementPositions(elementToCompare, node) < 0);
                        if (index === 0) {
                            children[0].before(element);
                        } else {
                            children[index - 1].after(element);
                        }
                        return id;
                    }
                }

                exports.TextAccessibilityManager = TextAccessibilityManager;

                /***/
            }),
            /* 18 */
            /***/ ((__unused_webpack_module, exports) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.TextHighlighter = void 0;

                class TextHighlighter {
                    constructor({
                                    findController,
                                    eventBus,
                                    pageIndex
                                }) {
                        this.findController = findController;
                        this.matches = [];
                        this.eventBus = eventBus;
                        this.pageIdx = pageIndex;
                        this._onUpdateTextLayerMatches = null;
                        this.textDivs = null;
                        this.textContentItemsStr = null;
                        this.enabled = false;
                    }

                    setTextMapping(divs, texts) {
                        this.textDivs = divs;
                        this.textContentItemsStr = texts;
                    }

                    enable() {
                        if (!this.textDivs || !this.textContentItemsStr) {
                            throw new Error("Text divs and strings have not been set.");
                        }
                        if (this.enabled) {
                            throw new Error("TextHighlighter is already enabled.");
                        }
                        this.enabled = true;
                        if (!this._onUpdateTextLayerMatches) {
                            this._onUpdateTextLayerMatches = evt => {
                                if (evt.pageIndex === this.pageIdx || evt.pageIndex === -1) {
                                    this._updateMatches();
                                }
                            };
                            this.eventBus._on("updatetextlayermatches", this._onUpdateTextLayerMatches);
                        }
                        this._updateMatches();
                    }

                    disable() {
                        if (!this.enabled) {
                            return;
                        }
                        this.enabled = false;
                        if (this._onUpdateTextLayerMatches) {
                            this.eventBus._off("updatetextlayermatches", this._onUpdateTextLayerMatches);
                            this._onUpdateTextLayerMatches = null;
                        }
                        this._updateMatches(true);
                    }

                    _convertMatches(matches, matchesLength) {
                        if (!matches) {
                            return [];
                        }
                        const {
                            textContentItemsStr
                        } = this;
                        let i = 0,
                            iIndex = 0;
                        const end = textContentItemsStr.length - 1;
                        const result = [];
                        for (let m = 0, mm = matches.length; m < mm; m++) {
                            let matchIdx = matches[m];
                            while (i !== end && matchIdx >= iIndex + textContentItemsStr[i].length) {
                                iIndex += textContentItemsStr[i].length;
                                i++;
                            }
                            if (i === textContentItemsStr.length) {
                                console.error("Could not find a matching mapping");
                            }
                            const match = {
                                begin: {
                                    divIdx: i,
                                    offset: matchIdx - iIndex
                                }
                            };
                            matchIdx += matchesLength[m];
                            while (i !== end && matchIdx > iIndex + textContentItemsStr[i].length) {
                                iIndex += textContentItemsStr[i].length;
                                i++;
                            }
                            match.end = {
                                divIdx: i,
                                offset: matchIdx - iIndex
                            };
                            result.push(match);
                        }
                        return result;
                    }

                    _renderMatches(matches) {
                        if (matches.length === 0) {
                            return;
                        }
                        const {
                            findController,
                            pageIdx
                        } = this;
                        const {
                            textContentItemsStr,
                            textDivs
                        } = this;
                        const isSelectedPage = pageIdx === findController.selected.pageIdx;
                        const selectedMatchIdx = findController.selected.matchIdx;
                        const highlightAll = findController.state.highlightAll;
                        let prevEnd = null;
                        const infinity = {
                            divIdx: -1,
                            offset: undefined
                        };

                        function beginText(begin, className) {
                            const divIdx = begin.divIdx;
                            textDivs[divIdx].textContent = "";
                            return appendTextToDiv(divIdx, 0, begin.offset, className);
                        }

                        function appendTextToDiv(divIdx, fromOffset, toOffset, className) {
                            let div = textDivs[divIdx];
                            if (div.nodeType === Node.TEXT_NODE) {
                                const span = document.createElement("span");
                                div.before(span);
                                span.append(div);
                                textDivs[divIdx] = span;
                                div = span;
                            }
                            const content = textContentItemsStr[divIdx].substring(fromOffset, toOffset);
                            const node = document.createTextNode(content);
                            if (className) {
                                const span = document.createElement("span");
                                span.className = `${className} appended`;
                                span.append(node);
                                div.append(span);
                                return className.includes("selected") ? span.offsetLeft : 0;
                            }
                            div.append(node);
                            return 0;
                        }

                        let i0 = selectedMatchIdx,
                            i1 = i0 + 1;
                        if (highlightAll) {
                            i0 = 0;
                            i1 = matches.length;
                        } else if (!isSelectedPage) {
                            return;
                        }
                        let lastDivIdx = -1;
                        let lastOffset = -1;
                        for (let i = i0; i < i1; i++) {
                            const match = matches[i];
                            const begin = match.begin;
                            if (begin.divIdx === lastDivIdx && begin.offset === lastOffset) {
                                continue;
                            }
                            lastDivIdx = begin.divIdx;
                            lastOffset = begin.offset;
                            const end = match.end;
                            const isSelected = isSelectedPage && i === selectedMatchIdx;
                            const highlightSuffix = isSelected ? " selected" : "";
                            let selectedLeft = 0;
                            if (!prevEnd || begin.divIdx !== prevEnd.divIdx) {
                                if (prevEnd !== null) {
                                    appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
                                }
                                beginText(begin);
                            } else {
                                appendTextToDiv(prevEnd.divIdx, prevEnd.offset, begin.offset);
                            }
                            if (begin.divIdx === end.divIdx) {
                                selectedLeft = appendTextToDiv(begin.divIdx, begin.offset, end.offset, "highlight" + highlightSuffix);
                            } else {
                                selectedLeft = appendTextToDiv(begin.divIdx, begin.offset, infinity.offset, "highlight begin" + highlightSuffix);
                                for (let n0 = begin.divIdx + 1, n1 = end.divIdx; n0 < n1; n0++) {
                                    textDivs[n0].className = "highlight middle" + highlightSuffix;
                                }
                                beginText(end, "highlight end" + highlightSuffix);
                            }
                            prevEnd = end;
                            if (isSelected) {
                                findController.scrollMatchIntoView({
                                    element: textDivs[begin.divIdx],
                                    selectedLeft,
                                    pageIndex: pageIdx,
                                    matchIndex: selectedMatchIdx
                                });
                            }
                        }
                        if (prevEnd) {
                            appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
                        }
                    }

                    _updateMatches(reset = false) {
                        if (!this.enabled && !reset) {
                            return;
                        }
                        const {
                            findController,
                            matches,
                            pageIdx
                        } = this;
                        const {
                            textContentItemsStr,
                            textDivs
                        } = this;
                        let clearedUntilDivIdx = -1;
                        for (const match of matches) {
                            const begin = Math.max(clearedUntilDivIdx, match.begin.divIdx);
                            for (let n = begin, end = match.end.divIdx; n <= end; n++) {
                                const div = textDivs[n];
                                div.textContent = textContentItemsStr[n];
                                div.className = "";
                            }
                            clearedUntilDivIdx = match.end.divIdx + 1;
                        }
                        if (!findController?.highlightMatches || reset) {
                            return;
                        }
                        const pageMatches = findController.pageMatches[pageIdx] || null;
                        const pageMatchesLength = findController.pageMatchesLength[pageIdx] || null;
                        this.matches = this._convertMatches(pageMatches, pageMatchesLength);
                        this._renderMatches(this.matches);
                    }
                }

                exports.TextHighlighter = TextHighlighter;

                /***/
            }),
            /* 19 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.TextLayerBuilder = void 0;
                var _pdfjsLib = __w_pdfjs_require__(4);
                var _ui_utils = __w_pdfjs_require__(2);

                class TextLayerBuilder {
                    #enablePermissions = false;
                    #rotation = 0;
                    #scale = 0;
                    #textContentSource = null;

                    constructor({
                                    highlighter = null,
                                    accessibilityManager = null,
                                    isOffscreenCanvasSupported = true,
                                    enablePermissions = false
                                }) {
                        this.textContentItemsStr = [];
                        this.renderingDone = false;
                        this.textDivs = [];
                        this.textDivProperties = new WeakMap();
                        this.textLayerRenderTask = null;
                        this.highlighter = highlighter;
                        this.accessibilityManager = accessibilityManager;
                        this.isOffscreenCanvasSupported = isOffscreenCanvasSupported;
                        this.#enablePermissions = enablePermissions === true;
                        this.div = document.createElement("div");
                        this.div.className = "textLayer";
                        this.hide();
                    }

                    #finishRendering() {
                        this.renderingDone = true;
                        const endOfContent = document.createElement("div");
                        endOfContent.className = "endOfContent";
                        this.div.append(endOfContent);
                        this.#bindMouse();
                    }

                    get numTextDivs() {
                        return this.textDivs.length;
                    }

                    async render(viewport) {
                        if (!this.#textContentSource) {
                            throw new Error('No "textContentSource" parameter specified.');
                        }
                        const scale = viewport.scale * (globalThis.devicePixelRatio || 1);
                        const {
                            rotation
                        } = viewport;
                        if (this.renderingDone) {
                            const mustRotate = rotation !== this.#rotation;
                            const mustRescale = scale !== this.#scale;
                            if (mustRotate || mustRescale) {
                                this.hide();
                                (0, _pdfjsLib.updateTextLayer)({
                                    container: this.div,
                                    viewport,
                                    textDivs: this.textDivs,
                                    textDivProperties: this.textDivProperties,
                                    isOffscreenCanvasSupported: this.isOffscreenCanvasSupported,
                                    mustRescale,
                                    mustRotate
                                });
                                this.#scale = scale;
                                this.#rotation = rotation;
                            }
                            this.show();
                            return;
                        }
                        this.cancel();
                        this.highlighter?.setTextMapping(this.textDivs, this.textContentItemsStr);
                        this.accessibilityManager?.setTextMapping(this.textDivs);
                        this.textLayerRenderTask = (0, _pdfjsLib.renderTextLayer)({
                            textContentSource: this.#textContentSource,
                            container: this.div,
                            viewport,
                            textDivs: this.textDivs,
                            textDivProperties: this.textDivProperties,
                            textContentItemsStr: this.textContentItemsStr,
                            isOffscreenCanvasSupported: this.isOffscreenCanvasSupported
                        });
                        await this.textLayerRenderTask.promise;
                        this.#finishRendering();
                        this.#scale = scale;
                        this.#rotation = rotation;
                        this.show();
                        this.accessibilityManager?.enable();
                    }

                    hide() {
                        if (!this.div.hidden) {
                            this.highlighter?.disable();
                            this.div.hidden = true;
                        }
                    }

                    show() {
                        if (this.div.hidden && this.renderingDone) {
                            this.div.hidden = false;
                            this.highlighter?.enable();
                        }
                    }

                    cancel() {
                        if (this.textLayerRenderTask) {
                            this.textLayerRenderTask.cancel();
                            this.textLayerRenderTask = null;
                        }
                        this.highlighter?.disable();
                        this.accessibilityManager?.disable();
                        this.textContentItemsStr.length = 0;
                        this.textDivs.length = 0;
                        this.textDivProperties = new WeakMap();
                    }

                    setTextContentSource(source) {
                        this.cancel();
                        this.#textContentSource = source;
                    }

                    #bindMouse() {
                        const {
                            div
                        } = this;
                        div.addEventListener("mousedown", evt => {
                            const end = div.querySelector(".endOfContent");
                            if (!end) {
                                return;
                            }
                            let adjustTop = evt.target !== div;
                            adjustTop &&= getComputedStyle(end).getPropertyValue("-moz-user-select") !== "none";
                            if (adjustTop) {
                                const divBounds = div.getBoundingClientRect();
                                const r = Math.max(0, (evt.pageY - divBounds.top) / divBounds.height);
                                end.style.top = (r * 100).toFixed(2) + "%";
                            }
                            end.classList.add("active");
                        });
                        div.addEventListener("mouseup", () => {
                            const end = div.querySelector(".endOfContent");
                            if (!end) {
                                return;
                            }
                            end.style.top = "";
                            end.classList.remove("active");
                        });
                        div.addEventListener("copy", event => {
                            if (!this.#enablePermissions) {
                                const selection = document.getSelection();
                                event.clipboardData.setData("text/plain", (0, _ui_utils.removeNullCharacters)((0, _pdfjsLib.normalizeUnicode)(selection.toString())));
                            }
                            event.preventDefault();
                            event.stopPropagation();
                        });
                    }
                }

                exports.TextLayerBuilder = TextLayerBuilder;

                /***/
            }),
            /* 20 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.XfaLayerBuilder = void 0;
                var _pdfjsLib = __w_pdfjs_require__(4);

                class XfaLayerBuilder {
                    constructor({
                                    pageDiv,
                                    pdfPage,
                                    annotationStorage = null,
                                    linkService,
                                    xfaHtml = null
                                }) {
                        this.pageDiv = pageDiv;
                        this.pdfPage = pdfPage;
                        this.annotationStorage = annotationStorage;
                        this.linkService = linkService;
                        this.xfaHtml = xfaHtml;
                        this.div = null;
                        this._cancelled = false;
                    }

                    async render(viewport, intent = "display") {
                        if (intent === "print") {
                            const parameters = {
                                viewport: viewport.clone({
                                    dontFlip: true
                                }),
                                div: this.div,
                                xfaHtml: this.xfaHtml,
                                annotationStorage: this.annotationStorage,
                                linkService: this.linkService,
                                intent
                            };
                            const div = document.createElement("div");
                            this.pageDiv.append(div);
                            parameters.div = div;
                            return _pdfjsLib.XfaLayer.render(parameters);
                        }
                        const xfaHtml = await this.pdfPage.getXfa();
                        if (this._cancelled || !xfaHtml) {
                            return {
                                textDivs: []
                            };
                        }
                        const parameters = {
                            viewport: viewport.clone({
                                dontFlip: true
                            }),
                            div: this.div,
                            xfaHtml,
                            annotationStorage: this.annotationStorage,
                            linkService: this.linkService,
                            intent
                        };
                        if (this.div) {
                            return _pdfjsLib.XfaLayer.update(parameters);
                        }
                        this.div = document.createElement("div");
                        this.pageDiv.append(this.div);
                        parameters.div = this.div;
                        return _pdfjsLib.XfaLayer.render(parameters);
                    }

                    cancel() {
                        this._cancelled = true;
                    }

                    hide() {
                        if (!this.div) {
                            return;
                        }
                        this.div.hidden = true;
                    }
                }

                exports.XfaLayerBuilder = XfaLayerBuilder;

                /***/
            }),
            /* 21 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.PDFScriptingManager = void 0;
                var _generic_scripting = __w_pdfjs_require__(22);
                var _pdf_scripting_manager = __w_pdfjs_require__(23);

                class PDFScriptingManagerComponents extends _pdf_scripting_manager.PDFScriptingManager {
                    constructor(options) {
                        if (!options.externalServices) {
                            window.addEventListener("updatefromsandbox", event => {
                                options.eventBus.dispatch("updatefromsandbox", {
                                    source: window,
                                    detail: event.detail
                                });
                            });
                        }
                        options.externalServices ||= {
                            createScripting: ({
                                                  sandboxBundleSrc
                                              }) => {
                                return new _generic_scripting.GenericScripting(sandboxBundleSrc);
                            }
                        };
                        options.docProperties ||= pdfDocument => {
                            return (0, _generic_scripting.docProperties)(pdfDocument);
                        };
                        super(options);
                    }
                }

                exports.PDFScriptingManager = PDFScriptingManagerComponents;

                /***/
            }),
            /* 22 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.GenericScripting = void 0;
                exports.docProperties = docProperties;
                var _pdfjsLib = __w_pdfjs_require__(4);

                async function docProperties(pdfDocument) {
                    const url = "",
                        baseUrl = url.split("#")[0];
                    let {
                        info,
                        metadata,
                        contentDispositionFilename,
                        contentLength
                    } = await pdfDocument.getMetadata();
                    if (!contentLength) {
                        const {
                            length
                        } = await pdfDocument.getDownloadInfo();
                        contentLength = length;
                    }
                    return {
                        ...info,
                        baseURL: baseUrl,
                        filesize: contentLength,
                        filename: contentDispositionFilename || (0, _pdfjsLib.getPdfFilenameFromUrl)(url),
                        metadata: metadata?.getRaw(),
                        authors: metadata?.get("dc:creator"),
                        numPages: pdfDocument.numPages,
                        URL: url
                    };
                }

                class GenericScripting {
                    constructor(sandboxBundleSrc) {
                        this._ready = (0, _pdfjsLib.loadScript)(sandboxBundleSrc, true).then(() => {
                            return window.pdfjsSandbox.QuickJSSandbox();
                        });
                    }

                    async createSandbox(data) {
                        const sandbox = await this._ready;
                        sandbox.create(data);
                    }

                    async dispatchEventInSandbox(event) {
                        const sandbox = await this._ready;
                        setTimeout(() => sandbox.dispatchEvent(event), 0);
                    }

                    async destroySandbox() {
                        const sandbox = await this._ready;
                        sandbox.nukeSandbox();
                    }
                }

                exports.GenericScripting = GenericScripting;

                /***/
            }),
            /* 23 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.PDFScriptingManager = void 0;
                var _ui_utils = __w_pdfjs_require__(2);
                var _pdfjsLib = __w_pdfjs_require__(4);

                class PDFScriptingManager {
                    #closeCapability = null;
                    #destroyCapability = null;
                    #docProperties = null;
                    #eventBus = null;
                    #externalServices = null;
                    #pdfDocument = null;
                    #pdfViewer = null;
                    #ready = false;
                    #sandboxBundleSrc = null;
                    #scripting = null;
                    #willPrintCapability = null;

                    constructor({
                                    eventBus,
                                    sandboxBundleSrc = null,
                                    externalServices = null,
                                    docProperties = null
                                }) {
                        this.#eventBus = eventBus;
                        this.#sandboxBundleSrc = sandboxBundleSrc;
                        this.#externalServices = externalServices;
                        this.#docProperties = docProperties;
                    }

                    setViewer(pdfViewer) {
                        this.#pdfViewer = pdfViewer;
                    }

                    async setDocument(pdfDocument) {
                        if (this.#pdfDocument) {
                            await this.#destroyScripting();
                        }
                        this.#pdfDocument = pdfDocument;
                        if (!pdfDocument) {
                            return;
                        }
                        const [objects, calculationOrder, docActions] = await Promise.all([pdfDocument.getFieldObjects(), pdfDocument.getCalculationOrderIds(), pdfDocument.getJSActions()]);
                        if (!objects && !docActions) {
                            await this.#destroyScripting();
                            return;
                        }
                        if (pdfDocument !== this.#pdfDocument) {
                            return;
                        }
                        try {
                            this.#scripting = this.#initScripting();
                        } catch (error) {
                            console.error(`setDocument: "${error.message}".`);
                            await this.#destroyScripting();
                            return;
                        }
                        this._internalEvents.set("updatefromsandbox", event => {
                            if (event?.source === window) {
                                this.#updateFromSandbox(event.detail);
                            }
                        });
                        this._internalEvents.set("dispatcheventinsandbox", event => {
                            this.#scripting?.dispatchEventInSandbox(event.detail);
                        });
                        this._internalEvents.set("pagechanging", ({
                                                                      pageNumber,
                                                                      previous
                                                                  }) => {
                            if (pageNumber === previous) {
                                return;
                            }
                            this.#dispatchPageClose(previous);
                            this.#dispatchPageOpen(pageNumber);
                        });
                        this._internalEvents.set("pagerendered", ({
                                                                      pageNumber
                                                                  }) => {
                            if (!this._pageOpenPending.has(pageNumber)) {
                                return;
                            }
                            if (pageNumber !== this.#pdfViewer.currentPageNumber) {
                                return;
                            }
                            this.#dispatchPageOpen(pageNumber);
                        });
                        this._internalEvents.set("pagesdestroy", async () => {
                            await this.#dispatchPageClose(this.#pdfViewer.currentPageNumber);
                            await this.#scripting?.dispatchEventInSandbox({
                                id: "doc",
                                name: "WillClose"
                            });
                            this.#closeCapability?.resolve();
                        });
                        for (const [name, listener] of this._internalEvents) {
                            this.#eventBus._on(name, listener);
                        }
                        try {
                            const docProperties = await this.#docProperties(pdfDocument);
                            if (pdfDocument !== this.#pdfDocument) {
                                return;
                            }
                            await this.#scripting.createSandbox({
                                objects,
                                calculationOrder,
                                appInfo: {
                                    platform: navigator.platform,
                                    language: navigator.language
                                },
                                docInfo: {
                                    ...docProperties,
                                    actions: docActions
                                }
                            });
                            this.#eventBus.dispatch("sandboxcreated", {
                                source: this
                            });
                        } catch (error) {
                            console.error(`setDocument: "${error.message}".`);
                            await this.#destroyScripting();
                            return;
                        }
                        await this.#scripting?.dispatchEventInSandbox({
                            id: "doc",
                            name: "Open"
                        });
                        await this.#dispatchPageOpen(this.#pdfViewer.currentPageNumber, true);
                        Promise.resolve().then(() => {
                            if (pdfDocument === this.#pdfDocument) {
                                this.#ready = true;
                            }
                        });
                    }

                    async dispatchWillSave() {
                        return this.#scripting?.dispatchEventInSandbox({
                            id: "doc",
                            name: "WillSave"
                        });
                    }

                    async dispatchDidSave() {
                        return this.#scripting?.dispatchEventInSandbox({
                            id: "doc",
                            name: "DidSave"
                        });
                    }

                    async dispatchWillPrint() {
                        if (!this.#scripting) {
                            return;
                        }
                        await this.#willPrintCapability?.promise;
                        this.#willPrintCapability = new _pdfjsLib.PromiseCapability();
                        try {
                            await this.#scripting.dispatchEventInSandbox({
                                id: "doc",
                                name: "WillPrint"
                            });
                        } catch (ex) {
                            this.#willPrintCapability.resolve();
                            this.#willPrintCapability = null;
                            throw ex;
                        }
                        await this.#willPrintCapability.promise;
                    }

                    async dispatchDidPrint() {
                        return this.#scripting?.dispatchEventInSandbox({
                            id: "doc",
                            name: "DidPrint"
                        });
                    }

                    get destroyPromise() {
                        return this.#destroyCapability?.promise || null;
                    }

                    get ready() {
                        return this.#ready;
                    }

                    get _internalEvents() {
                        return (0, _pdfjsLib.shadow)(this, "_internalEvents", new Map());
                    }

                    get _pageOpenPending() {
                        return (0, _pdfjsLib.shadow)(this, "_pageOpenPending", new Set());
                    }

                    get _visitedPages() {
                        return (0, _pdfjsLib.shadow)(this, "_visitedPages", new Map());
                    }

                    async #updateFromSandbox(detail) {
                        const pdfViewer = this.#pdfViewer;
                        const isInPresentationMode = pdfViewer.isInPresentationMode || pdfViewer.isChangingPresentationMode;
                        const {
                            id,
                            siblings,
                            command,
                            value
                        } = detail;
                        if (!id) {
                            switch (command) {
                                case "clear":
                                    console.clear();
                                    break;
                                case "error":
                                    console.error(value);
                                    break;
                                case "layout":
                                    if (!isInPresentationMode) {
                                        const modes = (0, _ui_utils.apiPageLayoutToViewerModes)(value);
                                        pdfViewer.spreadMode = modes.spreadMode;
                                    }
                                    break;
                                case "page-num":
                                    pdfViewer.currentPageNumber = value + 1;
                                    break;
                                case "print":
                                    await pdfViewer.pagesPromise;
                                    this.#eventBus.dispatch("print", {
                                        source: this
                                    });
                                    break;
                                case "println":
                                    console.log(value);
                                    break;
                                case "zoom":
                                    if (!isInPresentationMode) {
                                        pdfViewer.currentScaleValue = value;
                                    }
                                    break;
                                case "SaveAs":
                                    this.#eventBus.dispatch("download", {
                                        source: this
                                    });
                                    break;
                                case "FirstPage":
                                    pdfViewer.currentPageNumber = 1;
                                    break;
                                case "LastPage":
                                    pdfViewer.currentPageNumber = pdfViewer.pagesCount;
                                    break;
                                case "NextPage":
                                    pdfViewer.nextPage();
                                    break;
                                case "PrevPage":
                                    pdfViewer.previousPage();
                                    break;
                                case "ZoomViewIn":
                                    if (!isInPresentationMode) {
                                        pdfViewer.increaseScale();
                                    }
                                    break;
                                case "ZoomViewOut":
                                    if (!isInPresentationMode) {
                                        pdfViewer.decreaseScale();
                                    }
                                    break;
                                case "WillPrintFinished":
                                    this.#willPrintCapability?.resolve();
                                    this.#willPrintCapability = null;
                                    break;
                            }
                            return;
                        }
                        if (isInPresentationMode && detail.focus) {
                            return;
                        }
                        delete detail.id;
                        delete detail.siblings;
                        const ids = siblings ? [id, ...siblings] : [id];
                        for (const elementId of ids) {
                            const element = document.querySelector(`[data-element-id="${elementId}"]`);
                            if (element) {
                                element.dispatchEvent(new CustomEvent("updatefromsandbox", {
                                    detail
                                }));
                            } else {
                                this.#pdfDocument?.annotationStorage.setValue(elementId, detail);
                            }
                        }
                    }

                    async #dispatchPageOpen(pageNumber, initialize = false) {
                        const pdfDocument = this.#pdfDocument,
                            visitedPages = this._visitedPages;
                        if (initialize) {
                            this.#closeCapability = new _pdfjsLib.PromiseCapability();
                        }
                        if (!this.#closeCapability) {
                            return;
                        }
                        const pageView = this.#pdfViewer.getPageView(pageNumber - 1);
                        if (pageView?.renderingState !== _ui_utils.RenderingStates.FINISHED) {
                            this._pageOpenPending.add(pageNumber);
                            return;
                        }
                        this._pageOpenPending.delete(pageNumber);
                        const actionsPromise = (async () => {
                            const actions = await (!visitedPages.has(pageNumber) ? pageView.pdfPage?.getJSActions() : null);
                            if (pdfDocument !== this.#pdfDocument) {
                                return;
                            }
                            await this.#scripting?.dispatchEventInSandbox({
                                id: "page",
                                name: "PageOpen",
                                pageNumber,
                                actions
                            });
                        })();
                        visitedPages.set(pageNumber, actionsPromise);
                    }

                    async #dispatchPageClose(pageNumber) {
                        const pdfDocument = this.#pdfDocument,
                            visitedPages = this._visitedPages;
                        if (!this.#closeCapability) {
                            return;
                        }
                        if (this._pageOpenPending.has(pageNumber)) {
                            return;
                        }
                        const actionsPromise = visitedPages.get(pageNumber);
                        if (!actionsPromise) {
                            return;
                        }
                        visitedPages.set(pageNumber, null);
                        await actionsPromise;
                        if (pdfDocument !== this.#pdfDocument) {
                            return;
                        }
                        await this.#scripting?.dispatchEventInSandbox({
                            id: "page",
                            name: "PageClose",
                            pageNumber
                        });
                    }

                    #initScripting() {
                        this.#destroyCapability = new _pdfjsLib.PromiseCapability();
                        if (this.#scripting) {
                            throw new Error("#initScripting: Scripting already exists.");
                        }
                        return this.#externalServices.createScripting({
                            sandboxBundleSrc: this.#sandboxBundleSrc
                        });
                    }

                    async #destroyScripting() {
                        if (!this.#scripting) {
                            this.#pdfDocument = null;
                            this.#destroyCapability?.resolve();
                            return;
                        }
                        if (this.#closeCapability) {
                            await Promise.race([this.#closeCapability.promise, new Promise(resolve => {
                                setTimeout(resolve, 1000);
                            })]).catch(() => {
                            });
                            this.#closeCapability = null;
                        }
                        this.#pdfDocument = null;
                        try {
                            await this.#scripting.destroySandbox();
                        } catch {
                        }
                        this.#willPrintCapability?.reject(new Error("Scripting destroyed."));
                        this.#willPrintCapability = null;
                        for (const [name, listener] of this._internalEvents) {
                            this.#eventBus._off(name, listener);
                        }
                        this._internalEvents.clear();
                        this._pageOpenPending.clear();
                        this._visitedPages.clear();
                        this.#scripting = null;
                        this.#ready = false;
                        this.#destroyCapability?.resolve();
                    }
                }

                exports.PDFScriptingManager = PDFScriptingManager;

                /***/
            }),
            /* 24 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.PDFSinglePageViewer = void 0;
                var _ui_utils = __w_pdfjs_require__(2);
                var _pdf_viewer = __w_pdfjs_require__(25);

                class PDFSinglePageViewer extends _pdf_viewer.PDFViewer {
                    _resetView() {
                        super._resetView();
                        this._scrollMode = _ui_utils.ScrollMode.PAGE;
                        this._spreadMode = _ui_utils.SpreadMode.NONE;
                    }

                    set scrollMode(mode) {
                    }

                    _updateScrollMode() {
                    }

                    set spreadMode(mode) {
                    }

                    _updateSpreadMode() {
                    }
                }

                exports.PDFSinglePageViewer = PDFSinglePageViewer;

                /***/
            }),
            /* 25 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.PagesCountLimit = exports.PDFViewer = exports.PDFPageViewBuffer = void 0;
                var _pdfjsLib = __w_pdfjs_require__(4);
                var _ui_utils = __w_pdfjs_require__(2);
                var _l10n_utils = __w_pdfjs_require__(7);
                var _pdf_page_view = __w_pdfjs_require__(13);
                var _pdf_rendering_queue = __w_pdfjs_require__(26);
                var _pdf_link_service = __w_pdfjs_require__(5);
                const DEFAULT_CACHE_SIZE = 10;
                const PagesCountLimit = {
                    FORCE_SCROLL_MODE_PAGE: 15000,
                    FORCE_LAZY_PAGE_INIT: 7500,
                    PAUSE_EAGER_PAGE_INIT: 250
                };
                exports.PagesCountLimit = PagesCountLimit;

                function isValidAnnotationEditorMode(mode) {
                    return Object.values(_pdfjsLib.AnnotationEditorType).includes(mode) && mode !== _pdfjsLib.AnnotationEditorType.DISABLE;
                }

                class PDFPageViewBuffer {
                    #buf = new Set();
                    #size = 0;

                    constructor(size) {
                        this.#size = size;
                    }

                    push(view) {
                        const buf = this.#buf;
                        if (buf.has(view)) {
                            buf.delete(view);
                        }
                        buf.add(view);
                        if (buf.size > this.#size) {
                            this.#destroyFirstView();
                        }
                    }

                    resize(newSize, idsToKeep = null) {
                        this.#size = newSize;
                        const buf = this.#buf;
                        if (idsToKeep) {
                            const ii = buf.size;
                            let i = 1;
                            for (const view of buf) {
                                if (idsToKeep.has(view.id)) {
                                    buf.delete(view);
                                    buf.add(view);
                                }
                                if (++i > ii) {
                                    break;
                                }
                            }
                        }
                        while (buf.size > this.#size) {
                            this.#destroyFirstView();
                        }
                    }

                    has(view) {
                        return this.#buf.has(view);
                    }

                    [Symbol.iterator]() {
                        return this.#buf.keys();
                    }

                    #destroyFirstView() {
                        const firstView = this.#buf.keys().next().value;
                        firstView?.destroy();
                        this.#buf.delete(firstView);
                    }
                }

                exports.PDFPageViewBuffer = PDFPageViewBuffer;

                class PDFViewer {
                    #buffer = null;
                    #altTextManager = null;
                    #annotationEditorMode = _pdfjsLib.AnnotationEditorType.NONE;
                    #annotationEditorUIManager = null;
                    #annotationMode = _pdfjsLib.AnnotationMode.ENABLE_FORMS;
                    #containerTopLeft = null;
                    #copyCallbackBound = null;
                    #enablePermissions = false;
                    #getAllTextInProgress = false;
                    #hiddenCopyElement = null;
                    #interruptCopyCondition = false;
                    #previousContainerHeight = 0;
                    #resizeObserver = new ResizeObserver(this.#resizeObserverCallback.bind(this));
                    #scrollModePageState = null;
                    #onVisibilityChange = null;
                    #scaleTimeoutId = null;
                    #textLayerMode = _ui_utils.TextLayerMode.ENABLE;

                    constructor(options) {
                        const viewerVersion = '3.11.174';
                        if (_pdfjsLib.version !== viewerVersion) {
                            throw new Error(`The API version "${_pdfjsLib.version}" does not match the Viewer version "${viewerVersion}".`);
                        }
                        this.container = options.container;
                        this.viewer = options.viewer || options.container.firstElementChild;
                        if (this.container?.tagName !== "DIV" || this.viewer?.tagName !== "DIV") {
                            throw new Error("Invalid `container` and/or `viewer` option.");
                        }
                        if (this.container.offsetParent && getComputedStyle(this.container).position !== "absolute") {
                            throw new Error("The `container` must be absolutely positioned.");
                        }
                        this.#resizeObserver.observe(this.container);
                        this.eventBus = options.eventBus;
                        this.linkService = options.linkService || new _pdf_link_service.SimpleLinkService();
                        this.downloadManager = options.downloadManager || null;
                        this.findController = options.findController || null;
                        this.#altTextManager = options.altTextManager || null;
                        if (this.findController) {
                            this.findController.onIsPageVisible = pageNumber => this._getVisiblePages().ids.has(pageNumber);
                        }
                        this._scriptingManager = options.scriptingManager || null;
                        this.#textLayerMode = options.textLayerMode ?? _ui_utils.TextLayerMode.ENABLE;
                        this.#annotationMode = options.annotationMode ?? _pdfjsLib.AnnotationMode.ENABLE_FORMS;
                        this.#annotationEditorMode = options.annotationEditorMode ?? _pdfjsLib.AnnotationEditorType.NONE;
                        this.imageResourcesPath = options.imageResourcesPath || "";
                        this.enablePrintAutoRotate = options.enablePrintAutoRotate || false;
                        this.removePageBorders = options.removePageBorders || false;
                        if (options.useOnlyCssZoom) {
                            console.error("useOnlyCssZoom was removed, please use `maxCanvasPixels = 0` instead.");
                            options.maxCanvasPixels = 0;
                        }
                        this.isOffscreenCanvasSupported = options.isOffscreenCanvasSupported ?? true;
                        this.maxCanvasPixels = options.maxCanvasPixels;
                        this.l10n = options.l10n || _l10n_utils.NullL10n;
                        this.#enablePermissions = options.enablePermissions || false;
                        this.pageColors = options.pageColors || null;
                        this.defaultRenderingQueue = !options.renderingQueue;
                        if (this.defaultRenderingQueue) {
                            this.renderingQueue = new _pdf_rendering_queue.PDFRenderingQueue();
                            this.renderingQueue.setViewer(this);
                        } else {
                            this.renderingQueue = options.renderingQueue;
                        }
                        this.scroll = (0, _ui_utils.watchScroll)(this.container, this._scrollUpdate.bind(this));
                        this.presentationModeState = _ui_utils.PresentationModeState.UNKNOWN;
                        this._onBeforeDraw = this._onAfterDraw = null;
                        this._resetView();
                        if (this.removePageBorders) {
                            this.viewer.classList.add("removePageBorders");
                        }
                        this.#updateContainerHeightCss();
                        this.eventBus._on("thumbnailrendered", ({
                                                                    pageNumber,
                                                                    pdfPage
                                                                }) => {
                            const pageView = this._pages[pageNumber - 1];
                            if (!this.#buffer.has(pageView)) {
                                pdfPage?.cleanup();
                            }
                        });
                    }

                    get pagesCount() {
                        return this._pages.length;
                    }

                    getPageView(index) {
                        return this._pages[index];
                    }

                    getCachedPageViews() {
                        return new Set(this.#buffer);
                    }

                    get pageViewsReady() {
                        return this._pagesCapability.settled && this._pages.every(pageView => pageView?.pdfPage);
                    }

                    get renderForms() {
                        return this.#annotationMode === _pdfjsLib.AnnotationMode.ENABLE_FORMS;
                    }

                    get enableScripting() {
                        return !!this._scriptingManager;
                    }

                    get currentPageNumber() {
                        return this._currentPageNumber;
                    }

                    set currentPageNumber(val) {
                        if (!Number.isInteger(val)) {
                            throw new Error("Invalid page number.");
                        }
                        if (!this.pdfDocument) {
                            return;
                        }
                        if (!this._setCurrentPageNumber(val, true)) {
                            console.error(`currentPageNumber: "${val}" is not a valid page.`);
                        }
                    }

                    _setCurrentPageNumber(val, resetCurrentPageView = false) {
                        if (this._currentPageNumber === val) {
                            if (resetCurrentPageView) {
                                this.#resetCurrentPageView();
                            }
                            return true;
                        }
                        if (!(0 < val && val <= this.pagesCount)) {
                            return false;
                        }
                        const previous = this._currentPageNumber;
                        this._currentPageNumber = val;
                        this.eventBus.dispatch("pagechanging", {
                            source: this,
                            pageNumber: val,
                            pageLabel: this._pageLabels?.[val - 1] ?? null,
                            previous
                        });
                        if (resetCurrentPageView) {
                            this.#resetCurrentPageView();
                        }
                        return true;
                    }

                    get currentPageLabel() {
                        return this._pageLabels?.[this._currentPageNumber - 1] ?? null;
                    }

                    set currentPageLabel(val) {
                        if (!this.pdfDocument) {
                            return;
                        }
                        let page = val | 0;
                        if (this._pageLabels) {
                            const i = this._pageLabels.indexOf(val);
                            if (i >= 0) {
                                page = i + 1;
                            }
                        }
                        if (!this._setCurrentPageNumber(page, true)) {
                            console.error(`currentPageLabel: "${val}" is not a valid page.`);
                        }
                    }

                    get currentScale() {
                        return this._currentScale !== _ui_utils.UNKNOWN_SCALE ? this._currentScale : _ui_utils.DEFAULT_SCALE;
                    }

                    set currentScale(val) {
                        if (isNaN(val)) {
                            throw new Error("Invalid numeric scale.");
                        }
                        if (!this.pdfDocument) {
                            return;
                        }
                        this.#setScale(val, {
                            noScroll: false
                        });
                    }

                    get currentScaleValue() {
                        return this._currentScaleValue;
                    }

                    set currentScaleValue(val) {
                        if (!this.pdfDocument) {
                            return;
                        }
                        this.#setScale(val, {
                            noScroll: false
                        });
                    }

                    get pagesRotation() {
                        return this._pagesRotation;
                    }

                    set pagesRotation(rotation) {
                        if (!(0, _ui_utils.isValidRotation)(rotation)) {
                            throw new Error("Invalid pages rotation angle.");
                        }
                        if (!this.pdfDocument) {
                            return;
                        }
                        rotation %= 360;
                        if (rotation < 0) {
                            rotation += 360;
                        }
                        if (this._pagesRotation === rotation) {
                            return;
                        }
                        this._pagesRotation = rotation;
                        const pageNumber = this._currentPageNumber;
                        this.refresh(true, {
                            rotation
                        });
                        if (this._currentScaleValue) {
                            this.#setScale(this._currentScaleValue, {
                                noScroll: true
                            });
                        }
                        this.eventBus.dispatch("rotationchanging", {
                            source: this,
                            pagesRotation: rotation,
                            pageNumber
                        });
                        if (this.defaultRenderingQueue) {
                            this.update();
                        }
                    }

                    get firstPagePromise() {
                        return this.pdfDocument ? this._firstPageCapability.promise : null;
                    }

                    get onePageRendered() {
                        return this.pdfDocument ? this._onePageRenderedCapability.promise : null;
                    }

                    get pagesPromise() {
                        return this.pdfDocument ? this._pagesCapability.promise : null;
                    }

                    #layerProperties() {
                        const self = this;
                        return {
                            get annotationEditorUIManager() {
                                return self.#annotationEditorUIManager;
                            },
                            get annotationStorage() {
                                return self.pdfDocument?.annotationStorage;
                            },
                            get downloadManager() {
                                return self.downloadManager;
                            },
                            get enableScripting() {
                                return !!self._scriptingManager;
                            },
                            get fieldObjectsPromise() {
                                return self.pdfDocument?.getFieldObjects();
                            },
                            get findController() {
                                return self.findController;
                            },
                            get hasJSActionsPromise() {
                                return self.pdfDocument?.hasJSActions();
                            },
                            get linkService() {
                                return self.linkService;
                            }
                        };
                    }

                    #initializePermissions(permissions) {
                        const params = {
                            annotationEditorMode: this.#annotationEditorMode,
                            annotationMode: this.#annotationMode,
                            textLayerMode: this.#textLayerMode
                        };
                        if (!permissions) {
                            return params;
                        }
                        if (!permissions.includes(_pdfjsLib.PermissionFlag.COPY) && this.#textLayerMode === _ui_utils.TextLayerMode.ENABLE) {
                            params.textLayerMode = _ui_utils.TextLayerMode.ENABLE_PERMISSIONS;
                        }
                        if (!permissions.includes(_pdfjsLib.PermissionFlag.MODIFY_CONTENTS)) {
                            params.annotationEditorMode = _pdfjsLib.AnnotationEditorType.DISABLE;
                        }
                        if (!permissions.includes(_pdfjsLib.PermissionFlag.MODIFY_ANNOTATIONS) && !permissions.includes(_pdfjsLib.PermissionFlag.FILL_INTERACTIVE_FORMS) && this.#annotationMode === _pdfjsLib.AnnotationMode.ENABLE_FORMS) {
                            params.annotationMode = _pdfjsLib.AnnotationMode.ENABLE;
                        }
                        return params;
                    }

                    #onePageRenderedOrForceFetch() {
                        if (document.visibilityState === "hidden" || !this.container.offsetParent || this._getVisiblePages().views.length === 0) {
                            return Promise.resolve();
                        }
                        const visibilityChangePromise = new Promise(resolve => {
                            this.#onVisibilityChange = () => {
                                if (document.visibilityState !== "hidden") {
                                    return;
                                }
                                resolve();
                                document.removeEventListener("visibilitychange", this.#onVisibilityChange);
                                this.#onVisibilityChange = null;
                            };
                            document.addEventListener("visibilitychange", this.#onVisibilityChange);
                        });
                        return Promise.race([this._onePageRenderedCapability.promise, visibilityChangePromise]);
                    }

                    async getAllText() {
                        const texts = [];
                        const buffer = [];
                        for (let pageNum = 1, pagesCount = this.pdfDocument.numPages; pageNum <= pagesCount; ++pageNum) {
                            if (this.#interruptCopyCondition) {
                                return null;
                            }
                            buffer.length = 0;
                            const page = await this.pdfDocument.getPage(pageNum);
                            const {
                                items
                            } = await page.getTextContent();
                            for (const item of items) {
                                if (item.str) {
                                    buffer.push(item.str);
                                }
                                if (item.hasEOL) {
                                    buffer.push("\n");
                                }
                            }
                            texts.push((0, _ui_utils.removeNullCharacters)(buffer.join("")));
                        }
                        return texts.join("\n");
                    }

                    #copyCallback(textLayerMode, event) {
                        const selection = document.getSelection();
                        const {
                            focusNode,
                            anchorNode
                        } = selection;
                        if (anchorNode && focusNode && selection.containsNode(this.#hiddenCopyElement)) {
                            if (this.#getAllTextInProgress || textLayerMode === _ui_utils.TextLayerMode.ENABLE_PERMISSIONS) {
                                event.preventDefault();
                                event.stopPropagation();
                                return;
                            }
                            this.#getAllTextInProgress = true;
                            const savedCursor = this.container.style.cursor;
                            this.container.style.cursor = "wait";
                            const interruptCopy = ev => this.#interruptCopyCondition = ev.key === "Escape";
                            window.addEventListener("keydown", interruptCopy);
                            this.getAllText().then(async text => {
                                if (text !== null) {
                                    await navigator.clipboard.writeText(text);
                                }
                            }).catch(reason => {
                                console.warn(`Something goes wrong when extracting the text: ${reason.message}`);
                            }).finally(() => {
                                this.#getAllTextInProgress = false;
                                this.#interruptCopyCondition = false;
                                window.removeEventListener("keydown", interruptCopy);
                                this.container.style.cursor = savedCursor;
                            });
                            event.preventDefault();
                            event.stopPropagation();
                        }
                    }

                    setDocument(pdfDocument) {
                        if (this.pdfDocument) {
                            this.eventBus.dispatch("pagesdestroy", {
                                source: this
                            });
                            this._cancelRendering();
                            this._resetView();
                            this.findController?.setDocument(null);
                            this._scriptingManager?.setDocument(null);
                            if (this.#annotationEditorUIManager) {
                                this.#annotationEditorUIManager.destroy();
                                this.#annotationEditorUIManager = null;
                            }
                        }
                        this.pdfDocument = pdfDocument;
                        if (!pdfDocument) {
                            return;
                        }
                        const pagesCount = pdfDocument.numPages;
                        const firstPagePromise = pdfDocument.getPage(1);
                        const optionalContentConfigPromise = pdfDocument.getOptionalContentConfig();
                        const permissionsPromise = this.#enablePermissions ? pdfDocument.getPermissions() : Promise.resolve();
                        if (pagesCount > PagesCountLimit.FORCE_SCROLL_MODE_PAGE) {
                            console.warn("Forcing PAGE-scrolling for performance reasons, given the length of the document.");
                            const mode = this._scrollMode = _ui_utils.ScrollMode.PAGE;
                            this.eventBus.dispatch("scrollmodechanged", {
                                source: this,
                                mode
                            });
                        }
                        this._pagesCapability.promise.then(() => {
                            this.eventBus.dispatch("pagesloaded", {
                                source: this,
                                pagesCount
                            });
                        }, () => {
                        });
                        this._onBeforeDraw = evt => {
                            const pageView = this._pages[evt.pageNumber - 1];
                            if (!pageView) {
                                return;
                            }
                            this.#buffer.push(pageView);
                        };
                        this.eventBus._on("pagerender", this._onBeforeDraw);
                        this._onAfterDraw = evt => {
                            if (evt.cssTransform || this._onePageRenderedCapability.settled) {
                                return;
                            }
                            this._onePageRenderedCapability.resolve({
                                timestamp: evt.timestamp
                            });
                            this.eventBus._off("pagerendered", this._onAfterDraw);
                            this._onAfterDraw = null;
                            if (this.#onVisibilityChange) {
                                document.removeEventListener("visibilitychange", this.#onVisibilityChange);
                                this.#onVisibilityChange = null;
                            }
                        };
                        this.eventBus._on("pagerendered", this._onAfterDraw);
                        Promise.all([firstPagePromise, permissionsPromise]).then(([firstPdfPage, permissions]) => {
                            if (pdfDocument !== this.pdfDocument) {
                                return;
                            }
                            this._firstPageCapability.resolve(firstPdfPage);
                            this._optionalContentConfigPromise = optionalContentConfigPromise;
                            const {
                                annotationEditorMode,
                                annotationMode,
                                textLayerMode
                            } = this.#initializePermissions(permissions);
                            if (textLayerMode !== _ui_utils.TextLayerMode.DISABLE) {
                                const element = this.#hiddenCopyElement = document.createElement("div");
                                element.id = "hiddenCopyElement";
                                this.viewer.before(element);
                            }
                            if (annotationEditorMode !== _pdfjsLib.AnnotationEditorType.DISABLE) {
                                const mode = annotationEditorMode;
                                if (pdfDocument.isPureXfa) {
                                    console.warn("Warning: XFA-editing is not implemented.");
                                } else if (isValidAnnotationEditorMode(mode)) {
                                    this.#annotationEditorUIManager = new _pdfjsLib.AnnotationEditorUIManager(this.container, this.viewer, this.#altTextManager, this.eventBus, pdfDocument, this.pageColors);
                                    if (mode !== _pdfjsLib.AnnotationEditorType.NONE) {
                                        this.#annotationEditorUIManager.updateMode(mode);
                                    }
                                } else {
                                    console.error(`Invalid AnnotationEditor mode: ${mode}`);
                                }
                            }
                            const layerProperties = this.#layerProperties.bind(this);
                            const viewerElement = this._scrollMode === _ui_utils.ScrollMode.PAGE ? null : this.viewer;
                            const scale = this.currentScale;
                            const viewport = firstPdfPage.getViewport({
                                scale: scale * _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS
                            });
                            this.viewer.style.setProperty("--scale-factor", viewport.scale);
                            if (this.pageColors?.foreground === "CanvasText" || this.pageColors?.background === "Canvas") {
                                this.viewer.style.setProperty("--hcm-highligh-filter", pdfDocument.filterFactory.addHighlightHCMFilter("CanvasText", "Canvas", "HighlightText", "Highlight"));
                            }
                            for (let pageNum = 1; pageNum <= pagesCount; ++pageNum) {
                                const pageView = new _pdf_page_view.PDFPageView({
                                    container: viewerElement,
                                    eventBus: this.eventBus,
                                    id: pageNum,
                                    scale,
                                    defaultViewport: viewport.clone(),
                                    optionalContentConfigPromise,
                                    renderingQueue: this.renderingQueue,
                                    textLayerMode,
                                    annotationMode,
                                    imageResourcesPath: this.imageResourcesPath,
                                    isOffscreenCanvasSupported: this.isOffscreenCanvasSupported,
                                    maxCanvasPixels: this.maxCanvasPixels,
                                    pageColors: this.pageColors,
                                    l10n: this.l10n,
                                    layerProperties
                                });
                                this._pages.push(pageView);
                            }
                            const firstPageView = this._pages[0];
                            if (firstPageView) {
                                firstPageView.setPdfPage(firstPdfPage);
                                this.linkService.cachePageRef(1, firstPdfPage.ref);
                            }
                            if (this._scrollMode === _ui_utils.ScrollMode.PAGE) {
                                this.#ensurePageViewVisible();
                            } else if (this._spreadMode !== _ui_utils.SpreadMode.NONE) {
                                this._updateSpreadMode();
                            }
                            this.#onePageRenderedOrForceFetch().then(async () => {
                                this.findController?.setDocument(pdfDocument);
                                this._scriptingManager?.setDocument(pdfDocument);
                                if (this.#hiddenCopyElement) {
                                    this.#copyCallbackBound = this.#copyCallback.bind(this, textLayerMode);
                                    document.addEventListener("copy", this.#copyCallbackBound);
                                }
                                if (this.#annotationEditorUIManager) {
                                    this.eventBus.dispatch("annotationeditormodechanged", {
                                        source: this,
                                        mode: this.#annotationEditorMode
                                    });
                                }
                                if (pdfDocument.loadingParams.disableAutoFetch || pagesCount > PagesCountLimit.FORCE_LAZY_PAGE_INIT) {
                                    this._pagesCapability.resolve();
                                    return;
                                }
                                let getPagesLeft = pagesCount - 1;
                                if (getPagesLeft <= 0) {
                                    this._pagesCapability.resolve();
                                    return;
                                }
                                for (let pageNum = 2; pageNum <= pagesCount; ++pageNum) {
                                    const promise = pdfDocument.getPage(pageNum).then(pdfPage => {
                                        const pageView = this._pages[pageNum - 1];
                                        if (!pageView.pdfPage) {
                                            pageView.setPdfPage(pdfPage);
                                        }
                                        this.linkService.cachePageRef(pageNum, pdfPage.ref);
                                        if (--getPagesLeft === 0) {
                                            this._pagesCapability.resolve();
                                        }
                                    }, reason => {
                                        console.error(`Unable to get page ${pageNum} to initialize viewer`, reason);
                                        if (--getPagesLeft === 0) {
                                            this._pagesCapability.resolve();
                                        }
                                    });
                                    if (pageNum % PagesCountLimit.PAUSE_EAGER_PAGE_INIT === 0) {
                                        await promise;
                                    }
                                }
                            });
                            this.eventBus.dispatch("pagesinit", {
                                source: this
                            });
                            pdfDocument.getMetadata().then(({
                                                                info
                                                            }) => {
                                if (pdfDocument !== this.pdfDocument) {
                                    return;
                                }
                                if (info.Language) {
                                    this.viewer.lang = info.Language;
                                }
                            });
                            if (this.defaultRenderingQueue) {
                                this.update();
                            }
                        }).catch(reason => {
                            console.error("Unable to initialize viewer", reason);
                            this._pagesCapability.reject(reason);
                        });
                    }

                    setPageLabels(labels) {
                        if (!this.pdfDocument) {
                            return;
                        }
                        if (!labels) {
                            this._pageLabels = null;
                        } else if (!(Array.isArray(labels) && this.pdfDocument.numPages === labels.length)) {
                            this._pageLabels = null;
                            console.error(`setPageLabels: Invalid page labels.`);
                        } else {
                            this._pageLabels = labels;
                        }
                        for (let i = 0, ii = this._pages.length; i < ii; i++) {
                            this._pages[i].setPageLabel(this._pageLabels?.[i] ?? null);
                        }
                    }

                    _resetView() {
                        this._pages = [];
                        this._currentPageNumber = 1;
                        this._currentScale = _ui_utils.UNKNOWN_SCALE;
                        this._currentScaleValue = null;
                        this._pageLabels = null;
                        this.#buffer = new PDFPageViewBuffer(DEFAULT_CACHE_SIZE);
                        this._location = null;
                        this._pagesRotation = 0;
                        this._optionalContentConfigPromise = null;
                        this._firstPageCapability = new _pdfjsLib.PromiseCapability();
                        this._onePageRenderedCapability = new _pdfjsLib.PromiseCapability();
                        this._pagesCapability = new _pdfjsLib.PromiseCapability();
                        this._scrollMode = _ui_utils.ScrollMode.VERTICAL;
                        this._previousScrollMode = _ui_utils.ScrollMode.UNKNOWN;
                        this._spreadMode = _ui_utils.SpreadMode.NONE;
                        this.#scrollModePageState = {
                            previousPageNumber: 1,
                            scrollDown: true,
                            pages: []
                        };
                        if (this._onBeforeDraw) {
                            this.eventBus._off("pagerender", this._onBeforeDraw);
                            this._onBeforeDraw = null;
                        }
                        if (this._onAfterDraw) {
                            this.eventBus._off("pagerendered", this._onAfterDraw);
                            this._onAfterDraw = null;
                        }
                        if (this.#onVisibilityChange) {
                            document.removeEventListener("visibilitychange", this.#onVisibilityChange);
                            this.#onVisibilityChange = null;
                        }
                        this.viewer.textContent = "";
                        this._updateScrollMode();
                        this.viewer.removeAttribute("lang");
                        if (this.#hiddenCopyElement) {
                            document.removeEventListener("copy", this.#copyCallbackBound);
                            this.#copyCallbackBound = null;
                            this.#hiddenCopyElement.remove();
                            this.#hiddenCopyElement = null;
                        }
                    }

                    #ensurePageViewVisible() {
                        if (this._scrollMode !== _ui_utils.ScrollMode.PAGE) {
                            throw new Error("#ensurePageViewVisible: Invalid scrollMode value.");
                        }
                        const pageNumber = this._currentPageNumber,
                            state = this.#scrollModePageState,
                            viewer = this.viewer;
                        viewer.textContent = "";
                        state.pages.length = 0;
                        if (this._spreadMode === _ui_utils.SpreadMode.NONE && !this.isInPresentationMode) {
                            const pageView = this._pages[pageNumber - 1];
                            viewer.append(pageView.div);
                            state.pages.push(pageView);
                        } else {
                            const pageIndexSet = new Set(),
                                parity = this._spreadMode - 1;
                            if (parity === -1) {
                                pageIndexSet.add(pageNumber - 1);
                            } else if (pageNumber % 2 !== parity) {
                                pageIndexSet.add(pageNumber - 1);
                                pageIndexSet.add(pageNumber);
                            } else {
                                pageIndexSet.add(pageNumber - 2);
                                pageIndexSet.add(pageNumber - 1);
                            }
                            const spread = document.createElement("div");
                            spread.className = "spread";
                            if (this.isInPresentationMode) {
                                const dummyPage = document.createElement("div");
                                dummyPage.className = "dummyPage";
                                spread.append(dummyPage);
                            }
                            for (const i of pageIndexSet) {
                                const pageView = this._pages[i];
                                if (!pageView) {
                                    continue;
                                }
                                spread.append(pageView.div);
                                state.pages.push(pageView);
                            }
                            viewer.append(spread);
                        }
                        state.scrollDown = pageNumber >= state.previousPageNumber;
                        state.previousPageNumber = pageNumber;
                    }

                    _scrollUpdate() {
                        if (this.pagesCount === 0) {
                            return;
                        }
                        this.update();
                    }

                    #scrollIntoView(pageView, pageSpot = null) {
                        const {
                            div,
                            id
                        } = pageView;
                        if (this._currentPageNumber !== id) {
                            this._setCurrentPageNumber(id);
                        }
                        if (this._scrollMode === _ui_utils.ScrollMode.PAGE) {
                            this.#ensurePageViewVisible();
                            this.update();
                        }
                        if (!pageSpot && !this.isInPresentationMode) {
                            const left = div.offsetLeft + div.clientLeft,
                                right = left + div.clientWidth;
                            const {
                                scrollLeft,
                                clientWidth
                            } = this.container;
                            if (this._scrollMode === _ui_utils.ScrollMode.HORIZONTAL || left < scrollLeft || right > scrollLeft + clientWidth) {
                                pageSpot = {
                                    left: 0,
                                    top: 0
                                };
                            }
                        }
                        (0, _ui_utils.scrollIntoView)(div, pageSpot);
                        if (!this._currentScaleValue && this._location) {
                            this._location = null;
                        }
                    }

                    #isSameScale(newScale) {
                        return newScale === this._currentScale || Math.abs(newScale - this._currentScale) < 1e-15;
                    }

                    #setScaleUpdatePages(newScale, newValue, {
                        noScroll = false,
                        preset = false,
                        drawingDelay = -1
                    }) {
                        this._currentScaleValue = newValue.toString();
                        if (this.#isSameScale(newScale)) {
                            if (preset) {
                                this.eventBus.dispatch("scalechanging", {
                                    source: this,
                                    scale: newScale,
                                    presetValue: newValue
                                });
                            }
                            return;
                        }
                        this.viewer.style.setProperty("--scale-factor", newScale * _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS);
                        const postponeDrawing = drawingDelay >= 0 && drawingDelay < 1000;
                        this.refresh(true, {
                            scale: newScale,
                            drawingDelay: postponeDrawing ? drawingDelay : -1
                        });
                        if (postponeDrawing) {
                            this.#scaleTimeoutId = setTimeout(() => {
                                this.#scaleTimeoutId = null;
                                this.refresh();
                            }, drawingDelay);
                        }
                        this._currentScale = newScale;
                        if (!noScroll) {
                            let page = this._currentPageNumber,
                                dest;
                            if (this._location && !(this.isInPresentationMode || this.isChangingPresentationMode)) {
                                page = this._location.pageNumber;
                                dest = [null, {
                                    name: "XYZ"
                                }, this._location.left, this._location.top, null];
                            }
                            this.scrollPageIntoView({
                                pageNumber: page,
                                destArray: dest,
                                allowNegativeOffset: true
                            });
                        }
                        this.eventBus.dispatch("scalechanging", {
                            source: this,
                            scale: newScale,
                            presetValue: preset ? newValue : undefined
                        });
                        if (this.defaultRenderingQueue) {
                            this.update();
                        }
                    }

                    get #pageWidthScaleFactor() {
                        if (this._spreadMode !== _ui_utils.SpreadMode.NONE && this._scrollMode !== _ui_utils.ScrollMode.HORIZONTAL) {
                            return 2;
                        }
                        return 1;
                    }

                    #setScale(value, options) {
                        let scale = parseFloat(value);
                        if (scale > 0) {
                            options.preset = false;
                            this.#setScaleUpdatePages(scale, value, options);
                        } else {
                            const currentPage = this._pages[this._currentPageNumber - 1];
                            if (!currentPage) {
                                return;
                            }
                            let hPadding = _ui_utils.SCROLLBAR_PADDING,
                                vPadding = _ui_utils.VERTICAL_PADDING;
                            if (this.isInPresentationMode) {
                                hPadding = vPadding = 4;
                                if (this._spreadMode !== _ui_utils.SpreadMode.NONE) {
                                    hPadding *= 2;
                                }
                            } else if (this.removePageBorders) {
                                hPadding = vPadding = 0;
                            } else if (this._scrollMode === _ui_utils.ScrollMode.HORIZONTAL) {
                                [hPadding, vPadding] = [vPadding, hPadding];
                            }
                            const pageWidthScale = (this.container.clientWidth - hPadding) / currentPage.width * currentPage.scale / this.#pageWidthScaleFactor;
                            const pageHeightScale = (this.container.clientHeight - vPadding) / currentPage.height * currentPage.scale;
                            switch (value) {
                                case "page-actual":
                                    scale = 1;
                                    break;
                                case "page-width":
                                    scale = pageWidthScale;
                                    break;
                                case "page-height":
                                    scale = pageHeightScale;
                                    break;
                                case "page-fit":
                                    scale = Math.min(pageWidthScale, pageHeightScale);
                                    break;
                                case "auto":
                                    const horizontalScale = (0, _ui_utils.isPortraitOrientation)(currentPage) ? pageWidthScale : Math.min(pageHeightScale, pageWidthScale);
                                    scale = Math.min(_ui_utils.MAX_AUTO_SCALE, horizontalScale);
                                    break;
                                default:
                                    console.error(`#setScale: "${value}" is an unknown zoom value.`);
                                    return;
                            }
                            options.preset = true;
                            this.#setScaleUpdatePages(scale, value, options);
                        }
                    }

                    #resetCurrentPageView() {
                        const pageView = this._pages[this._currentPageNumber - 1];
                        if (this.isInPresentationMode) {
                            this.#setScale(this._currentScaleValue, {
                                noScroll: true
                            });
                        }
                        this.#scrollIntoView(pageView);
                    }

                    pageLabelToPageNumber(label) {
                        if (!this._pageLabels) {
                            return null;
                        }
                        const i = this._pageLabels.indexOf(label);
                        if (i < 0) {
                            return null;
                        }
                        return i + 1;
                    }

                    scrollPageIntoView({
                                           pageNumber,
                                           destArray = null,
                                           allowNegativeOffset = false,
                                           ignoreDestinationZoom = false
                                       }) {
                        if (!this.pdfDocument) {
                            return;
                        }
                        const pageView = Number.isInteger(pageNumber) && this._pages[pageNumber - 1];
                        if (!pageView) {
                            console.error(`scrollPageIntoView: "${pageNumber}" is not a valid pageNumber parameter.`);
                            return;
                        }
                        if (this.isInPresentationMode || !destArray) {
                            this._setCurrentPageNumber(pageNumber, true);
                            return;
                        }
                        let x = 0,
                            y = 0;
                        let width = 0,
                            height = 0,
                            widthScale,
                            heightScale;
                        const changeOrientation = pageView.rotation % 180 !== 0;
                        const pageWidth = (changeOrientation ? pageView.height : pageView.width) / pageView.scale / _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS;
                        const pageHeight = (changeOrientation ? pageView.width : pageView.height) / pageView.scale / _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS;
                        let scale = 0;
                        switch (destArray[1].name) {
                            case "XYZ":
                                x = destArray[2];
                                y = destArray[3];
                                scale = destArray[4];
                                x = x !== null ? x : 0;
                                y = y !== null ? y : pageHeight;
                                break;
                            case "Fit":
                            case "FitB":
                                scale = "page-fit";
                                break;
                            case "FitH":
                            case "FitBH":
                                y = destArray[2];
                                scale = "page-width";
                                if (y === null && this._location) {
                                    x = this._location.left;
                                    y = this._location.top;
                                } else if (typeof y !== "number" || y < 0) {
                                    y = pageHeight;
                                }
                                break;
                            case "FitV":
                            case "FitBV":
                                x = destArray[2];
                                width = pageWidth;
                                height = pageHeight;
                                scale = "page-height";
                                break;
                            case "FitR":
                                x = destArray[2];
                                y = destArray[3];
                                width = destArray[4] - x;
                                height = destArray[5] - y;
                                let hPadding = _ui_utils.SCROLLBAR_PADDING,
                                    vPadding = _ui_utils.VERTICAL_PADDING;
                                if (this.removePageBorders) {
                                    hPadding = vPadding = 0;
                                }
                                widthScale = (this.container.clientWidth - hPadding) / width / _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS;
                                heightScale = (this.container.clientHeight - vPadding) / height / _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS;
                                scale = Math.min(Math.abs(widthScale), Math.abs(heightScale));
                                break;
                            default:
                                console.error(`scrollPageIntoView: "${destArray[1].name}" is not a valid destination type.`);
                                return;
                        }
                        if (!ignoreDestinationZoom) {
                            if (scale && scale !== this._currentScale) {
                                this.currentScaleValue = scale;
                            } else if (this._currentScale === _ui_utils.UNKNOWN_SCALE) {
                                this.currentScaleValue = _ui_utils.DEFAULT_SCALE_VALUE;
                            }
                        }
                        if (scale === "page-fit" && !destArray[4]) {
                            this.#scrollIntoView(pageView);
                            return;
                        }
                        const boundingRect = [pageView.viewport.convertToViewportPoint(x, y), pageView.viewport.convertToViewportPoint(x + width, y + height)];
                        let left = Math.min(boundingRect[0][0], boundingRect[1][0]);
                        let top = Math.min(boundingRect[0][1], boundingRect[1][1]);
                        if (!allowNegativeOffset) {
                            left = Math.max(left, 0);
                            top = Math.max(top, 0);
                        }
                        this.#scrollIntoView(pageView, {
                            left,
                            top
                        });
                    }

                    _updateLocation(firstPage) {
                        const currentScale = this._currentScale;
                        const currentScaleValue = this._currentScaleValue;
                        const normalizedScaleValue = parseFloat(currentScaleValue) === currentScale ? Math.round(currentScale * 10000) / 100 : currentScaleValue;
                        const pageNumber = firstPage.id;
                        const currentPageView = this._pages[pageNumber - 1];
                        const container = this.container;
                        const topLeft = currentPageView.getPagePoint(container.scrollLeft - firstPage.x, container.scrollTop - firstPage.y);
                        const intLeft = Math.round(topLeft[0]);
                        const intTop = Math.round(topLeft[1]);
                        let pdfOpenParams = `#page=${pageNumber}`;
                        if (!this.isInPresentationMode) {
                            pdfOpenParams += `&zoom=${normalizedScaleValue},${intLeft},${intTop}`;
                        }
                        this._location = {
                            pageNumber,
                            scale: normalizedScaleValue,
                            top: intTop,
                            left: intLeft,
                            rotation: this._pagesRotation,
                            pdfOpenParams
                        };
                    }

                    update() {
                        const visible = this._getVisiblePages();
                        const visiblePages = visible.views,
                            numVisiblePages = visiblePages.length;
                        if (numVisiblePages === 0) {
                            return;
                        }
                        const newCacheSize = Math.max(DEFAULT_CACHE_SIZE, 2 * numVisiblePages + 1);
                        this.#buffer.resize(newCacheSize, visible.ids);
                        this.renderingQueue.renderHighestPriority(visible);
                        const isSimpleLayout = this._spreadMode === _ui_utils.SpreadMode.NONE && (this._scrollMode === _ui_utils.ScrollMode.PAGE || this._scrollMode === _ui_utils.ScrollMode.VERTICAL);
                        const currentId = this._currentPageNumber;
                        let stillFullyVisible = false;
                        for (const page of visiblePages) {
                            if (page.percent < 100) {
                                break;
                            }
                            if (page.id === currentId && isSimpleLayout) {
                                stillFullyVisible = true;
                                break;
                            }
                        }
                        this._setCurrentPageNumber(stillFullyVisible ? currentId : visiblePages[0].id);
                        this._updateLocation(visible.first);
                        this.eventBus.dispatch("updateviewarea", {
                            source: this,
                            location: this._location
                        });
                    }

                    containsElement(element) {
                        return this.container.contains(element);
                    }

                    focus() {
                        this.container.focus();
                    }

                    get _isContainerRtl() {
                        return getComputedStyle(this.container).direction === "rtl";
                    }

                    get isInPresentationMode() {
                        return this.presentationModeState === _ui_utils.PresentationModeState.FULLSCREEN;
                    }

                    get isChangingPresentationMode() {
                        return this.presentationModeState === _ui_utils.PresentationModeState.CHANGING;
                    }

                    get isHorizontalScrollbarEnabled() {
                        return this.isInPresentationMode ? false : this.container.scrollWidth > this.container.clientWidth;
                    }

                    get isVerticalScrollbarEnabled() {
                        return this.isInPresentationMode ? false : this.container.scrollHeight > this.container.clientHeight;
                    }

                    _getVisiblePages() {
                        const views = this._scrollMode === _ui_utils.ScrollMode.PAGE ? this.#scrollModePageState.pages : this._pages,
                            horizontal = this._scrollMode === _ui_utils.ScrollMode.HORIZONTAL,
                            rtl = horizontal && this._isContainerRtl;
                        return (0, _ui_utils.getVisibleElements)({
                            scrollEl: this.container,
                            views,
                            sortByVisibility: true,
                            horizontal,
                            rtl
                        });
                    }

                    cleanup() {
                        for (const pageView of this._pages) {
                            if (pageView.renderingState !== _ui_utils.RenderingStates.FINISHED) {
                                pageView.reset();
                            }
                        }
                    }

                    _cancelRendering() {
                        for (const pageView of this._pages) {
                            pageView.cancelRendering();
                        }
                    }

                    async #ensurePdfPageLoaded(pageView) {
                        if (pageView.pdfPage) {
                            return pageView.pdfPage;
                        }
                        try {
                            const pdfPage = await this.pdfDocument.getPage(pageView.id);
                            if (!pageView.pdfPage) {
                                pageView.setPdfPage(pdfPage);
                            }
                            if (!this.linkService._cachedPageNumber?.(pdfPage.ref)) {
                                this.linkService.cachePageRef(pageView.id, pdfPage.ref);
                            }
                            return pdfPage;
                        } catch (reason) {
                            console.error("Unable to get page for page view", reason);
                            return null;
                        }
                    }

                    #getScrollAhead(visible) {
                        if (visible.first?.id === 1) {
                            return true;
                        } else if (visible.last?.id === this.pagesCount) {
                            return false;
                        }
                        switch (this._scrollMode) {
                            case _ui_utils.ScrollMode.PAGE:
                                return this.#scrollModePageState.scrollDown;
                            case _ui_utils.ScrollMode.HORIZONTAL:
                                return this.scroll.right;
                        }
                        return this.scroll.down;
                    }

                    forceRendering(currentlyVisiblePages) {
                        const visiblePages = currentlyVisiblePages || this._getVisiblePages();
                        const scrollAhead = this.#getScrollAhead(visiblePages);
                        const preRenderExtra = this._spreadMode !== _ui_utils.SpreadMode.NONE && this._scrollMode !== _ui_utils.ScrollMode.HORIZONTAL;
                        const pageView = this.renderingQueue.getHighestPriority(visiblePages, this._pages, scrollAhead, preRenderExtra);
                        if (pageView) {
                            this.#ensurePdfPageLoaded(pageView).then(() => {
                                this.renderingQueue.renderView(pageView);
                            });
                            return true;
                        }
                        return false;
                    }

                    get hasEqualPageSizes() {
                        const firstPageView = this._pages[0];
                        for (let i = 1, ii = this._pages.length; i < ii; ++i) {
                            const pageView = this._pages[i];
                            if (pageView.width !== firstPageView.width || pageView.height !== firstPageView.height) {
                                return false;
                            }
                        }
                        return true;
                    }

                    getPagesOverview() {
                        let initialOrientation;
                        return this._pages.map(pageView => {
                            const viewport = pageView.pdfPage.getViewport({
                                scale: 1
                            });
                            const orientation = (0, _ui_utils.isPortraitOrientation)(viewport);
                            if (initialOrientation === undefined) {
                                initialOrientation = orientation;
                            } else if (this.enablePrintAutoRotate && orientation !== initialOrientation) {
                                return {
                                    width: viewport.height,
                                    height: viewport.width,
                                    rotation: (viewport.rotation - 90) % 360
                                };
                            }
                            return {
                                width: viewport.width,
                                height: viewport.height,
                                rotation: viewport.rotation
                            };
                        });
                    }

                    get optionalContentConfigPromise() {
                        if (!this.pdfDocument) {
                            return Promise.resolve(null);
                        }
                        if (!this._optionalContentConfigPromise) {
                            console.error("optionalContentConfigPromise: Not initialized yet.");
                            return this.pdfDocument.getOptionalContentConfig();
                        }
                        return this._optionalContentConfigPromise;
                    }

                    set optionalContentConfigPromise(promise) {
                        if (!(promise instanceof Promise)) {
                            throw new Error(`Invalid optionalContentConfigPromise: ${promise}`);
                        }
                        if (!this.pdfDocument) {
                            return;
                        }
                        if (!this._optionalContentConfigPromise) {
                            return;
                        }
                        this._optionalContentConfigPromise = promise;
                        this.refresh(false, {
                            optionalContentConfigPromise: promise
                        });
                        this.eventBus.dispatch("optionalcontentconfigchanged", {
                            source: this,
                            promise
                        });
                    }

                    get scrollMode() {
                        return this._scrollMode;
                    }

                    set scrollMode(mode) {
                        if (this._scrollMode === mode) {
                            return;
                        }
                        if (!(0, _ui_utils.isValidScrollMode)(mode)) {
                            throw new Error(`Invalid scroll mode: ${mode}`);
                        }
                        if (this.pagesCount > PagesCountLimit.FORCE_SCROLL_MODE_PAGE) {
                            return;
                        }
                        this._previousScrollMode = this._scrollMode;
                        this._scrollMode = mode;
                        this.eventBus.dispatch("scrollmodechanged", {
                            source: this,
                            mode
                        });
                        this._updateScrollMode(this._currentPageNumber);
                    }

                    _updateScrollMode(pageNumber = null) {
                        const scrollMode = this._scrollMode,
                            viewer = this.viewer;
                        viewer.classList.toggle("scrollHorizontal", scrollMode === _ui_utils.ScrollMode.HORIZONTAL);
                        viewer.classList.toggle("scrollWrapped", scrollMode === _ui_utils.ScrollMode.WRAPPED);
                        if (!this.pdfDocument || !pageNumber) {
                            return;
                        }
                        if (scrollMode === _ui_utils.ScrollMode.PAGE) {
                            this.#ensurePageViewVisible();
                        } else if (this._previousScrollMode === _ui_utils.ScrollMode.PAGE) {
                            this._updateSpreadMode();
                        }
                        if (this._currentScaleValue && isNaN(this._currentScaleValue)) {
                            this.#setScale(this._currentScaleValue, {
                                noScroll: true
                            });
                        }
                        this._setCurrentPageNumber(pageNumber, true);
                        this.update();
                    }

                    get spreadMode() {
                        return this._spreadMode;
                    }

                    set spreadMode(mode) {
                        if (this._spreadMode === mode) {
                            return;
                        }
                        if (!(0, _ui_utils.isValidSpreadMode)(mode)) {
                            throw new Error(`Invalid spread mode: ${mode}`);
                        }
                        this._spreadMode = mode;
                        this.eventBus.dispatch("spreadmodechanged", {
                            source: this,
                            mode
                        });
                        this._updateSpreadMode(this._currentPageNumber);
                    }

                    _updateSpreadMode(pageNumber = null) {
                        if (!this.pdfDocument) {
                            return;
                        }
                        const viewer = this.viewer,
                            pages = this._pages;
                        if (this._scrollMode === _ui_utils.ScrollMode.PAGE) {
                            this.#ensurePageViewVisible();
                        } else {
                            viewer.textContent = "";
                            if (this._spreadMode === _ui_utils.SpreadMode.NONE) {
                                for (const pageView of this._pages) {
                                    viewer.append(pageView.div);
                                }
                            } else {
                                const parity = this._spreadMode - 1;
                                let spread = null;
                                for (let i = 0, ii = pages.length; i < ii; ++i) {
                                    if (spread === null) {
                                        spread = document.createElement("div");
                                        spread.className = "spread";
                                        viewer.append(spread);
                                    } else if (i % 2 === parity) {
                                        spread = spread.cloneNode(false);
                                        viewer.append(spread);
                                    }
                                    spread.append(pages[i].div);
                                }
                            }
                        }
                        if (!pageNumber) {
                            return;
                        }
                        if (this._currentScaleValue && isNaN(this._currentScaleValue)) {
                            this.#setScale(this._currentScaleValue, {
                                noScroll: true
                            });
                        }
                        this._setCurrentPageNumber(pageNumber, true);
                        this.update();
                    }

                    _getPageAdvance(currentPageNumber, previous = false) {
                        switch (this._scrollMode) {
                            case _ui_utils.ScrollMode.WRAPPED: {
                                const {
                                        views
                                    } = this._getVisiblePages(),
                                    pageLayout = new Map();
                                for (const {
                                    id,
                                    y,
                                    percent,
                                    widthPercent
                                } of views) {
                                    if (percent === 0 || widthPercent < 100) {
                                        continue;
                                    }
                                    let yArray = pageLayout.get(y);
                                    if (!yArray) {
                                        pageLayout.set(y, yArray ||= []);
                                    }
                                    yArray.push(id);
                                }
                                for (const yArray of pageLayout.values()) {
                                    const currentIndex = yArray.indexOf(currentPageNumber);
                                    if (currentIndex === -1) {
                                        continue;
                                    }
                                    const numPages = yArray.length;
                                    if (numPages === 1) {
                                        break;
                                    }
                                    if (previous) {
                                        for (let i = currentIndex - 1, ii = 0; i >= ii; i--) {
                                            const currentId = yArray[i],
                                                expectedId = yArray[i + 1] - 1;
                                            if (currentId < expectedId) {
                                                return currentPageNumber - expectedId;
                                            }
                                        }
                                    } else {
                                        for (let i = currentIndex + 1, ii = numPages; i < ii; i++) {
                                            const currentId = yArray[i],
                                                expectedId = yArray[i - 1] + 1;
                                            if (currentId > expectedId) {
                                                return expectedId - currentPageNumber;
                                            }
                                        }
                                    }
                                    if (previous) {
                                        const firstId = yArray[0];
                                        if (firstId < currentPageNumber) {
                                            return currentPageNumber - firstId + 1;
                                        }
                                    } else {
                                        const lastId = yArray[numPages - 1];
                                        if (lastId > currentPageNumber) {
                                            return lastId - currentPageNumber + 1;
                                        }
                                    }
                                    break;
                                }
                                break;
                            }
                            case _ui_utils.ScrollMode.HORIZONTAL: {
                                break;
                            }
                            case _ui_utils.ScrollMode.PAGE:
                            case _ui_utils.ScrollMode.VERTICAL: {
                                if (this._spreadMode === _ui_utils.SpreadMode.NONE) {
                                    break;
                                }
                                const parity = this._spreadMode - 1;
                                if (previous && currentPageNumber % 2 !== parity) {
                                    break;
                                } else if (!previous && currentPageNumber % 2 === parity) {
                                    break;
                                }
                                const {
                                        views
                                    } = this._getVisiblePages(),
                                    expectedId = previous ? currentPageNumber - 1 : currentPageNumber + 1;
                                for (const {
                                    id,
                                    percent,
                                    widthPercent
                                } of views) {
                                    if (id !== expectedId) {
                                        continue;
                                    }
                                    if (percent > 0 && widthPercent === 100) {
                                        return 2;
                                    }
                                    break;
                                }
                                break;
                            }
                        }
                        return 1;
                    }

                    nextPage() {
                        const currentPageNumber = this._currentPageNumber,
                            pagesCount = this.pagesCount;
                        if (currentPageNumber >= pagesCount) {
                            return false;
                        }
                        const advance = this._getPageAdvance(currentPageNumber, false) || 1;
                        this.currentPageNumber = Math.min(currentPageNumber + advance, pagesCount);
                        return true;
                    }

                    previousPage() {
                        const currentPageNumber = this._currentPageNumber;
                        if (currentPageNumber <= 1) {
                            return false;
                        }
                        const advance = this._getPageAdvance(currentPageNumber, true) || 1;
                        this.currentPageNumber = Math.max(currentPageNumber - advance, 1);
                        return true;
                    }

                    increaseScale({
                                      drawingDelay,
                                      scaleFactor,
                                      steps
                                  } = {}) {
                        if (!this.pdfDocument) {
                            return;
                        }
                        let newScale = this._currentScale;
                        if (scaleFactor > 1) {
                            newScale = Math.round(newScale * scaleFactor * 100) / 100;
                        } else {
                            steps ??= 1;
                            do {
                                newScale = Math.ceil((newScale * _ui_utils.DEFAULT_SCALE_DELTA).toFixed(2) * 10) / 10;
                            } while (--steps > 0 && newScale < _ui_utils.MAX_SCALE);
                        }
                        this.#setScale(Math.min(_ui_utils.MAX_SCALE, newScale), {
                            noScroll: false,
                            drawingDelay
                        });
                    }

                    decreaseScale({
                                      drawingDelay,
                                      scaleFactor,
                                      steps
                                  } = {}) {
                        if (!this.pdfDocument) {
                            return;
                        }
                        let newScale = this._currentScale;
                        if (scaleFactor > 0 && scaleFactor < 1) {
                            newScale = Math.round(newScale * scaleFactor * 100) / 100;
                        } else {
                            steps ??= 1;
                            do {
                                newScale = Math.floor((newScale / _ui_utils.DEFAULT_SCALE_DELTA).toFixed(2) * 10) / 10;
                            } while (--steps > 0 && newScale > _ui_utils.MIN_SCALE);
                        }
                        this.#setScale(Math.max(_ui_utils.MIN_SCALE, newScale), {
                            noScroll: false,
                            drawingDelay
                        });
                    }

                    #updateContainerHeightCss(height = this.container.clientHeight) {
                        if (height !== this.#previousContainerHeight) {
                            this.#previousContainerHeight = height;
                            _ui_utils.docStyle.setProperty("--viewer-container-height", `${height}px`);
                        }
                    }

                    #resizeObserverCallback(entries) {
                        for (const entry of entries) {
                            if (entry.target === this.container) {
                                this.#updateContainerHeightCss(Math.floor(entry.borderBoxSize[0].blockSize));
                                this.#containerTopLeft = null;
                                break;
                            }
                        }
                    }

                    get containerTopLeft() {
                        return this.#containerTopLeft ||= [this.container.offsetTop, this.container.offsetLeft];
                    }

                    get annotationEditorMode() {
                        return this.#annotationEditorUIManager ? this.#annotationEditorMode : _pdfjsLib.AnnotationEditorType.DISABLE;
                    }

                    set annotationEditorMode({
                                                 mode,
                                                 editId = null
                                             }) {
                        if (!this.#annotationEditorUIManager) {
                            throw new Error(`The AnnotationEditor is not enabled.`);
                        }
                        if (this.#annotationEditorMode === mode) {
                            return;
                        }
                        if (!isValidAnnotationEditorMode(mode)) {
                            throw new Error(`Invalid AnnotationEditor mode: ${mode}`);
                        }
                        if (!this.pdfDocument) {
                            return;
                        }
                        this.#annotationEditorMode = mode;
                        this.eventBus.dispatch("annotationeditormodechanged", {
                            source: this,
                            mode
                        });
                        this.#annotationEditorUIManager.updateMode(mode, editId);
                    }

                    set annotationEditorParams({
                                                   type,
                                                   value
                                               }) {
                        if (!this.#annotationEditorUIManager) {
                            throw new Error(`The AnnotationEditor is not enabled.`);
                        }
                        this.#annotationEditorUIManager.updateParams(type, value);
                    }

                    refresh(noUpdate = false, updateArgs = Object.create(null)) {
                        if (!this.pdfDocument) {
                            return;
                        }
                        for (const pageView of this._pages) {
                            pageView.update(updateArgs);
                        }
                        if (this.#scaleTimeoutId !== null) {
                            clearTimeout(this.#scaleTimeoutId);
                            this.#scaleTimeoutId = null;
                        }
                        if (!noUpdate) {
                            this.update();
                        }
                    }
                }

                exports.PDFViewer = PDFViewer;

                /***/
            }),
            /* 26 */
            /***/ ((__unused_webpack_module, exports, __w_pdfjs_require__) => {


                Object.defineProperty(exports, "__esModule", ({
                    value: true
                }));
                exports.PDFRenderingQueue = void 0;
                var _pdfjsLib = __w_pdfjs_require__(4);
                var _ui_utils = __w_pdfjs_require__(2);
                const CLEANUP_TIMEOUT = 30000;

                class PDFRenderingQueue {
                    constructor() {
                        this.pdfViewer = null;
                        this.pdfThumbnailViewer = null;
                        this.onIdle = null;
                        this.highestPriorityPage = null;
                        this.idleTimeout = null;
                        this.printing = false;
                        this.isThumbnailViewEnabled = false;
                        Object.defineProperty(this, "hasViewer", {
                            value: () => !!this.pdfViewer
                        });
                    }

                    setViewer(pdfViewer) {
                        this.pdfViewer = pdfViewer;
                    }

                    setThumbnailViewer(pdfThumbnailViewer) {
                        this.pdfThumbnailViewer = pdfThumbnailViewer;
                    }

                    isHighestPriority(view) {
                        return this.highestPriorityPage === view.renderingId;
                    }

                    renderHighestPriority(currentlyVisiblePages) {
                        if (this.idleTimeout) {
                            clearTimeout(this.idleTimeout);
                            this.idleTimeout = null;
                        }
                        if (this.pdfViewer.forceRendering(currentlyVisiblePages)) {
                            return;
                        }
                        if (this.isThumbnailViewEnabled && this.pdfThumbnailViewer?.forceRendering()) {
                            return;
                        }
                        if (this.printing) {
                            return;
                        }
                        if (this.onIdle) {
                            this.idleTimeout = setTimeout(this.onIdle.bind(this), CLEANUP_TIMEOUT);
                        }
                    }

                    getHighestPriority(visible, views, scrolledDown, preRenderExtra = false) {
                        const visibleViews = visible.views,
                            numVisible = visibleViews.length;
                        if (numVisible === 0) {
                            return null;
                        }
                        for (let i = 0; i < numVisible; i++) {
                            const view = visibleViews[i].view;
                            if (!this.isViewFinished(view)) {
                                return view;
                            }
                        }
                        const firstId = visible.first.id,
                            lastId = visible.last.id;
                        if (lastId - firstId + 1 > numVisible) {
                            const visibleIds = visible.ids;
                            for (let i = 1, ii = lastId - firstId; i < ii; i++) {
                                const holeId = scrolledDown ? firstId + i : lastId - i;
                                if (visibleIds.has(holeId)) {
                                    continue;
                                }
                                const holeView = views[holeId - 1];
                                if (!this.isViewFinished(holeView)) {
                                    return holeView;
                                }
                            }
                        }
                        let preRenderIndex = scrolledDown ? lastId : firstId - 2;
                        let preRenderView = views[preRenderIndex];
                        if (preRenderView && !this.isViewFinished(preRenderView)) {
                            return preRenderView;
                        }
                        if (preRenderExtra) {
                            preRenderIndex += scrolledDown ? 1 : -1;
                            preRenderView = views[preRenderIndex];
                            if (preRenderView && !this.isViewFinished(preRenderView)) {
                                return preRenderView;
                            }
                        }
                        return null;
                    }

                    isViewFinished(view) {
                        return view.renderingState === _ui_utils.RenderingStates.FINISHED;
                    }

                    renderView(view) {
                        switch (view.renderingState) {
                            case _ui_utils.RenderingStates.FINISHED:
                                return false;
                            case _ui_utils.RenderingStates.PAUSED:
                                this.highestPriorityPage = view.renderingId;
                                view.resume();
                                break;
                            case _ui_utils.RenderingStates.RUNNING:
                                this.highestPriorityPage = view.renderingId;
                                break;
                            case _ui_utils.RenderingStates.INITIAL:
                                this.highestPriorityPage = view.renderingId;
                                view.draw().finally(() => {
                                    this.renderHighestPriority();
                                }).catch(reason => {
                                    if (reason instanceof _pdfjsLib.RenderingCancelledException) {
                                        return;
                                    }
                                    console.error(`renderView: "${reason}"`);
                                });
                                break;
                        }
                        return true;
                    }
                }

                exports.PDFRenderingQueue = PDFRenderingQueue;

                /***/
            })
            /******/]);
        /************************************************************************/
        /******/ 	// The module cache
        /******/
        var __webpack_module_cache__ = {};
        /******/
        /******/ 	// The require function
        /******/
        function __w_pdfjs_require__(moduleId) {
            /******/ 		// Check if module is in cache
            /******/
            var cachedModule = __webpack_module_cache__[moduleId];
            /******/
            if (cachedModule !== undefined) {
                /******/
                return cachedModule.exports;
                /******/
            }
            /******/ 		// Create a new module (and put it into the cache)
            /******/
            var module = __webpack_module_cache__[moduleId] = {
                /******/ 			// no module.id needed
                /******/ 			// no module.loaded needed
                /******/            exports: {}
                /******/
            };
            /******/
            /******/ 		// Execute the module function
            /******/
            __webpack_modules__[moduleId](module, module.exports, __w_pdfjs_require__);
            /******/
            /******/ 		// Return the exports of the module
            /******/
            return module.exports;
            /******/
        }

        /******/
        /************************************************************************/
        var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
        (() => {
            var exports = __webpack_exports__;


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            Object.defineProperty(exports, "AnnotationLayerBuilder", ({
                enumerable: true,
                get: function () {
                    return _annotation_layer_builder.AnnotationLayerBuilder;
                }
            }));
            Object.defineProperty(exports, "DownloadManager", ({
                enumerable: true,
                get: function () {
                    return _download_manager.DownloadManager;
                }
            }));
            Object.defineProperty(exports, "EventBus", ({
                enumerable: true,
                get: function () {
                    return _event_utils.EventBus;
                }
            }));
            Object.defineProperty(exports, "FindState", ({
                enumerable: true,
                get: function () {
                    return _pdf_find_controller.FindState;
                }
            }));
            Object.defineProperty(exports, "GenericL10n", ({
                enumerable: true,
                get: function () {
                    return _genericl10n.GenericL10n;
                }
            }));
            Object.defineProperty(exports, "LinkTarget", ({
                enumerable: true,
                get: function () {
                    return _pdf_link_service.LinkTarget;
                }
            }));
            Object.defineProperty(exports, "NullL10n", ({
                enumerable: true,
                get: function () {
                    return _l10n_utils.NullL10n;
                }
            }));
            Object.defineProperty(exports, "PDFFindController", ({
                enumerable: true,
                get: function () {
                    return _pdf_find_controller.PDFFindController;
                }
            }));
            Object.defineProperty(exports, "PDFHistory", ({
                enumerable: true,
                get: function () {
                    return _pdf_history.PDFHistory;
                }
            }));
            Object.defineProperty(exports, "PDFLinkService", ({
                enumerable: true,
                get: function () {
                    return _pdf_link_service.PDFLinkService;
                }
            }));
            Object.defineProperty(exports, "PDFPageView", ({
                enumerable: true,
                get: function () {
                    return _pdf_page_view.PDFPageView;
                }
            }));
            Object.defineProperty(exports, "PDFScriptingManager", ({
                enumerable: true,
                get: function () {
                    return _pdf_scripting_managerComponent.PDFScriptingManager;
                }
            }));
            Object.defineProperty(exports, "PDFSinglePageViewer", ({
                enumerable: true,
                get: function () {
                    return _pdf_single_page_viewer.PDFSinglePageViewer;
                }
            }));
            Object.defineProperty(exports, "PDFViewer", ({
                enumerable: true,
                get: function () {
                    return _pdf_viewer.PDFViewer;
                }
            }));
            Object.defineProperty(exports, "ProgressBar", ({
                enumerable: true,
                get: function () {
                    return _ui_utils.ProgressBar;
                }
            }));
            Object.defineProperty(exports, "RenderingStates", ({
                enumerable: true,
                get: function () {
                    return _ui_utils.RenderingStates;
                }
            }));
            Object.defineProperty(exports, "ScrollMode", ({
                enumerable: true,
                get: function () {
                    return _ui_utils.ScrollMode;
                }
            }));
            Object.defineProperty(exports, "SimpleLinkService", ({
                enumerable: true,
                get: function () {
                    return _pdf_link_service.SimpleLinkService;
                }
            }));
            Object.defineProperty(exports, "SpreadMode", ({
                enumerable: true,
                get: function () {
                    return _ui_utils.SpreadMode;
                }
            }));
            Object.defineProperty(exports, "StructTreeLayerBuilder", ({
                enumerable: true,
                get: function () {
                    return _struct_tree_layer_builder.StructTreeLayerBuilder;
                }
            }));
            Object.defineProperty(exports, "TextLayerBuilder", ({
                enumerable: true,
                get: function () {
                    return _text_layer_builder.TextLayerBuilder;
                }
            }));
            Object.defineProperty(exports, "XfaLayerBuilder", ({
                enumerable: true,
                get: function () {
                    return _xfa_layer_builder.XfaLayerBuilder;
                }
            }));
            Object.defineProperty(exports, "parseQueryString", ({
                enumerable: true,
                get: function () {
                    return _ui_utils.parseQueryString;
                }
            }));
            var _pdf_find_controller = __w_pdfjs_require__(1);
            var _pdf_link_service = __w_pdfjs_require__(5);
            var _ui_utils = __w_pdfjs_require__(2);
            var _annotation_layer_builder = __w_pdfjs_require__(6);
            var _download_manager = __w_pdfjs_require__(8);
            var _event_utils = __w_pdfjs_require__(9);
            var _genericl10n = __w_pdfjs_require__(10);
            var _l10n_utils = __w_pdfjs_require__(7);
            var _pdf_history = __w_pdfjs_require__(12);
            var _pdf_page_view = __w_pdfjs_require__(13);
            var _pdf_scripting_managerComponent = __w_pdfjs_require__(21);
            var _pdf_single_page_viewer = __w_pdfjs_require__(24);
            var _pdf_viewer = __w_pdfjs_require__(25);
            var _struct_tree_layer_builder = __w_pdfjs_require__(16);
            var _text_layer_builder = __w_pdfjs_require__(19);
            var _xfa_layer_builder = __w_pdfjs_require__(20);
            const pdfjsVersion = '3.11.174';
            const pdfjsBuild = 'ce8716743';
        })();

        /******/
        return __webpack_exports__;
        /******/
    })()
        ;
});
//# sourceMappingURL=pdf_viewer.js.map