const DraggableUtils = {
  boxDragContainer: document.getElementById('box-drag-container'),
  pdfCanvas: document.getElementById('pdf-canvas'),
  nextId: 0,
  pdfDoc: null,
  pageIndex: 0,
  documentsMap: new Map(), // {pdfDoc: {0: [addedElement, ...], 0-offsetWidth: 1920, 0-offsetHeight: 1080, ... }, ...}

  init() {
    interact('.draggable-canvas.resizeable').draggable(this.draggableConfig).resizable(this.resizableConfig);
    interact('.draggable-canvas:not(.resizeable)').draggable(this.draggableConfig);
  },
  onInteraction(target) {
    if (!target.classList.contains('draggable-canvas')) {
      return;
    }
    this.boxDragContainer.appendChild(target);
  },

  addDraggableElement(element, resizable) {
    const createdWrapper = document.createElement('div');
    createdWrapper.id = `draggable-canvas-${this.nextId++}`;
    createdWrapper.appendChild(element);
    createdWrapper.classList.add('draggable-canvas');
    if (resizable) {
      createdWrapper.classList.add('resizeable');
    }

    const x = 0;
    const y = 50;
    createdWrapper.style.transform = `translate(${x}px, ${y}px)`;
    createdWrapper.style.lineHeight = '0';
    createdWrapper.setAttribute('data-bs-x', x);
    createdWrapper.setAttribute('data-bs-y', y);

    createdWrapper.onclick = (e) => {
      e.stopPropagation();
      this.onInteraction(e.target);
    };

    this.boxDragContainer.appendChild(createdWrapper);
    return createdWrapper;
  },
  createDraggableCanvas() {
    const createdCanvas = document.createElement('canvas');
    createdCanvas.id = `draggable-canvas-${this.nextId++}`;
    createdCanvas.classList.add('draggable-canvas', 'resizeable');

    const x = 0;
    const y = 20;
    createdCanvas.style.transform = `translate(${x}px, ${y}px)`;
    createdCanvas.setAttribute('data-bs-x', x);
    createdCanvas.setAttribute('data-bs-y', y);

    createdCanvas.onclick = (e) => this.onInteraction(e.target);

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

        createdCanvas.style.width = newWidth + 'px';
        createdCanvas.style.height = newHeight + 'px';

        var myContext = createdCanvas.getContext('2d');
        myContext.drawImage(myImage, 0, 0);
        resolve(createdCanvas);
      };
    });
  },
  deleteAllDraggableCanvases() {
    this.boxDragContainer.querySelectorAll('.draggable-canvas').forEach((el) => el.remove());
  },
  deleteDraggableCanvas(element) {
    if (element) {
      element.remove();
    }
  },
  getLastInteracted() {
    return this.boxDragContainer.querySelector('.draggable-canvas:last-of-type');
  },

  storePageContents() {
    var pagesMap = this.documentsMap.get(this.pdfDoc);
    if (!pagesMap) {
      pagesMap = {};
    }

    const elements = [...this.boxDragContainer.querySelectorAll('.draggable-canvas')];
    const draggablesData = elements.map((el) => {
      return {element: el, offsetWidth: el.offsetWidth, offsetHeight: el.offsetHeight};
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
    if (draggablesData) {
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
      viewport: page.getViewport({scale: 1}),
    };
    await page.render(renderContext).promise;

    //return pdfCanvas.toDataURL();
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

  parseTransform(element) {},
  async getOverlaidPdfDocument() {
    var radioGroups = new Map();

    const pdfBytes = await this.pdfDoc.getData();
    const pdfDocModified = await PDFLib.PDFDocument.load(pdfBytes, {ignoreEncryption: true});
    this.storePageContents();

    const pagesMap = this.documentsMap.get(this.pdfDoc);
    for (let pageIdx in pagesMap) {
      if (pageIdx.includes('offset')) {
        continue;
      }
      console.log(typeof pageIdx);

      const page = pdfDocModified.getPage(parseInt(pageIdx));
      const draggablesData = pagesMap[pageIdx];
      const offsetWidth = pagesMap[pageIdx + '-offsetWidth'];
      const offsetHeight = pagesMap[pageIdx + '-offsetHeight'];

      for (const draggableData of draggablesData) {
        const draggableElement = draggableData.element;
        if (draggableElement.nodeName == 'CANVAS') {
          // embed the draggable canvas
          const response = await fetch(draggableElement.toDataURL());
          const draggableImgBytes = await response.arrayBuffer();
          const pdfImageObject = await pdfDocModified.embedPng(draggableImgBytes);

          const translatedPositions = this.rescaleForPage(page, draggableData, offsetWidth, offsetHeight);

          // draw the image
          page.drawImage(pdfImageObject, translatedPositions);
        } else if (
          draggableElement.firstChild.nodeName == 'INPUT' &&
          draggableElement.firstChild.getAttribute('type') == 'checkbox'
        ) {
          const translatedPositions = this.rescaleForPage(page, draggableData, offsetWidth, offsetHeight);
          const fieldKey = draggableElement.firstChild.getAttribute('name');
          const form = pdfDocModified.getForm();
          const field = form.createCheckBox(fieldKey);
          field.addToPage(page, translatedPositions);
        } else if (
          draggableElement.firstChild.nodeName == 'DIV' &&
          draggableElement.firstChild.getAttribute('type') == 'dropdown'
        ) {
          const translatedPositions = this.rescaleForPage(page, draggableData, offsetWidth, offsetHeight);
          const fieldKey = draggableElement.firstChild.getAttribute('name');
          const fieldValues = JSON.parse(draggableElement.firstChild.getAttribute('values'));
          const form = pdfDocModified.getForm();
          const field = form.createDropdown(fieldKey);
          field.addOptions(fieldValues);
          field.addToPage(page, translatedPositions);
        } else if (
          draggableElement.firstChild.nodeName == 'DIV' &&
          draggableElement.firstChild.getAttribute('type') == 'optionList'
        ) {
          const translatedPositions = this.rescaleForPage(page, draggableData, offsetWidth, offsetHeight);
          const fieldKey = draggableElement.firstChild.getAttribute('name');
          const fieldValues = JSON.parse(draggableElement.firstChild.getAttribute('values'));
          const form = pdfDocModified.getForm();
          const field = form.createOptionList(fieldKey);
          field.addOptions(fieldValues);
          field.addToPage(page, translatedPositions);
        } else if (
          draggableElement.firstChild.nodeName == 'INPUT' &&
          draggableElement.firstChild.getAttribute('type') == 'radio'
        ) {
          //
          const translatedPositions = this.rescaleForPage(page, draggableData, offsetWidth, offsetHeight);
          const fieldKey = draggableElement.firstChild.getAttribute('name');
          const buttonValue = draggableElement.firstChild.getAttribute('buttonValue');
          const form = pdfDocModified.getForm();
          var radioGroup = radioGroups.get(fieldKey);
          if (!radioGroup) {
            radioGroup = form.createRadioGroup(fieldKey);
            radioGroups.set(fieldKey, radioGroup);
          }
          radioGroup.addOptionToPage(buttonValue, page, translatedPositions);
          console.log('added radio');
        } else if (
          draggableElement.firstChild.nodeName == 'INPUT' &&
          draggableElement.firstChild.getAttribute('type') == 'textarea'
        ) {
          const translatedPositions = this.rescaleForPage(page, draggableData, offsetWidth, offsetHeight);
          const fieldKey = draggableElement.firstChild.getAttribute('name');
          const form = pdfDocModified.getForm();
          const field = form.createTextField(fieldKey);
          field.addToPage(page, translatedPositions);
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
    edges: {left: true, right: true, bottom: true, top: true},
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
        min: {width: 5, height: 5},
      }),
    ],
    inertia: true,
  }),
  (DraggableUtils.rescaleForPage = (page, draggableData, pageOffsetWidth, pageOffsetHeight) => {
    const draggableElement = draggableData.element;

    // calculate the position in the pdf document
    const tansform = draggableElement.style.transform.replace(/[^.,-\d]/g, '');
    const transformComponents = tansform.split(',');
    const draggablePositionPixels = {
      x: parseFloat(transformComponents[0]),
      y: parseFloat(transformComponents[1]),
      width: draggableData.offsetWidth,
      height: draggableData.offsetHeight,
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
      height: draggablePositionPdf.width,
    };
    return translatedPositions;
  });

document.addEventListener('DOMContentLoaded', () => {
  DraggableUtils.init();
});
