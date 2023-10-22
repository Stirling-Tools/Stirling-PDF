/* Copyright 2014 Mozilla Foundation
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
 */

"use strict";

if (!pdfjsLib.getDocument || !pdfjsViewer.PDFPageView) {
    // eslint-disable-next-line no-alert
    alert("Please build the pdfjs-dist library using\n  `gulp dist-install`");
}

// The workerSrc property shall be specified.
//
pdfjsLib.GlobalWorkerOptions.workerSrc =
    "/pdfjs/pdf.worker.js";

// Some PDFs need external cmaps.
//
const CMAP_URL = "/pdfjs/cmaps/";
const CMAP_PACKED = true;

const DEFAULT_URL = "/pdfjs/example/compressed.tracemonkey-pldi-09.pdf";
const PAGE_TO_VIEW = 1;
const SCALE = 1.0;

const ENABLE_XFA = true;

const container = document.getElementById("pageContainer");

const eventBus = new pdfjsViewer.EventBus();

// Loading document.
const loadingTask = pdfjsLib.getDocument({
    url: DEFAULT_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: CMAP_PACKED,
    enableXfa: ENABLE_XFA,
});
(async function () {
    const pdfDocument = await loadingTask.promise;
    // Document loaded, retrieving the page.
    const pdfPage = await pdfDocument.getPage(PAGE_TO_VIEW);

    // Creating the page view with default parameters.
    const pdfPageView = new pdfjsViewer.PDFPageView({
        container,
        id: PAGE_TO_VIEW,
        scale: SCALE,
        defaultViewport: pdfPage.getViewport({scale: SCALE}),
        eventBus,
    });
    // Associate the actual page with the view, and draw it.
    pdfPageView.setPdfPage(pdfPage);
    return pdfPageView.draw();
})();