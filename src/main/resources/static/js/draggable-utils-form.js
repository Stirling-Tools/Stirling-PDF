const DraggableUtils = {
  boxDragContainer: document.getElementById('box-drag-container'),
  pdfCanvas: document.getElementById('pdf-canvas'),
  nextId: 0,
  pdfDoc: null,
  pageIndex: 0,
  elementAllPages: [],
  documentsMap: new Map(),
  lastInteracted: null,
  padding: 60,
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
            if (event.target.classList.contains('resizeable')) {
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

                const input = canvas.querySelector('.form-input');
                input.style.width = `${width}px`;
                input.style.height = `${height}px`;

                target.setAttribute('data-bs-x', x);
                target.setAttribute('data-bs-y', y);

                this.lastInteracted = target;
              }
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
  },
  onInteraction(target) {
    this.lastInteracted = target;
    // this.boxDragContainer.appendChild(target);
    // target.appendChild(target.querySelector(".display-canvas"));
  },
  addDraggableElement(element, resizable) {
    return new Promise((resolve) => {
      const canvasContainer = document.createElement('div');
      const createdCanvas = document.createElement('div'); // Inner canvas
      const padding = this.padding;

      canvasContainer.id = `draggable-canvas-${this.nextId++}`;
      canvasContainer.classList.add('draggable-canvas');
      createdCanvas.classList.add('display-canvas');
      if (resizable) {
        canvasContainer.classList.add('resizeable');
      }
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


      canvasContainer.appendChild(createdCanvas);
      this.boxDragContainer.appendChild(canvasContainer);

      createdCanvas.width = element.style.width;
      createdCanvas.height = element.style.height;

      const containerWidth = this.boxDragContainer.offsetWidth;
      const containerHeight = this.boxDragContainer.offsetHeight;

      let scaleMultiplier = Math.min(containerWidth / element.width, containerHeight / element.height);
      const scaleFactor = 1;

      const newWidth = element.width * scaleMultiplier * scaleFactor;
      const newHeight = element.height * scaleMultiplier * scaleFactor;

      // Calculate initial bounding box size
      const cosAngle = Math.abs(Math.cos(angle));
      const sinAngle = Math.abs(Math.sin(angle));
      const boundingWidth = newWidth * cosAngle + newHeight * sinAngle;
      const boundingHeight = newWidth * sinAngle + newHeight * cosAngle;

      createdCanvas.style.width = `${newWidth}px`;
      createdCanvas.style.height = `${newHeight}px`;

      canvasContainer.style.width = `${boundingWidth + 2 * padding}px`;
      canvasContainer.style.height = `${boundingHeight + 2 * padding}px`;
      canvasContainer.addEventListener('click', () => {
        this.lastInteracted = canvasContainer;
        //this.showRotationControls(canvasContainer);
        const input = canvasContainer.querySelector('.form-input');
        window.latestId = input.getAttribute('id');
        window.populateEditForm(input.getAttribute('type'), {
          'id': input.getAttribute('id'), 'height': parseInt(canvasContainer.firstChild.style.height), 'width': parseInt(canvasContainer.firstChild.style.width),
          'backgroundPalette': input.getAttribute('backgroundColor'), 'textPalette': input.getAttribute('textColor'), fontSize: parseInt(input.style.fontSize) || "12",
          'font': input.style.fontFamily, 'dropdownValues': input.getAttribute("data-value"), 'value': input.value, 'optionListValues': input.getAttribute("data-value")
        });
      });
      createdCanvas.appendChild(element);
      // const rotationControls = document.getElementById('rotation-controls');
      // const rotationInput = document.getElementById('rotation-input');
      // rotationControls.style.display = 'flex';
      // rotationInput.value = Math.round((parseFloat(element.getAttribute('data-angle')) * 180) / Math.PI);
      // rotationInput.addEventListener('input', this.handleRotationInputChange);
      //this.showRotationControls(canvasContainer);
      this.lastInteracted = canvasContainer;
      window.latestId = element.getAttribute('id');
      window.populateEditForm(element.getAttribute('type'), {
        'id': element.getAttribute('id'), 'height': parseInt(element.style.height), 'width': parseInt(element.style.width),
        'backgroundPalette': element.getAttribute('backgroundColor'), 'textPalette': element.getAttribute('textColor'), fontSize: parseInt(element.style.fontSize) || "12",
        'font': element.style.fontFamily, 'dropdownValues': element.getAttribute("data-value"), 'value': element.value, 'optionListValues': element.getAttribute("data-value")
      });
      resolve(canvasContainer);
    });
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
      canvasContainer.classList.add('resizeable');

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

        // Auxiliary variables
        let widthAdjusted = page.getWidth();
        let heightAdjusted = page.getHeight();
        const rotation = page.getRotation();

        // Normalize page rotation angle
        let normalizedAngle = rotation.angle % 360;
        if (normalizedAngle < 0) {
          normalizedAngle += 360;
        }

        // Adjust page dimensions for rotated pages
        if (normalizedAngle === 90 || normalizedAngle === 270) {
          [widthAdjusted, heightAdjusted] = [heightAdjusted, widthAdjusted];
        }

        const draggablePositionRelative = {
          x: draggablePositionPixels.x / offsetWidth,
          y: draggablePositionPixels.y / offsetHeight,
          width: draggablePositionPixels.width / offsetWidth,
          height: draggablePositionPixels.height / offsetHeight,
          angle: draggablePositionPixels.angle,
        };

        const draggablePositionPdf = {
          x: draggablePositionRelative.x * widthAdjusted,
          y: draggablePositionRelative.y * heightAdjusted,
          width: draggablePositionRelative.width * widthAdjusted,
          height: draggablePositionRelative.height * heightAdjusted,
        };

        // Calculate position based on normalized page rotation
        let x = draggablePositionPdf.x;
        let y = heightAdjusted - draggablePositionPdf.y - draggablePositionPdf.height;

        let originx = x + draggablePositionPdf.width / 2;
        let originy = heightAdjusted - draggablePositionPdf.y - draggablePositionPdf.height / 2;

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
        // let angle = draggablePositionPixels.angle % 360;
        // if (angle < 0) angle += 360; // Normalize to positive angle
        const radians = -draggablePositionPixels.angle; // Convert angle to radians
        page.pushOperators(
          PDFLib.pushGraphicsState(),
          PDFLib.concatTransformationMatrix(1, 0, 0, 1, originx, originy),
          PDFLib.concatTransformationMatrix(
            Math.cos(radians),
            Math.sin(radians),
            -Math.sin(radians),
            Math.cos(radians),
            0,
            0
          ),
          PDFLib.concatTransformationMatrix(1, 0, 0, 1, -1 * originx, -1 * originy)
        );
        page.drawImage(pdfImageObject, {
          x: x,
          y: y,
          width: draggablePositionPdf.width,
          height: draggablePositionPdf.height,
        });
        page.pushOperators(PDFLib.popGraphicsState());
      }
    }

    this.loadPageContents();
    return pdfDocModified;
  },
  async getOverlaidPdfDocument() {
    var radioGroups = new Map();

    const pdfBytes = await this.pdfDoc.getData();
    const pdfDocModified = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    this.storePageContents();
    if (!pdfDocModified) throw new Error('Failed to load PDF document');

    const pagesMap = this.documentsMap.get(this.pdfDoc);

    for (let pageIdx in pagesMap) {
      if (pageIdx.includes('offset')) continue;

      const page = pdfDocModified.getPage(parseInt(pageIdx));
      const draggablesData = pagesMap[pageIdx];

      const offsetWidth = pagesMap[pageIdx + '-offsetWidth'];
      const offsetHeight = pagesMap[pageIdx + '-offsetHeight'];

      for (const draggableData of draggablesData) {
        const canvasContainer = draggableData.element;
        const draggableElement = canvasContainer.querySelector('.display-canvas') || canvasContainer.firstChild;

        // (draggableData.offsetWidth = draggableData.offsetWidth - this.padding * 2 - 4),
        //   (draggableData.offsetHeight = draggableData.offsetHeight - this.padding * 2 - 4);

        const form = pdfDocModified.getForm();

        if (!draggableElement) continue;

        const input = draggableElement.querySelector('.form-input');
        const elementType = input.getAttribute('type');
        const fieldKey = input.getAttribute('name');
        const fieldStyle = input.getAttribute('style');
        const fontSizeMatch = fieldStyle.match(/font-size:\s*([\w-]+)/);
        const fontSize = parseInt(fontSizeMatch ? fontSizeMatch[1] : '12');
        const fontFamilyMatch = fieldStyle.match(/font-family:\s*([^;]+)/);
        const fontFamily = fontFamilyMatch ? fontFamilyMatch[1].trim().replace(/['"]/g, '') : 'Helvetica';

        const embeddedFont = await pdfDocModified.embedFont(PDFLib.StandardFonts[fontFamily]);
        const backgroundColor = rgbStringToPdfLib(input.style.backgroundColor) || PDFLib.rgb(1, 1, 1);
        const textColor = rgbStringToPdfLib(input.style.color) || PDFLib.rgb(0, 0, 0);
        const translatedPositions = this.rescaleForPage(
          page,
          draggableData,
          offsetWidth,
          offsetHeight,
          embeddedFont,
          fontSize,
          backgroundColor,
          textColor
        );

        function rgbStringToPdfLib(rgbString) {
          const match = rgbString.match(/\d+/g);
          if (!match || match.length < 3) return null;

          const [r, g, b] = match.map((num) => parseInt(num) / 255);
          return PDFLib.rgb(r, g, b);
        }
        try {
          if (elementType === 'checkbox') {
            // Handle Checkboxes
            const field = form.createCheckBox(fieldKey);

            field.addToPage(page, translatedPositions);
          } else if (elementType === 'radio') {
            // Handle Radio Buttons
            const buttonValue = input.getAttribute('buttonValue');
            var radioGroup = radioGroups.get(fieldKey);
            if (!radioGroup) {
              radioGroup = form.createRadioGroup(fieldKey);
              radioGroups.set(fieldKey, radioGroup);
            }
            radioGroup.addOptionToPage(buttonValue, page, translatedPositions);
          } else if (elementType === 'dropdown') {
            // Handle Dropdowns
            const fieldValues = input.getAttribute('data-value')?.split(',').map(v => v.trim() || []);
            const field = form.createDropdown(fieldKey);
            field.addOptions(fieldValues);
            field.addToPage(page, translatedPositions);
            field.setFontSize(fontSize);
            field.updateAppearances(embeddedFont);
          } else if (elementType === 'optionList') {
            // Handle Multi-Select Option List
            const fieldValues = JSON.parse(input.getAttribute('values'));
            const field = form.createOptionList(fieldKey);
            field.addOptions(fieldValues);
            field.addToPage(page, translatedPositions);
            field.updateAppearances(embeddedFont);
            field.setFontSize(fontSize);
          } else if (elementType === 'textarea' || elementType === 'text') {
            // Handle Text Fields (Single-line or Multi-line)
            const field = form.createTextField(fieldKey);
            field.addToPage(page, translatedPositions);
          }
        } catch (err) {
          alert(err);
          this.loadPageContents();
          return;
        }
      }
    }

    this.loadPageContents();
    return pdfDocModified;
  },
};
(DraggableUtils.draggableConfig = {
  listeners: {
    move: (event) => {
      const target = event.target;
      const x = (parseFloat(target.getAttribute('data-bs-x')) || 0) + event.dx;
      const y = (parseFloat(target.getAttribute('data-bs-y')) || 0) + event.dy;

      target.style.transform = `translate(${x}px, ${y}px)`;
      target.setAttribute('data-bs-x', x);
      target.setAttribute('data-bs-y', y);

      DraggableUtils.onInteraction(target);
    },
  },
}),
  (DraggableUtils.resizableConfig = {
    edges: { left: true, right: true, bottom: true, top: true },
    listeners: {
      move: (event) => {
        var target = event.target;
        var x = parseFloat(target.getAttribute('data-bs-x')) || 0;
        var y = parseFloat(target.getAttribute('data-bs-y')) || 0;

        // check if control key is pressed
        if (event.ctrlKey) {
          const aspectRatio = target.offsetWidth / target.offsetHeight;
          // preserve aspect ratio
          let width = event.rect.width;
          let height = event.rect.height;

          if (Math.abs(event.deltaRect.width) >= Math.abs(event.deltaRect.height)) {
            height = width / aspectRatio;
          } else {
            width = height * aspectRatio;
          }

          event.rect.width = width;
          event.rect.height = height;
        }

        target.style.width = event.rect.width + 'px';
        target.style.height = event.rect.height + 'px';

        // translate when resizing from top or left edges
        x += event.deltaRect.left;
        y += event.deltaRect.top;

        target.style.transform = 'translate(' + x + 'px,' + y + 'px)';

        target.setAttribute('data-bs-x', x);
        target.setAttribute('data-bs-y', y);
        //target.textContent = Math.round(event.rect.width) + '\u00D7' + Math.round(event.rect.height)

        DraggableUtils.onInteraction(target);
      },
    },

    modifiers: [
      interact.modifiers.restrictSize({
        min: { width: 5, height: 5 },
      }),
    ],
    inertia: true,
  }),
  (DraggableUtils.rescaleForPage = (
    page,
    draggableData,
    pageOffsetWidth,
    pageOffsetHeight,
    font,
    fontSize,
    backgroundColor,
    textColor
  ) => {
    const draggableElement = draggableData.element;
    const input = draggableElement.querySelector('.form-input');
    const padding = 60;
    // calculate the position in the pdf document

    const transform = draggableElement.style.transform.replace(/[^.,-\d]/g, '');
    const translateRegex = /translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/;

    const translateMatch = transform.match(translateRegex);

    const translateX = translateMatch ? parseFloat(translateMatch[1]) : 0;
    const translateY = translateMatch ? parseFloat(translateMatch[2]) : 0;

    const childTransform = draggableElement.style.transform || '';
    const childTranslateMatch = childTransform.match(translateRegex);

    const childOffsetX = childTranslateMatch ? parseFloat(childTranslateMatch[1]) : 0;
    const childOffsetY = childTranslateMatch ? parseFloat(childTranslateMatch[2]) : 0;

    const draggablePositionPixels = {
      x: translateX + childOffsetX + padding + 2,
      y: translateY + childOffsetY + padding + 2,
      width: parseInt(input.style.width, 10),
      height: parseInt(input.style.height, 10),
    };
    const draggablePositionRelative = {
      x: draggablePositionPixels.x / pageOffsetWidth,
      y: draggablePositionPixels.y / pageOffsetHeight,
      width: draggablePositionPixels.width / pageOffsetWidth,
      height: draggablePositionPixels.height / pageOffsetHeight,
    };
    const draggablePositionPdf = {
      x: draggablePositionRelative.x * page.getWidth(),
      y: draggablePositionRelative.y * page.getHeight(),
      width: draggablePositionRelative.width * page.getWidth(),
      height: draggablePositionRelative.height * page.getHeight(),
    };
    const translatedPositions = {
      x: draggablePositionPdf.x,
      y: page.getHeight() - draggablePositionPdf.y - draggablePositionPdf.height,
      width: draggablePositionPdf.width,
      height: draggablePositionPdf.height,
      font: font,
      fontSize: fontSize,
      backgroundColor: backgroundColor,
      textColor: textColor,
    };
    return translatedPositions;
  });

document.addEventListener('DOMContentLoaded', () => {
  DraggableUtils.init();
});

window.resize = (target, newWidth, newHeight, maintainRatioEnabled, change) => {
  const MAX_CHANGE = 60;
  const padding = this.padding || 60;
  let x = parseFloat(target.getAttribute('data-bs-x')) || 0;
  let y = parseFloat(target.getAttribute('data-bs-y')) || 0;
  newWidth = parseInt(newWidth);
  newHeight = parseInt(newHeight);
  const canvas = target.querySelector('.display-canvas');
  if (!canvas) return;

  const originalWidth = parseFloat(canvas.style.width) || parseInt(canvas.width);
  const originalHeight = parseFloat(canvas.style.height) || parseInt(canvas.height);
  const angle = parseFloat(target.getAttribute('data-angle')) || 0;

  const aspectRatio = originalWidth / originalHeight;

  if (maintainRatioEnabled) {
    if (change === "width") {
      newHeight = newWidth / aspectRatio;
    } else {
      newWidth = newHeight * aspectRatio;
    }
  }

  const widthChange = newWidth - originalWidth;
  const heightChange = newHeight - originalHeight;

  if (Math.abs(widthChange) > MAX_CHANGE || Math.abs(heightChange) > MAX_CHANGE) {
    const scale = MAX_CHANGE / Math.max(Math.abs(widthChange), Math.abs(heightChange));
    newWidth = originalWidth + widthChange * scale;
    newHeight = originalHeight + heightChange * scale;
  }

  const cosAngle = Math.abs(Math.cos(angle));
  const sinAngle = Math.abs(Math.sin(angle));
  const boundingWidth = newWidth * cosAngle + newHeight * sinAngle;
  const boundingHeight = newWidth * sinAngle + newHeight * cosAngle;


  // Apply width and height
  target.style.width = `${boundingWidth + 2 * padding}px`;
  target.style.height = `${boundingHeight + 2 * padding}px`;

  // Update inner canvas
  canvas.style.width = `${newWidth}px`;
  canvas.style.height = `${newHeight}px`;
  //canvas.style.transform = `translate(${(boundingWidth - newWidth) / 2}px, ${(boundingHeight - newHeight) / 2}px) rotate(${angle}rad)`;

  // Update form input inside canvas
  const input = canvas.querySelector('.form-input');
  if (input) {
    input.style.width = `${newWidth}px`;
    input.style.height = `${newHeight}px`;
  }

  window.populateEditForm(input.getAttribute('type'), {
    'id': input.getAttribute('id'), 'height': newHeight, 'width': newWidth,
    'backgroundPalette': input.getAttribute('backgroundColor'), 'textPalette': input.getAttribute('textColor'), fontSize: parseInt(input.style.fontSize) || "12",
    'font': input.style.fontFamily, 'dropdownValues': input.getAttribute("data-value"), 'value': input.value, 'optionListValues': input.getAttribute("data-value")
  });
}
