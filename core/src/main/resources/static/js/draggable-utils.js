const DraggableUtils = {
  boxDragContainer: document.getElementById('box-drag-container'),
  pdfCanvas: document.getElementById('pdf-canvas'),
  nextId: 0,
  pdfDoc: null,
  pageIndex: 0,
  elementAllPages: [],
  documentsMap: new Map(),
  lastInteracted: null,
  padding: 15,
  maintainRatioEnabled: true,
  init() {
    interact('.draggable-canvas')
      .draggable({
        listeners: {
          start(event) {
            const target = event.target;
            x = parseFloat(target.getAttribute('data-bs-x'));
            y = parseFloat(target.getAttribute('data-bs-y'));
          },
          move: (event) => {
            const target = event.target;

            // Retrieve position attributes
            let x = parseFloat(target.getAttribute('data-bs-x')) || 0;
            let y = parseFloat(target.getAttribute('data-bs-y')) || 0;
            const angle = parseFloat(target.getAttribute('data-angle')) || 0;

            // Update position based on drag movement
            x += event.dx;
            y += event.dy;

            // Apply translation to the parent container (bounding box)
            target.style.transform = `translate(${x}px, ${y}px)`;

            // Preserve rotation on the inner canvas
            const canvas = target.querySelector('.display-canvas');

            const canvasWidth = parseFloat(canvas.style.width);
            const canvasHeight = parseFloat(canvas.style.height);

            const cosAngle = Math.abs(Math.cos(angle));
            const sinAngle = Math.abs(Math.sin(angle));

            const rotatedWidth = canvasWidth * cosAngle + canvasHeight * sinAngle;
            const rotatedHeight = canvasWidth * sinAngle + canvasHeight * cosAngle;

            const offsetX = (rotatedWidth - canvasWidth) / 2;
            const offsetY = (rotatedHeight - canvasHeight) / 2;

            canvas.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${angle}rad)`;

            // Update attributes for persistence
            target.setAttribute('data-bs-x', x);
            target.setAttribute('data-bs-y', y);

            // Set the last interacted element
            this.lastInteracted = target;
          },
        },
      })
      .resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        listeners: {
          start: (event) => {
            const target = event.target;
            x = parseFloat(target.getAttribute('data-bs-x')) || 0;
            y = parseFloat(target.getAttribute('data-bs-y')) || 0;
          },
          move: (event) => {
            const target = event.target;

            const MAX_CHANGE = 60;

            let width = event.rect.width - 2 * this.padding;
            let height = event.rect.height - 2 * this.padding;

            const canvas = target.querySelector('.display-canvas');
            if (canvas) {
              const originalWidth = parseFloat(canvas.style.width) || canvas.width;
              const originalHeight = parseFloat(canvas.style.height) || canvas.height;
              const angle = parseFloat(target.getAttribute('data-angle')) || 0;

              const aspectRatio = originalWidth / originalHeight;

              if (!event.ctrlKey && this.maintainRatioEnabled) {
                if (Math.abs(event.deltaRect.width) >= Math.abs(event.deltaRect.height)) {
                  height = width / aspectRatio;
                } else {
                  width = height * aspectRatio;
                }
              }

              const widthChange = width - originalWidth;
              const heightChange = height - originalHeight;

              if (Math.abs(widthChange) > MAX_CHANGE || Math.abs(heightChange) > MAX_CHANGE) {
                const scale = MAX_CHANGE / Math.max(Math.abs(widthChange), Math.abs(heightChange));
                width = originalWidth + widthChange * scale;
                height = originalHeight + heightChange * scale;
              }

              const cosAngle = Math.abs(Math.cos(angle));
              const sinAngle = Math.abs(Math.sin(angle));
              const boundingWidth = width * cosAngle + height * sinAngle;
              const boundingHeight = width * sinAngle + height * cosAngle;

              if (event.edges.left) {
                const dx = event.deltaRect.left;
                x += dx;
              }
              if (event.edges.top) {
                const dy = event.deltaRect.top;
                y += dy;
              }

              target.style.transform = `translate(${x}px, ${y}px)`;
              target.style.width = `${boundingWidth + 2 * this.padding}px`;
              target.style.height = `${boundingHeight + 2 * this.padding}px`;

              canvas.style.width = `${width}px`;
              canvas.style.height = `${height}px`;
              canvas.style.transform = `translate(${(boundingWidth - width) / 2}px, ${(boundingHeight - height) / 2
                }px) rotate(${angle}rad)`;

              target.setAttribute('data-bs-x', x);
              target.setAttribute('data-bs-y', y);

              this.lastInteracted = target;
            }
          },
        },
        modifiers: [
          interact.modifiers.restrictSize({
            min: { width: 50, height: 50 },
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
        let x = parseFloat(target.getAttribute('data-bs-x')) || 0;
        let y = parseFloat(target.getAttribute('data-bs-y')) || 0;

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
        const angle = parseFloat(target.getAttribute('data-angle')) || 0;
        target.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad)`;
        target.setAttribute('data-bs-x', x);
        target.setAttribute('data-bs-y', y);

        DraggableUtils.onInteraction(target);
      });
    }
  },
  onInteraction(target) {
    this.lastInteracted = target;
    // this.boxDragContainer.appendChild(target);
    // target.appendChild(target.querySelector(".display-canvas"));
  },
  createDraggableCanvasFromUrl(dataUrl) {
    return new Promise((resolve) => {
      const canvasContainer = document.createElement('div');
      const createdCanvas = document.createElement('canvas'); // Inner canvas
      const padding = this.padding;

      canvasContainer.id = `draggable-canvas-${this.nextId++}`;
      canvasContainer.classList.add('draggable-canvas');
      createdCanvas.classList.add('display-canvas');

      canvasContainer.style.position = 'absolute';
      canvasContainer.style.padding = `${padding}px`;
      canvasContainer.style.overflow = 'hidden';

      let x = 0,
        y = 30,
        angle = 0;
      canvasContainer.style.transform = `translate(${x}px, ${y}px)`;
      canvasContainer.setAttribute('data-bs-x', x);
      canvasContainer.setAttribute('data-bs-y', y);
      canvasContainer.setAttribute('data-angle', angle);

      canvasContainer.addEventListener('click', () => {
        this.lastInteracted = canvasContainer;
        this.showRotationControls(canvasContainer);
      });
      canvasContainer.appendChild(createdCanvas);
      this.boxDragContainer.appendChild(canvasContainer);

      const myImage = new Image();
      myImage.src = dataUrl;
      myImage.onload = () => {
        const context = createdCanvas.getContext('2d');

        createdCanvas.width = myImage.width;
        createdCanvas.height = myImage.height;

        const imgAspect = myImage.width / myImage.height;
        const containerWidth = this.boxDragContainer.offsetWidth;
        const containerHeight = this.boxDragContainer.offsetHeight;

        let scaleMultiplier = Math.min(containerWidth / myImage.width, containerHeight / myImage.height);
        const scaleFactor = 0.5;

        const newWidth = myImage.width * scaleMultiplier * scaleFactor;
        const newHeight = myImage.height * scaleMultiplier * scaleFactor;

        // Calculate initial bounding box size
        const cosAngle = Math.abs(Math.cos(angle));
        const sinAngle = Math.abs(Math.sin(angle));
        const boundingWidth = newWidth * cosAngle + newHeight * sinAngle;
        const boundingHeight = newWidth * sinAngle + newHeight * cosAngle;

        createdCanvas.style.width = `${newWidth}px`;
        createdCanvas.style.height = `${newHeight}px`;

        canvasContainer.style.width = `${boundingWidth + 2 * padding}px`;
        canvasContainer.style.height = `${boundingHeight + 2 * padding}px`;

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(myImage, 0, 0, myImage.width, myImage.height);
        this.showRotationControls(canvasContainer);
        this.lastInteracted = canvasContainer;

        resolve(canvasContainer);
      };

      myImage.onerror = () => {
        console.error('Failed to load the image.');
        resolve(null);
      };
    });
  },
  toggleMaintainRatio() {
    this.maintainRatioEnabled = !this.maintainRatioEnabled;
    const button = document.getElementById('ratioToggleBtn');
    if (this.maintainRatioEnabled) {
      button.classList.remove('btn-danger');
      button.classList.add('btn-outline-secondary');
    } else {
      button.classList.remove('btn-outline-secondary');
      button.classList.add('btn-danger');
    }
  },

  deleteAllDraggableCanvases() {
    this.boxDragContainer.querySelectorAll('.draggable-canvas').forEach((el) => el.remove());
  },
  async addAllPagesDraggableCanvas(element) {
    if (element) {
      let currentPage = this.pageIndex;
      if (!this.elementAllPages.includes(element)) {
        this.elementAllPages.push(element);
        element.style.filter = 'sepia(1) hue-rotate(90deg) brightness(1.2)';
        let newElement = {
          element: element,
          offsetWidth: element.width,
          offsetHeight: element.height,
        };

        let pagesMap = this.documentsMap.get(this.pdfDoc);

        if (!pagesMap) {
          pagesMap = {};
          this.documentsMap.set(this.pdfDoc, pagesMap);
        }
        let page = this.pageIndex;

        for (let pageIndex = 0; pageIndex < this.pdfDoc.numPages; pageIndex++) {
          if (pagesMap[`${pageIndex}-offsetWidth`]) {
            if (!pagesMap[pageIndex].includes(newElement)) {
              pagesMap[pageIndex].push(newElement);
            }
          } else {
            pagesMap[pageIndex] = [];
            pagesMap[pageIndex].push(newElement);
            pagesMap[`${pageIndex}-offsetWidth`] = pagesMap[`${page}-offsetWidth`];
            pagesMap[`${pageIndex}-offsetHeight`] = pagesMap[`${page}-offsetHeight`];
          }
          await this.goToPage(pageIndex);
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
            pageElements.forEach((elementPage) => {
              const elementIndex = pageElements.findIndex((elementPage) => elementPage['element'].id === element.id);
              if (elementIndex !== -1) {
                pageElements.splice(elementIndex, 1);
              }
            });
          }
          await this.goToPage(pageIndex);
        }
      }
      await this.goToPage(currentPage);
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
    return this.lastInteracted;
  },
  showRotationControls(element) {
    const rotationControls = document.getElementById('rotation-controls');
    const rotationInput = document.getElementById('rotation-input');
    rotationControls.style.display = 'flex';
    rotationInput.value = Math.round((parseFloat(element.getAttribute('data-angle')) * 180) / Math.PI);
    rotationInput.addEventListener('input', this.handleRotationInputChange);
  },
  hideRotationControls() {
    const rotationControls = document.getElementById('rotation-controls');
    const rotationInput = document.getElementById('rotation-input');
    rotationControls.style.display = 'none';
    rotationInput.addEventListener('input', this.handleRotationInputChange);
  },
  applyRotationToElement(element, degrees) {
    const radians = degrees * (Math.PI / 180); // Convert degrees to radians

    // Get current position
    const x = parseFloat(element.getAttribute('data-bs-x')) || 0;
    const y = parseFloat(element.getAttribute('data-bs-y')) || 0;

    // Get the inner canvas (image)
    const canvas = element.querySelector('.display-canvas');
    if (canvas) {
      const originalWidth = parseFloat(canvas.style.width);
      const originalHeight = parseFloat(canvas.style.height);
      const padding = this.padding; // Access the padding value

      // Calculate rotated bounding box dimensions
      const cosAngle = Math.abs(Math.cos(radians));
      const sinAngle = Math.abs(Math.sin(radians));
      const boundingWidth = originalWidth * cosAngle + originalHeight * sinAngle + 2 * padding;
      const boundingHeight = originalWidth * sinAngle + originalHeight * cosAngle + 2 * padding;

      // Update parent container to fit the rotated bounding box
      element.style.width = `${boundingWidth}px`;
      element.style.height = `${boundingHeight}px`;

      // Center the canvas within the bounding box, accounting for padding
      const offsetX = (boundingWidth - originalWidth) / 2 - padding;
      const offsetY = (boundingHeight - originalHeight) / 2 - padding;

      canvas.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${radians}rad)`;
    }

    // Keep the bounding box positioned properly
    element.style.transform = `translate(${x}px, ${y}px)`;
    element.setAttribute('data-angle', radians);
  },
  handleRotationInputChange() {
    const rotationInput = document.getElementById('rotation-input');
    const degrees = parseFloat(rotationInput.value) || 0;
    DraggableUtils.applyRotationToElement(DraggableUtils.lastInteracted, degrees);
  },
  storePageContents() {
    var pagesMap = this.documentsMap.get(this.pdfDoc);
    if (!pagesMap) {
      pagesMap = {};
    }

    const elements = [...this.boxDragContainer.querySelectorAll('.draggable-canvas')];
    const draggablesData = elements.map((el) => {
      return {
        element: el,
        offsetWidth: el.offsetWidth,
        offsetHeight: el.offsetHeight,
      };
    });
    elements.forEach((el) => this.boxDragContainer.removeChild(el));

    pagesMap[this.pageIndex] = draggablesData;
    pagesMap[this.pageIndex + '-offsetWidth'] = this.pdfCanvas.offsetWidth;
    pagesMap[this.pageIndex + '-offsetHeight'] = this.pdfCanvas.offsetHeight;

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
      canvasContext: this.pdfCanvas.getContext('2d'),
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
  async getOverlayedPdfDocument() {
    const pdfBytes = await this.pdfDoc.getData();
    const pdfDocModified = await PDFLib.PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
    });
    this.storePageContents();

    const pagesMap = this.documentsMap.get(this.pdfDoc);

    for (let pageIdx in pagesMap) {
      if (pageIdx.includes('offset')) {
        continue;
      }

      const page = pdfDocModified.getPage(parseInt(pageIdx));
      let draggablesData = pagesMap[pageIdx];

      const offsetWidth = pagesMap[pageIdx + '-offsetWidth'];
      const offsetHeight = pagesMap[pageIdx + '-offsetHeight'];

      for (const draggableData of draggablesData) {
        // Embed the draggable canvas
        const draggableElement = draggableData.element.querySelector('.display-canvas');
        const response = await fetch(draggableElement.toDataURL());
        const draggableImgBytes = await response.arrayBuffer();
        const pdfImageObject = await pdfDocModified.embedPng(draggableImgBytes);

        // Extract transformation data
        const transform = draggableData.element.style.transform || '';
        const translateRegex = /translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/;

        const translateMatch = transform.match(translateRegex);

        const translateX = translateMatch ? parseFloat(translateMatch[1]) : 0;
        const translateY = translateMatch ? parseFloat(translateMatch[2]) : 0;

        const childTransform = draggableElement.style.transform || '';
        const childTranslateMatch = childTransform.match(translateRegex);

        const childOffsetX = childTranslateMatch ? parseFloat(childTranslateMatch[1]) : 0;
        const childOffsetY = childTranslateMatch ? parseFloat(childTranslateMatch[2]) : 0;

        const rotateAngle = parseFloat(draggableData.element.getAttribute('data-angle')) || 0;

        const draggablePositionPixels = {
          x: translateX + childOffsetX + this.padding + 2,
          y: translateY + childOffsetY + this.padding + 2,
          width: parseFloat(draggableElement.style.width),
          height: parseFloat(draggableElement.style.height),
          angle: rotateAngle, // Store rotation
        };

        const pageRotation = page.getRotation();

        // Normalize page rotation angle
        let normalizedAngle = pageRotation.angle % 360;
        if (normalizedAngle < 0) {
          normalizedAngle += 360;
        }

        // Determine the viewed page dimensions based on the normalized rotation angle
        let viewedPageWidth = (normalizedAngle === 90 || normalizedAngle === 270) ? page.getHeight() : page.getWidth();
        let viewedPageHeight = (normalizedAngle === 90 || normalizedAngle === 270) ? page.getWidth() : page.getHeight();

        const draggablePositionRelative = {
          x: draggablePositionPixels.x / offsetWidth,
          y: draggablePositionPixels.y / offsetHeight,
          width: draggablePositionPixels.width / offsetWidth,
          height: draggablePositionPixels.height / offsetHeight,
          angle: draggablePositionPixels.angle,
        };

        const draggablePositionPdf = {
          x: draggablePositionRelative.x * viewedPageWidth,
          y: draggablePositionRelative.y * viewedPageHeight,
          width: draggablePositionRelative.width * viewedPageWidth,
          height: draggablePositionRelative.height * viewedPageHeight,
        };

        // Calculate position based on normalized page rotation
        let x = draggablePositionPdf.x;
        let y = viewedPageHeight - draggablePositionPdf.y - draggablePositionPdf.height;

        if (normalizedAngle === 90) {
          x = draggablePositionPdf.y;
          y = draggablePositionPdf.x;
        } else if (normalizedAngle === 180) {
          x = viewedPageWidth - draggablePositionPdf.x - draggablePositionPdf.width;
          y = draggablePositionPdf.y;
        } else if (normalizedAngle === 270) {
          x = viewedPageHeight - draggablePositionPdf.y - draggablePositionPdf.height;
          y = viewedPageWidth - draggablePositionPdf.x - draggablePositionPdf.width;
        }

        // Convert rotation angle to radians
        let pageRotationInRadians = PDFLib.degreesToRadians(normalizedAngle);
        const rotationInRadians = pageRotationInRadians - draggablePositionPixels.angle;

        // Calculate the center of the image
        const imageCenterX = x + draggablePositionPdf.width / 2;
        const imageCenterY = y + draggablePositionPdf.height / 2;

        // Apply transformations to rotate the image about its center
        page.pushOperators(
          PDFLib.pushGraphicsState(),
          PDFLib.concatTransformationMatrix(1, 0, 0, 1, imageCenterX, imageCenterY), // Translate to center
          PDFLib.concatTransformationMatrix(
            Math.cos(rotationInRadians),
            Math.sin(rotationInRadians),
            -Math.sin(rotationInRadians),
            Math.cos(rotationInRadians),
            0,
            0
          ), // Rotate
          PDFLib.concatTransformationMatrix(1, 0, 0, 1, -imageCenterX, -imageCenterY) // Translate back
        );

        page.drawImage(pdfImageObject, {
          x: x,
          y: y,
          width: draggablePositionPdf.width,
          height: draggablePositionPdf.height,
        });

        // Restore the graphics state
        page.pushOperators(PDFLib.popGraphicsState());
      }
    }

    this.loadPageContents();
    return pdfDocModified;
  },
};

document.addEventListener('DOMContentLoaded', () => {
  DraggableUtils.init();
});
