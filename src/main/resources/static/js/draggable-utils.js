const DraggableUtils = {
  boxDragContainer: document.getElementById("box-drag-container"),
  pdfCanvas: document.getElementById("pdf-canvas"),
  nextId: 0,
  pdfDoc: null,
  pageIndex: 0,
  elementAllPages: [],
  documentsMap: new Map(),
  lastInteracted: null,

  init() {
    interact(".draggable-canvas")
      .draggable({
        listeners: {
          move: (event) => {
            const target = event.target;
            const x = (parseFloat(target.getAttribute("data-bs-x")) || 0)
              + event.dx;
            const y = (parseFloat(target.getAttribute("data-bs-y")) || 0)
              + event.dy;

            target.style.transform = `translate(${x}px, ${y}px)`;
            target.setAttribute("data-bs-x", x);
            target.setAttribute("data-bs-y", y);

            this.onInteraction(target);
            //update the last interacted element
            this.lastInteracted = event.target;
          },
        },
      })
      .resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        listeners: {
          move: (event) => {
            var target = event.target;
            var x = parseFloat(target.getAttribute("data-bs-x")) || 0;
            var y = parseFloat(target.getAttribute("data-bs-y")) || 0;

            // check if control key is pressed
            if (event.ctrlKey) {
              const aspectRatio = target.offsetWidth / target.offsetHeight;
              // preserve aspect ratio
              let width = event.rect.width;
              let height = event.rect.height;

              if (Math.abs(event.deltaRect.width) >= Math.abs(
                event.deltaRect.height)) {
                height = width / aspectRatio;
              } else {
                width = height * aspectRatio;
              }

              event.rect.width = width;
              event.rect.height = height;
            }

            target.style.width = event.rect.width + "px";
            target.style.height = event.rect.height + "px";

            // translate when resizing from top or left edges
            x += event.deltaRect.left;
            y += event.deltaRect.top;

            target.style.transform = "translate(" + x + "px," + y + "px)";

            target.setAttribute("data-bs-x", x);
            target.setAttribute("data-bs-y", y);
            target.textContent = Math.round(event.rect.width) + "\u00D7"
              + Math.round(event.rect.height);

            this.onInteraction(target);
          },
        },

        modifiers: [
          interact.modifiers.restrictSize({
            min: { width: 5, height: 5 },
          }),
        ],
        inertia: true,
      });
    //Arrow key Support for Add-Image and Sign pages
    if (window.location.pathname.endsWith('sign') || window.location.pathname.endsWith('add-image')) {
      window.addEventListener('keydown', (event) => {
        //Check for last interacted element
        if (!this.lastInteracted) {
          return;
        }
        // Get the currently selected element
        const target = this.lastInteracted;

        // Step size relatively to the elements size
        const stepX = target.offsetWidth * 0.05;
        const stepY = target.offsetHeight * 0.05;

        // Get the current x and y coordinates
        let x = (parseFloat(target.getAttribute('data-bs-x')) || 0);
        let y = (parseFloat(target.getAttribute('data-bs-y')) || 0);

        // Check which key was pressed and update the coordinates accordingly
        switch (event.key) {
          case 'ArrowUp':
            y -= stepY;
            event.preventDefault(); // Prevent the default action
            break;
          case 'ArrowDown':
            y += stepY;
            event.preventDefault();
            break;
          case 'ArrowLeft':
            x -= stepX;
            event.preventDefault();
            break;
          case 'ArrowRight':
            x += stepX;
            event.preventDefault();
            break;
          default:
            return; // Listen only to arrow keys
        }

        // Update position
        target.style.transform = `translate(${x}px, ${y}px)`;
        target.setAttribute('data-bs-x', x);
        target.setAttribute('data-bs-y', y);

        DraggableUtils.onInteraction(target);
      });
    }
  },

  onInteraction(target) {
    this.boxDragContainer.appendChild(target);
  },

  createDraggableCanvas() {
    const createdCanvas = document.createElement("canvas");
    createdCanvas.id = `draggable-canvas-${this.nextId++}`;
    createdCanvas.classList.add("draggable-canvas");

    const x = 0;
    const y = 20;
    createdCanvas.style.transform = `translate(${x}px, ${y}px)`;
    createdCanvas.setAttribute("data-bs-x", x);
    createdCanvas.setAttribute("data-bs-y", y);

    //Click element in order to enable arrow keys
    createdCanvas.addEventListener('click', () => {
      this.lastInteracted = createdCanvas;
    });

    createdCanvas.onclick = (e) => this.onInteraction(e.target);

    this.boxDragContainer.appendChild(createdCanvas);

    //Enable Arrow keys directly after the element is created
    this.lastInteracted = createdCanvas;

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

        createdCanvas.style.width = newWidth + "px";
        createdCanvas.style.height = newHeight + "px";

        var myContext = createdCanvas.getContext("2d");
        myContext.drawImage(myImage, 0, 0);
        resolve(createdCanvas);
      };
    });
  },
  deleteAllDraggableCanvases() {
    this.boxDragContainer.querySelectorAll(".draggable-canvas").forEach((el) => el.remove());
  },
  async addAllPagesDraggableCanvas(element) {
    if (element) {
      let currentPage = this.pageIndex
      if (!this.elementAllPages.includes(element)) {
        this.elementAllPages.push(element)
        element.style.filter = 'sepia(1) hue-rotate(90deg) brightness(1.2)';
        let newElement = {
          "element": element,
          "offsetWidth": element.width,
          "offsetHeight": element.height
        }

        let pagesMap = this.documentsMap.get(this.pdfDoc);

        if (!pagesMap) {
          pagesMap = {};
          this.documentsMap.set(this.pdfDoc, pagesMap);
        }
        let page = this.pageIndex

        for (let pageIndex = 0; pageIndex < this.pdfDoc.numPages; pageIndex++) {

          if (pagesMap[`${pageIndex}-offsetWidth`]) {
            if (!pagesMap[pageIndex].includes(newElement)) {
              pagesMap[pageIndex].push(newElement);
            }
          } else {
            pagesMap[pageIndex] = []
            pagesMap[pageIndex].push(newElement)
            pagesMap[`${pageIndex}-offsetWidth`] = pagesMap[`${page}-offsetWidth`];
            pagesMap[`${pageIndex}-offsetHeight`] = pagesMap[`${page}-offsetHeight`];
          }
          await this.goToPage(pageIndex)
        }
      } else {
        const index = this.elementAllPages.indexOf(element);
        if (index !== -1) {
          this.elementAllPages.splice(index, 1);
        }
        element.style.filter = '';
        let pagesMap = this.documentsMap.get(this.pdfDoc);

        if (!pagesMap) {
          pagesMap = {};
          this.documentsMap.set(this.pdfDoc, pagesMap);
        }
        for (let pageIndex = 0; pageIndex < this.pdfDoc.numPages; pageIndex++) {
          if (pagesMap[`${pageIndex}-offsetWidth`] && pageIndex != currentPage) {
            const pageElements = pagesMap[pageIndex];
            pageElements.forEach(elementPage => {
              const elementIndex = pageElements.findIndex(elementPage => elementPage['element'].id === element.id);
              if (elementIndex !== -1) {
                pageElements.splice(elementIndex, 1);
              }
            });
          }
          await this.goToPage(pageIndex)
        }
      }
      await this.goToPage(currentPage)
    }
  },
  deleteDraggableCanvas(element) {
    if (element) {
      //Check if deleted element is the last interacted
      if (this.lastInteracted === element) {
        // If it is, set lastInteracted to null
        this.lastInteracted = null;
      }
      element.remove();
    }
  },
  getLastInteracted() {
    return this.boxDragContainer.querySelector(".draggable-canvas:last-of-type");
  },

  storePageContents() {
    var pagesMap = this.documentsMap.get(this.pdfDoc);
    if (!pagesMap) {
      pagesMap = {};
    }

    const elements = [...this.boxDragContainer.querySelectorAll(".draggable-canvas")];
    const draggablesData = elements.map((el) => {
      return {
        element: el,
        offsetWidth: el.offsetWidth,
        offsetHeight: el.offsetHeight,
      };
    });
    elements.forEach((el) => this.boxDragContainer.removeChild(el));

    pagesMap[this.pageIndex] = draggablesData;
    pagesMap[this.pageIndex + "-offsetWidth"] = this.pdfCanvas.offsetWidth;
    pagesMap[this.pageIndex + "-offsetHeight"] = this.pdfCanvas.offsetHeight;

    this.documentsMap.set(this.pdfDoc, pagesMap);
  },
  loadPageContents() {
    var pagesMap = this.documentsMap.get(this.pdfDoc);
    this.deleteAllDraggableCanvases();
    if (!pagesMap) {
      return;
    }

    const draggablesData = pagesMap[this.pageIndex];
    if (draggablesData && Array.isArray(draggablesData)) {
      draggablesData.forEach((draggableData) => this.boxDragContainer.appendChild(draggableData.element));
    }

    this.documentsMap.set(this.pdfDoc, pagesMap);
  },

  async renderPage(pdfDocument, pageIdx) {
    this.pdfDoc = pdfDocument ? pdfDocument : this.pdfDoc;
    this.pageIndex = pageIdx;

    // persist
    const page = await this.pdfDoc.getPage(this.pageIndex + 1);

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
      viewport: page.getViewport({ scale: 1 }),
    };
    await page.render(renderContext).promise;

    //return pdfCanvas.toDataURL();
  },

  async goToPage(pageIndex) {
    this.storePageContents();
    await this.renderPage(this.pdfDoc, pageIndex);
    this.loadPageContents();
  },

  async incrementPage() {
    if (this.pageIndex < this.pdfDoc.numPages - 1) {
      this.storePageContents();
      await this.renderPage(this.pdfDoc, this.pageIndex + 1);
      this.loadPageContents();
    }
  },
  async decrementPage() {
    if (this.pageIndex > 0) {
      this.storePageContents();
      await this.renderPage(this.pdfDoc, this.pageIndex - 1);
      this.loadPageContents();
    }
  },

  parseTransform(element) { },
  async getOverlayedPdfDocument() {
    const pdfBytes = await this.pdfDoc.getData();
    const pdfDocModified = await PDFLib.PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
    });
    this.storePageContents();

    const pagesMap = this.documentsMap.get(this.pdfDoc);

    for (let pageIdx in pagesMap) {
      if (pageIdx.includes("offset")) {
        continue;
      }
      console.log(typeof pageIdx);

      const page = pdfDocModified.getPage(parseInt(pageIdx));
      let draggablesData = pagesMap[pageIdx];

      const offsetWidth = pagesMap[pageIdx + "-offsetWidth"];
      const offsetHeight = pagesMap[pageIdx + "-offsetHeight"];


      for (const draggableData of draggablesData) {
        // embed the draggable canvas
        const draggableElement = draggableData.element;
        const response = await fetch(draggableElement.toDataURL());
        const draggableImgBytes = await response.arrayBuffer();
        const pdfImageObject = await pdfDocModified.embedPng(draggableImgBytes);

        // calculate the position in the pdf document
        const tansform = draggableElement.style.transform.replace(/[^.,-\d]/g, "");
        const transformComponents = tansform.split(",");
        const draggablePositionPixels = {
          x: parseFloat(transformComponents[0]),
          y: parseFloat(transformComponents[1]),
          width: draggableData.offsetWidth,
          height: draggableData.offsetHeight,
        };

        //Auxiliary variables
        let widthAdjusted = page.getWidth();
        let heightAdjusted = page.getHeight();
        const rotation = page.getRotation();

        //Normalizing angle
        let normalizedAngle = rotation.angle % 360;
        if (normalizedAngle < 0) {
          normalizedAngle += 360;
        }

        //Changing the page dimension if the angle is 90 or 270
        if (normalizedAngle === 90 || normalizedAngle === 270) {
          let widthTemp = widthAdjusted;
          widthAdjusted = heightAdjusted;
          heightAdjusted = widthTemp;
        }
        const draggablePositionRelative = {
          x: draggablePositionPixels.x / offsetWidth,
          y: draggablePositionPixels.y / offsetHeight,
          width: draggablePositionPixels.width / offsetWidth,
          height: draggablePositionPixels.height / offsetHeight,
        };
        const draggablePositionPdf = {
          x: draggablePositionRelative.x * widthAdjusted,
          y: draggablePositionRelative.y * heightAdjusted,
          width: draggablePositionRelative.width * widthAdjusted,
          height: draggablePositionRelative.height * heightAdjusted,
        };

        //Defining the image if the page has a 0-degree angle
        let x = draggablePositionPdf.x
        let y = heightAdjusted - draggablePositionPdf.y - draggablePositionPdf.height


        //Defining the image position if it is at other angles
        if (normalizedAngle === 90) {
          x = draggablePositionPdf.y + draggablePositionPdf.height;
          y = draggablePositionPdf.x;
        } else if (normalizedAngle === 180) {
          x = widthAdjusted - draggablePositionPdf.x;
          y = draggablePositionPdf.y + draggablePositionPdf.height;
        } else if (normalizedAngle === 270) {
          x = heightAdjusted - draggablePositionPdf.y - draggablePositionPdf.height;
          y = widthAdjusted - draggablePositionPdf.x;
        }

        // draw the image
        page.drawImage(pdfImageObject, {
          x: x,
          y: y,
          width: draggablePositionPdf.width,
          height: draggablePositionPdf.height,
          rotate: rotation
        });
      }
    }
    this.loadPageContents();
    return pdfDocModified;
  },
};

document.addEventListener("DOMContentLoaded", () => {
  DraggableUtils.init();
});
