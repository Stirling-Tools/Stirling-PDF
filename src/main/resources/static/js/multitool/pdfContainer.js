import DragDropManager from "./dragDrop.js";
import scrollDivHorizontally from "./horizontalScroll.js";
import getImageHighlighterCallback from "./imageHighlighter.js";
import PdfActionsManager from './pdfActions.js';

const createPdfContainer = (id, wrapperId, highlighterId, dragElId) => {
    var fileName = null;
    const pagesContainer = document.getElementById(id);
    const pagesContainerWrapper = document.getElementById(wrapperId);


    const movePageTo = (startElement, endElement, scrollTo = false) => {
        const childArray = Array.from(pagesContainer.childNodes);
        const startIndex = childArray.indexOf(startElement);
        const endIndex = childArray.indexOf(endElement);
        pagesContainer.removeChild(startElement);
        if(!endElement) {
            pagesContainer.append(startElement);
        } else {
            pagesContainer.insertBefore(startElement, endElement);
        }

        if(scrollTo) {
            const { width } = startElement.getBoundingClientRect();
            const vector = (endIndex !== -1 && startIndex > endIndex)
                ?  0-width
                : width;
            
            pagesContainerWrapper.scroll({
                left: pagesContainerWrapper.scrollLeft + vector,
            })
        }
    }

    function addPdfs(nextSiblingElement) {
        var input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.setAttribute("accept", "application/pdf");

        input.onchange = async(e) => {
            const files = e.target.files;
            fileName = files[0].name;
            for (var i=0; i < files.length; i++) {
                addPdfFile(files[i], nextSiblingElement);
            }

            document.querySelectorAll(".enable-on-file").forEach(element => {
                element.disabled = false;
            });
        }

        input.click();
    }

    function rotateElement(element, deg) {
        var lastTransform = element.style.rotate;
        if (!lastTransform) {
            lastTransform = "0";
        }
        const lastAngle = parseInt(lastTransform.replace(/[^\d-]/g, ''));
        const newAngle = lastAngle + deg;

        element.style.rotate = newAngle + "deg";
    }
    
    scrollDivHorizontally(wrapperId);

    var imageHighlighterCallback;
    if (highlighterId) {
        imageHighlighterCallback = getImageHighlighterCallback(highlighterId);
    }
    var dragDropManager;
    if(dragElId) {
        dragDropManager = new DragDropManager('drag-container', movePageTo);
    }

    var pdfActionManager = new PdfActionsManager('page-container', { movePageTo, addPdfs, rotateElement });

    async function addPdfFile(file, nextSiblingElement) {
        const { renderer, pdfDocument } = await loadFile(file);

        for (var i=0; i < renderer.pageCount; i++) {
            const div = document.createElement('div');

            div.classList.add("page-container");

            var img = document.createElement('img');
            img.classList.add('page-image')
            const imageSrc = await renderer.renderPage(i)
            img.src = imageSrc;
            img.pageIdx = i;
            img.rend = renderer;
            img.doc = pdfDocument;
            div.appendChild(img);

            
            if(dragDropManager) {
                dragDropManager.attachDragDropCallbacks(div, imageSrc);
            }

            /**
             *  Making pages larger when clicking on them
             */
            if(imageHighlighterCallback) {
                img.addEventListener('click', imageHighlighterCallback)
            }

            /**
             *  Rendering the various buttons to manipulate and move pdf pages
             */
            pdfActionManager.attachPDFActions(div);

            if (nextSiblingElement) {
                pagesContainer.insertBefore(div, nextSiblingElement);
            } else {
                pagesContainer.appendChild(div);
            }
        }
    }

    async function toRenderer(objectUrl) {
        const pdf = await pdfjsLib.getDocument(objectUrl).promise;
        return {
            document: pdf,
            pageCount: pdf.numPages,
            renderPage: async function(pageIdx) {
                const page = await this.document.getPage(pageIdx+1);

                const canvas = document.createElement("canvas");

                // set the canvas size to the size of the page
                if (page.rotate == 90 || page.rotate == 270) {
                    canvas.width = page.view[3];
                    canvas.height = page.view[2];
                } else {
                    canvas.width = page.view[2];
                    canvas.height = page.view[3];
                }

                // render the page onto the canvas
                var renderContext = {
                    canvasContext: canvas.getContext("2d"),
                    viewport: page.getViewport({ scale: 1 })
                };

                await page.render(renderContext).promise;
                return canvas.toDataURL();
            }
        };
    }

    async function toPdfLib(objectUrl) {
        const existingPdfBytes = await fetch(objectUrl).then(res => res.arrayBuffer());
        const pdfDoc = await PDFLib.PDFDocument.load(existingPdfBytes);
        return pdfDoc;
    }

    async function loadFile(file) {
        var objectUrl = URL.createObjectURL(file);
        var pdfDocument = await toPdfLib(objectUrl);
        var renderer = await toRenderer(objectUrl);
        return { renderer, pdfDocument };
    }

    function rotateAll(deg) {
        for (var i=0; i<pagesContainer.childNodes.length; i++) {
            const img = pagesContainer.childNodes[i].querySelector("img");
            if (!img) continue;
            rotateElement(img, deg)
        }
    }

    async function exportPdf() {
        const pdfDoc = await PDFLib.PDFDocument.create();
        for (var i=0; i<pagesContainer.childNodes.length; i++) {
            const img = pagesContainer.childNodes[i].querySelector("img");
            if (!img) continue;
            const pages = await pdfDoc.copyPages(img.doc, [img.pageIdx])
            const page = pages[0];

            const rotation = img.style.rotate;
            if (rotation) {
                const rotationAngle = parseInt(rotation.replace(/[^\d-]/g, ''));
                page.setRotation(PDFLib.degrees(page.getRotation().angle + rotationAngle))
            }
            
            pdfDoc.addPage(page);
        }
        const pdfBytes = await pdfDoc.save();
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);
        const downloadOption = localStorage.getItem('downloadOption');

        if (downloadOption === 'sameWindow') {
            // Open the file in the same window
            window.location.href = url;
        } else if (downloadOption === 'newWindow') {
            // Open the file in a new window
            window.open(url, '_blank');
        } else {
            // Download the file
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = fileName ? fileName : 'managed.pdf';
            downloadLink.click();
        }
    }

    return {
        addPdfs,
        rotateAll,
        exportPdf,
    }
}

export default createPdfContainer;
