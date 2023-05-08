const DraggableUtils = {

    boxDragContainer: document.getElementById('box-drag-container'),
    pdfCanvas: document.getElementById('pdf-canvas'),
    nextId: 0,
    pdfDoc: null,
    pageIndex: 0,

    init() {
        interact('.draggable-canvas')
        .draggable({
            listeners: {
                move: (event) => {
                    const target = event.target;
                    const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                    const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;

                    target.style.transform = `translate(${x}px, ${y}px)`;
                    target.setAttribute('data-x', x);
                    target.setAttribute('data-y', y);

                    this.onInteraction(target);
                },
            },
        })
        .resizable({
            edges: { left: true, right: true, bottom: true, top: true },
            listeners: {
                move: (event) => {
                    var target = event.target
                    var x = (parseFloat(target.getAttribute('data-x')) || 0)
                    var y = (parseFloat(target.getAttribute('data-y')) || 0)

                    // update the element's style
                    target.style.width = event.rect.width + 'px'
                    target.style.height = event.rect.height + 'px'

                    // translate when resizing from top or left edges
                    x += event.deltaRect.left
                    y += event.deltaRect.top

                    target.style.transform = 'translate(' + x + 'px,' + y + 'px)'

                    target.setAttribute('data-x', x)
                    target.setAttribute('data-y', y)
                    target.textContent = Math.round(event.rect.width) + '\u00D7' + Math.round(event.rect.height)

                    this.onInteraction(target);
                },
            },
            modifiers: [
                interact.modifiers.restrictSize({
                    min: { width: 50, height: 50 },
                }),
            ],
            inertia: true,
        });
    },
    onInteraction(target) {
        this.boxDragContainer.appendChild(target);
    },

    createDraggableCanvas() {
        const createdCanvas = document.createElement('canvas');
        createdCanvas.id = `draggable-canvas-${this.nextId++}`;
        createdCanvas.classList.add("draggable-canvas");

        const x = 0;
        const y = 20;
        createdCanvas.style.transform = `translate(${x}px, ${y}px)`;
        createdCanvas.setAttribute('data-x', x);
        createdCanvas.setAttribute('data-y', y);

        createdCanvas.onclick = e => this.onInteraction(e.target);

        this.boxDragContainer.appendChild(createdCanvas);
        return createdCanvas;
    },
    createDraggableCanvasFromUrl(dataUrl) {
        return new Promise((resolve) => {
            var myImage = new Image();
            myImage.src = dataUrl;
            myImage.onload = () => {
                var createdCanvas = this.createDraggableCanvas();

                createdCanvas.width = myImage.width;
                createdCanvas.height = myImage.height;

                const imgAspect = myImage.width / myImage.height;
                const pdfAspect = this.boxDragContainer.offsetWidth / this.boxDragContainer.offsetHeight;

                var scaleMultiplier;
                if (imgAspect > pdfAspect) {
                    scaleMultiplier = this.boxDragContainer.offsetWidth / myImage.width;
                } else {
                    scaleMultiplier = this.boxDragContainer.offsetHeight / myImage.height;
                }

                var newWidth = createdCanvas.width;
                var newHeight = createdCanvas.height;
                if (scaleMultiplier < 1) {
                    newWidth = newWidth * scaleMultiplier;
                    newHeight = newHeight * scaleMultiplier;
                }
                
                createdCanvas.style.width = newWidth+"px";
                createdCanvas.style.height = newHeight+"px";

                var myContext = createdCanvas.getContext("2d");
                myContext.drawImage(myImage,0,0);
                resolve(createdCanvas);
            }
        })
    },
    deleteDraggableCanvas(element) {
        if (element) {
            element.remove();
        }
    },
    deleteDraggableCanvasById(id) {
        this.deleteDraggableCanvas(document.getElementById(id));
    },
    getLastInteracted() {
        return this.boxDragContainer.querySelector(".draggable-canvas:last-of-type");
    },

    async renderPage(pdfDocument, pageIdx) {
        this.pdfDoc = pdfDocument ? pdfDocument : this.pdfDoc;
        this.pageIndex = pageIdx;
        const page = await this.pdfDoc.getPage(this.pageIndex+1);

        // set the canvas size to the size of the page
        if (page.rotate == 90 || page.rotate == 270) {
            this.pdfCanvas.width = page.view[3];
            this.pdfCanvas.height = page.view[2];
        } else {
            this.pdfCanvas.width = page.view[2];
            this.pdfCanvas.height = page.view[3];
        }

        // render the page onto the canvas
        var renderContext = {
            canvasContext: this.pdfCanvas.getContext("2d"),
            viewport: page.getViewport({ scale: 1 })
        };
        await page.render(renderContext).promise;

        //return pdfCanvas.toDataURL();
    },
    async incrementPage() {
        if (this.pageIndex < this.pdfDoc.numPages-1) {
            return await this.renderPage(this.pdfDoc, this.pageIndex+1)
        }
    },
    async decrementPage() {
        if (this.pageIndex > 0) {
            return await this.renderPage(this.pdfDoc, this.pageIndex-1)
        }
    },

    parseTransform(element) {
        const tansform = element.style.transform.replace(/[^.,-\d]/g, '');
        const transformComponents = tansform.split(",");
        return {
            x: parseFloat(transformComponents[0]),
            y: parseFloat(transformComponents[1]),
            width: element.offsetWidth,
            height: element.offsetHeight,
        }
    },
    async getOverlayedPdfDocument() {
        const pdfBytes = await this.pdfDoc.getData();
        const pdfDocModified = await PDFLib.PDFDocument.load(pdfBytes);

        const draggables = this.boxDragContainer.querySelectorAll(".draggable-canvas");
        for (const draggable of draggables) {
            // embed the draggable canvas
            const dataURL = draggable.toDataURL();
            const response = await fetch(dataURL);
            const draggableImgBytes = await response.arrayBuffer();
            const pdfImageObject = await pdfDocModified.embedPng(draggableImgBytes);

            const page = pdfDocModified.getPage(this.pageIndex);

            const draggablePositionPixels = this.parseTransform(draggable);
            const draggablePositionRelative = {
                x: draggablePositionPixels.x / this.pdfCanvas.offsetWidth,
                y: draggablePositionPixels.y / this.pdfCanvas.offsetHeight,
                width: draggablePositionPixels.width / this.pdfCanvas.offsetWidth,
                height: draggablePositionPixels.height / this.pdfCanvas.offsetHeight,
            }
            const draggablePositionPdf = {
                x: draggablePositionRelative.x * page.getWidth(),
                y: draggablePositionRelative.y * page.getHeight(),
                width: draggablePositionRelative.width * page.getWidth(),
                height: draggablePositionRelative.height * page.getHeight(),
            }

            page.drawImage(pdfImageObject, {
                x: draggablePositionPdf.x,
                y: page.getHeight() - draggablePositionPdf.y - draggablePositionPdf.height,
                width: draggablePositionPdf.width,
                height: draggablePositionPdf.height,
            });
        }

        return pdfDocModified;
    },
}

document.addEventListener("DOMContentLoaded", () => {
    DraggableUtils.init();
});
