const DraggableUtils = {
  boxDragContainer: document.getElementById("box-drag-container"),
  pdfCanvas: document.getElementById("pdf-canvas"),
  nextId: 0,
  pdfDoc: null,
  pageIndex: 0,
  elementAllPages: [],
  documentsMap: new Map(),
  lastInteracted: null,
  padding: 15,
  init() {
    interact(".draggable-canvas")
      .draggable({
        listeners: {
          start(event) {
            const target = event.target;
            const style = window.getComputedStyle(target);
            const matrix = new DOMMatrixReadOnly(style.transform);
            x = matrix.m41;
            y = matrix.m42;
          },
          move: (event) => {
            const target = event.target;
            const angle = parseFloat(target.getAttribute("data-angle")) || 0;
            x += event.dx;
            y += event.dy;
            target.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad)`;

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
          start: (event) => {
            const target = event.target;
            const style = window.getComputedStyle(target);
            const matrix = new DOMMatrixReadOnly(style.transform);
            x = matrix.m41;
            y = matrix.m42;
          },
          move: (event) => {
            const target = event.target;

            x += event.deltaRect.left;
            y += event.deltaRect.top;
            const angle = parseFloat(target.getAttribute("data-angle")) || 0;
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);

            const aspectRatio =
              (target.offsetWidth - 2 * this.padding) /
              (target.offsetHeight - 2 * this.padding);

            let width = event.rect.width - 2 * this.padding; // Adjust width for padding
            let height = event.rect.height - 2 * this.padding; // Adjust height for padding

            if (!event.ctrlKey) {
              // Preserve aspect ratio unless Ctrl is pressed
              if (
                Math.abs(event.deltaRect.width) >=
                Math.abs(event.deltaRect.height)
              ) {
                height = width / aspectRatio;
              } else {
                width = height * aspectRatio;
              }
            }

            // Rotate deltas to account for rotation
            const deltaLeft = event.deltaRect.left;
            const deltaTop = event.deltaRect.top;

            const rotatedDeltaX = cosAngle * deltaLeft - sinAngle * deltaTop;
            const rotatedDeltaY = sinAngle * deltaLeft + cosAngle * deltaTop;

            target.style.width = `${width + 2 * this.padding}px`;
            target.style.height = `${height + 2 * this.padding}px`;
            x += rotatedDeltaX;
            y += rotatedDeltaY;
            // Apply transform
            target.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad)`;
            target.setAttribute("data-bs-x", rotatedDeltaX);
            target.setAttribute("data-bs-y", rotatedDeltaY);
            const canvas = target.querySelector(".display-canvas");
            if (canvas) {
              canvas.style.width = `${width}px`;
              canvas.style.height = `${height}px`;
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
    if (
      window.location.pathname.endsWith("sign") ||
      window.location.pathname.endsWith("add-image")
    ) {
      window.addEventListener("keydown", (event) => {
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
        let x = parseFloat(target.getAttribute("data-bs-x")) || 0;
        let y = parseFloat(target.getAttribute("data-bs-y")) || 0;

        // Check which key was pressed and update the coordinates accordingly
        switch (event.key) {
          case "ArrowUp":
            y -= stepY;
            event.preventDefault(); // Prevent the default action
            break;
          case "ArrowDown":
            y += stepY;
            event.preventDefault();
            break;
          case "ArrowLeft":
            x -= stepX;
            event.preventDefault();
            break;
          case "ArrowRight":
            x += stepX;
            event.preventDefault();
            break;
          default:
            return; // Listen only to arrow keys
        }

        // Update position
        const angle = parseFloat(target.getAttribute("data-angle")) || 0;
        target.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad)`;
        target.setAttribute("data-bs-x", x);
        target.setAttribute("data-bs-y", y);

        DraggableUtils.onInteraction(target);
      });
    }
  },
  initializeRotationHandle(rotationHandle, container) {
    // Position the handle initially
    interact(rotationHandle).draggable({
      listeners: {
        start(event) {
          const rotationHandleRect = rotationHandle.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const style = window.getComputedStyle(container);
          const matrix = new DOMMatrixReadOnly(style.transform);
          x = matrix.m41;
          y = matrix.m42;

          // Calculate the center of the container
          const containerCenterX = containerRect.left + containerRect.width / 2;
          const containerCenterY = containerRect.top + containerRect.height / 2;

          // Calculate the center of the rotation handle
          const handleCenterX =
            rotationHandleRect.left + rotationHandleRect.width / 2;
          const handleCenterY =
            rotationHandleRect.top + rotationHandleRect.height / 2;

          // Calculate the offset between the container center and the handle
          const offsetX = containerCenterX - handleCenterX;
          const offsetY = containerCenterY - handleCenterY;

          // Find the point relative to the current mouse position
          const centerX = event.clientX + offsetX;
          const centerY = event.clientY + offsetY;

          // Store the initial mouse angle relative to the center
          const initialMouseAngle = Math.atan2(
            event.pageY - centerY,
            event.pageX - centerX
          );

          container.setAttribute("data-initial-mouse-angle", initialMouseAngle);
          container.setAttribute("data-initial-x", centerX);
          container.setAttribute("data-initial-y", centerY);
        },
        move(event) {
          // Calculate the center of the element in the viewport
          const centerX = container.getAttribute("data-initial-x");

          const centerY = container.getAttribute("data-initial-y");

          const startAngle =
            parseFloat(container.getAttribute("data-angle")) || 0;
          const initialMouseAngle =
            parseFloat(container.getAttribute("data-initial-mouse-angle")) || 0;
          // Calculate the current mouse angle relative to the center
          const currentMouseAngle = Math.atan2(
            event.pageY - centerY,
            event.pageX - centerX
          );

          const rawAngleDelta = currentMouseAngle - initialMouseAngle;
          const angleDelta = DraggableUtils.normalizeAngle(
            rawAngleDelta * 0.05
          ); // Adjust sensitivity here

          // Compute the new angle
          let newAngle = startAngle + angleDelta;
          // Apply the rotation
          container.style.transform = `translate(${x}px, ${y}px) rotate(${newAngle}rad)`;
          container.setAttribute("data-angle", newAngle);
          container.setAttribute("data-bs-x", x);
          container.setAttribute("data-bs-y", y);
        },
        end(event) {
          const currentAngle =
            parseFloat(container.getAttribute("data-angle")) || 0;
          container.setAttribute("data-angle", currentAngle); // Persist the final angle
        },
      },
    });
  },
  normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  },
  onInteraction(target) {
    // this.boxDragContainer.appendChild(target);
    // target.appendChild(target.querySelector(".display-canvas"));
  },
  createDraggableCanvasFromUrl(dataUrl) {
    return new Promise((resolve) => {
      const canvasContainer = document.createElement("div");
      const createdCanvas = document.createElement("canvas");
      const padding = this.padding;
      canvasContainer.id = `draggable-canvas-${this.nextId++}`;
      canvasContainer.classList.add("draggable-canvas");
      createdCanvas.classList.add("display-canvas");
      canvasContainer.style.padding = padding + "px";
      const x = 0;
      const y = 20;
      canvasContainer.style.transform = `translate(${x}px, ${y}px) rotate(${0}rad)`;
      canvasContainer.setAttribute("data-bs-x", x);
      canvasContainer.setAttribute("data-bs-y", y);
      canvasContainer.style.transform = `translate(${x}px, ${y}px) rotate(${0}rad)`;
      //Click element in order to enable arrow keys
      canvasContainer.addEventListener("click", () => {
        this.lastInteracted = canvasContainer;
      });

      canvasContainer.onclick = (e) => this.onInteraction(e.target);
      canvasContainer.appendChild(createdCanvas);
      this.boxDragContainer.appendChild(canvasContainer);
      // Add a rotation handle
      const rotationHandle = document.createElement("div");
      rotationHandle.classList.add("rotation-handle");
      canvasContainer.appendChild(rotationHandle);
      this.initializeRotationHandle(rotationHandle, canvasContainer);
      //Enable Arrow keys directly after the element is created
      this.lastInteracted = canvasContainer;

      var myImage = new Image();
      myImage.src = dataUrl;
      myImage.onload = () => {
        // Scale the image to fit within the canvas
        const imgAspect = myImage.width / myImage.height;
        const canvasAspect =
          this.boxDragContainer.offsetWidth /
          this.boxDragContainer.offsetHeight;

        let scaleMultiplier;

        // Subtract padding from the container's dimensions
        const availableWidth = this.boxDragContainer.offsetWidth - 2 * padding;
        const availableHeight =
          this.boxDragContainer.offsetHeight - 2 * padding;

        // Determine the scale multiplier based on the aspect ratio
        if (imgAspect > canvasAspect) {
          scaleMultiplier = availableWidth / myImage.width;
        } else {
          scaleMultiplier = availableHeight / myImage.height;
        }

        // Apply scaling if necessary
        let newWidth = myImage.width;
        let newHeight = myImage.height;
        if (scaleMultiplier < 1) {
          newWidth = myImage.width * scaleMultiplier;
          newHeight = myImage.height * scaleMultiplier;
        }
        // Subtract padding from the final dimensions
        newWidth = Math.max(0, newWidth - 2 * padding);
        newHeight = Math.max(0, newHeight - 2 * padding);

        // Resize the canvas to fit the image
        myImage.width = newWidth;
        myImage.height = newHeight;
        createdCanvas.width = newWidth;
        createdCanvas.height = newHeight;
        createdCanvas.style.width = `${newWidth}px`;
        createdCanvas.style.height = `${newHeight}px`;

        // Update the container dimensions
        canvasContainer.style.width = `${newWidth + 2 * padding}px`;
        canvasContainer.style.height = `${newHeight + 2 * padding}px`;
        canvasContainer.style.width = `${newWidth + 2 * padding}px`;
        canvasContainer.style.height = `${newHeight + 2 * padding}px`;

        // Draw the image onto the canvas
        var context = createdCanvas.getContext("2d");
        context.drawImage(myImage, 0, 0, myImage.width, myImage.height);

        resolve(canvasContainer);
      };
    });
  },
  deleteAllDraggableCanvases() {
    this.boxDragContainer
      .querySelectorAll(".draggable-canvas")
      .forEach((el) => el.remove());
  },
  async addAllPagesDraggableCanvas(element) {
    if (element) {
      let currentPage = this.pageIndex;
      if (!this.elementAllPages.includes(element)) {
        this.elementAllPages.push(element);
        element.style.filter = "sepia(1) hue-rotate(90deg) brightness(1.2)";
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
            pagesMap[`${pageIndex}-offsetWidth`] =
              pagesMap[`${page}-offsetWidth`];
            pagesMap[`${pageIndex}-offsetHeight`] =
              pagesMap[`${page}-offsetHeight`];
          }
          await this.goToPage(pageIndex);
        }
      } else {
        const index = this.elementAllPages.indexOf(element);
        if (index !== -1) {
          this.elementAllPages.splice(index, 1);
        }
        element.style.filter = "";
        let pagesMap = this.documentsMap.get(this.pdfDoc);

        if (!pagesMap) {
          pagesMap = {};
          this.documentsMap.set(this.pdfDoc, pagesMap);
        }
        for (let pageIndex = 0; pageIndex < this.pdfDoc.numPages; pageIndex++) {
          if (
            pagesMap[`${pageIndex}-offsetWidth`] &&
            pageIndex != currentPage
          ) {
            const pageElements = pagesMap[pageIndex];
            pageElements.forEach((elementPage) => {
              const elementIndex = pageElements.findIndex(
                (elementPage) => elementPage["element"].id === element.id
              );
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
    return this.boxDragContainer.querySelector(
      ".draggable-canvas:last-of-type"
    );
  },

  storePageContents() {
    var pagesMap = this.documentsMap.get(this.pdfDoc);
    if (!pagesMap) {
      pagesMap = {};
    }

    const elements = [
      ...this.boxDragContainer.querySelectorAll(".draggable-canvas"),
    ];
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
      draggablesData.forEach((draggableData) =>
        this.boxDragContainer.appendChild(draggableData.element)
      );
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

      const page = pdfDocModified.getPage(parseInt(pageIdx));
      let draggablesData = pagesMap[pageIdx];

      const offsetWidth = pagesMap[pageIdx + "-offsetWidth"];
      const offsetHeight = pagesMap[pageIdx + "-offsetHeight"];

      for (const draggableData of draggablesData) {
        // Embed the draggable canvas
        const draggableElement =
          draggableData.element.querySelector(".display-canvas");
        draggableElement.style.transform =
          draggableData.element.style.transform;
        const response = await fetch(draggableElement.toDataURL());
        const draggableImgBytes = await response.arrayBuffer();
        const pdfImageObject = await pdfDocModified.embedPng(draggableImgBytes);

        // Extract transformation data
        const transform = draggableElement.style.transform || "";
        const translateRegex =
          /translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/;
        const rotateRegex = /rotate\((-?\d+(?:\.\d+)?)rad\)/;

        const translateMatch = transform.match(translateRegex);
        const rotateMatch = transform.match(rotateRegex);

        const translateX = translateMatch ? parseFloat(translateMatch[1]) : 0;
        const translateY = translateMatch ? parseFloat(translateMatch[2]) : 0;
        const rotateAngle = rotateMatch
          ? parseFloat(rotateMatch[1])
          : parseFloat(draggableElement.getAttribute("data-angle")) || 0; // Fallback to data-angle

        const draggablePositionPixels = {
          x: translateX + this.padding,
          y: translateY + this.padding,
          width: draggableData.offsetWidth - 2 * this.padding,
          height: draggableData.offsetHeight - 2 * this.padding,
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
        let y =
          heightAdjusted - draggablePositionPdf.y - draggablePositionPdf.height;

        let originx = x + draggablePositionPdf.width / 2;
        let originy =
          heightAdjusted -
          draggablePositionPdf.y -
          draggablePositionPdf.height / 2;

        if (normalizedAngle === 90) {
          x = draggablePositionPdf.y + draggablePositionPdf.height;
          y = draggablePositionPdf.x;
        } else if (normalizedAngle === 180) {
          x = widthAdjusted - draggablePositionPdf.x;
          y = draggablePositionPdf.y + draggablePositionPdf.height;
        } else if (normalizedAngle === 270) {
          x =
            heightAdjusted -
            draggablePositionPdf.y -
            draggablePositionPdf.height;
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
          PDFLib.concatTransformationMatrix(
            1,
            0,
            0,
            1,
            -1 * originx,
            -1 * originy
          )
        );
        page.drawImage(pdfImageObject, {
          x: x,
          y: y,
          width: draggablePositionPdf.width,
          height: draggablePositionPdf.height,
        });
        page.pushOperators(PDFLib.popGraphicsState());
        draggableElement.style.transform = "";
      }
    }

    this.loadPageContents();
    return pdfDocModified;
  },
};

document.addEventListener("DOMContentLoaded", () => {
  DraggableUtils.init();
});
