import { PDFViewerApplication } from "../pdfjs-legacy/js/viewer.mjs";
import UUID from "./uuid.js";

let zoomScaleValue = 1.0;

let activeOverlay;

const doNothing = () => {};

function hideContainer(container) {
  container?.classList.add("d-none");
}

const RedactionModes = Object.freeze({
  DRAWING: Symbol("drawing"),
  TEXT: Symbol("text"),
  NONE: Symbol("none"),
});

function removePDFJSButtons() {
  document.getElementById("print")?.remove();
  document.getElementById("download")?.remove();
  document.getElementById("editorStamp")?.remove();
  document.getElementById("editorFreeText")?.remove();
  document.getElementById("editorInk")?.remove();
  document.getElementById("secondaryToolbarToggle")?.remove();
  document.getElementById("openFile")?.remove();
}

window.addEventListener("load", (e) => {
  let hiddenInput = document.getElementById("fileInput");
  let outerContainer = document.getElementById("outerContainer");
  let printContainer = document.getElementById("printContainer");

  let viewer = document.getElementById("viewer");

  hiddenInput.files = undefined;
  let redactionMode = RedactionModes.NONE;

  let redactions = [];

  let redactionsInput = document.getElementById("redactions-input");

  let redactionsPalette = document.getElementById("redactions-palette");
  let redactionsPaletteInput = redactionsPalette.querySelector("input");

  let applyRedactionBtn = document.getElementById("apply-redaction");

  viewer.onmouseup = (e) => {
    if (redactionMode !== RedactionModes.TEXT) return;
    const containsText =
      window.getSelection() && window.getSelection().toString() != "";
    applyRedactionBtn.disabled = !containsText;
  };

  applyRedactionBtn.onclick = (e) => {
    if (redactionMode !== RedactionModes.TEXT) {
      applyRedactionBtn.disabled = true;
      return;
    }
    redactTextSelection();
    applyRedactionBtn.disabled = true;
  };

  redactionsPaletteInput.onchange = (e) => {
    let color = e.target.value;
    redactionsPalette.style.setProperty("--palette-color", color);
  };

  document.addEventListener("file-input-change", (e) => {
    let fileChooser = document.getElementsByClassName("custom-file-chooser")[0];
    let fileChooserInput = fileChooser.querySelector(
      `#${fileChooser.getAttribute("data-bs-element-id")}`
    );

    hiddenInput.files = fileChooserInput.files;
    if (!hiddenInput.files || hiddenInput.files.length === 0) {
      hideContainer(outerContainer);
      hideContainer(printContainer);
    } else {
      outerContainer?.classList.remove("d-none");
      printContainer?.classList.remove("d-none");
    }

    hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
  });

  PDFViewerApplication.downloadOrSave = doNothing;
  PDFViewerApplication.triggerPrinting = doNothing;

  PDFViewerApplication.eventBus.on("pagerendered", (e) => {
    removePDFJSButtons();

    let textSelectionRedactionBtn = document.getElementById(
      "man-text-select-redact"
    );
    let drawRedactionBtn = document.getElementById("man-shape-redact");

    textSelectionRedactionBtn.onclick = _handleTextSelectionRedactionBtnClick;
    drawRedactionBtn.onclick = _handleDrawRedactionBtnClick;

    let layer = e.source.textLayer.div;
    layer.setAttribute("data-page", e.pageNumber);
    zoomScaleValue = e.source.scale ? e.source.scale : e.source.pageScale;
    document.documentElement.style.setProperty("--zoom-scale", zoomScaleValue);

    let redactionsContainer = document.getElementById(
      `redactions-container-${e.pageNumber}`
    );
    if (!redactionsContainer) {
      redactionsContainer = document.createElement("div");
      redactionsContainer.style.position = "relative";
      redactionsContainer.style.height = "100%";
      redactionsContainer.style.width = "100%";
      redactionsContainer.id = `redactions-container-${e.pageNumber}`;
      redactionsContainer.style.setProperty("z-index", "unset");

      layer.appendChild(redactionsContainer);
    }

    initDraw(layer, redactionsContainer);

    function _handleTextSelectionRedactionBtnClick(e) {
      if (textSelectionRedactionBtn.classList.contains("toggled")) {
        resetTextSelection();
      } else {
        resetDrawRedactions();
        textSelectionRedactionBtn.classList.add("toggled");
        redactionMode = RedactionModes.TEXT;
        const containsText =
          window.getSelection() && window.getSelection().toString() != "";
        applyRedactionBtn.disabled = !containsText;
      }
    }

    function resetTextSelection() {
      textSelectionRedactionBtn.classList.remove("toggled");
      redactionMode = RedactionModes.NONE;
      clearSelection();
    }

    function clearSelection() {
      if (window.getSelection) {
        if (window.getSelection().empty) {
          // Chrome
          window.getSelection().empty();
        } else if (window.getSelection().removeAllRanges) {
          // Firefox
          window.getSelection().removeAllRanges();
        }
      } else if (document.selection) {
        // IE?
        document.selection.empty();
      }
    }

    function _handleDrawRedactionBtnClick(e) {
      if (drawRedactionBtn.classList.contains("toggled")) {
        resetDrawRedactions();
      } else {
        resetTextSelection();
        drawRedactionBtn.classList.add("toggled");
        document.documentElement.style.setProperty(
          "--textLayer-pointer-events",
          "none"
        );
        redactionMode = RedactionModes.DRAWING;
      }
    }

    function resetDrawRedactions() {
      redactionMode = RedactionModes.NONE;
      drawRedactionBtn.classList.remove("toggled");
      document.documentElement.style.setProperty(
        "--textLayer-pointer-events",
        "auto"
      );
      window.dispatchEvent(new CustomEvent("reset-drawing", { bubbles: true }));
    }

    function initDraw(canvas, redactionsContainer) {
      let mouse = {
        x: 0,
        y: 0,
        startX: 0,
        startY: 0,
      };
      let element = null;
      let drawnRedaction = null;

      window.addEventListener("reset-drawing", (e) => {
        _clearDrawing();
        canvas.style.cursor = "default";
        document.documentElement.style.setProperty(
          "--textLayer-pointer-events",
          "auto"
        );
      });

      window.addEventListener("drawing-entered", (e) => {
        let target = e.detail?.target;
        if (canvas === target) return;
        _clearDrawing();
      });

      window.addEventListener("cancel-drawing", (e) => {
        _clearDrawing();
        canvas.style.cursor = "default";
      });

      function setMousePosition(e) {
        let ev = e || window.event; //Moz || IE
        if (ev.pageX) {
          //Moz
          mouse.x = e.layerX;
          mouse.y = e.layerY;
        }
      }

      window.onkeydown = (e) => {
        if (e.key === "Escape" && redactionMode === RedactionModes.DRAWING) {
          window.dispatchEvent(
            new CustomEvent("cancel-drawing", { bubbles: true })
          );
        }
      };

      canvas.onpointerenter = (e) => {
        window.dispatchEvent(
          new CustomEvent("drawing-entered", {
            bubbles: true,
            detail: { target: canvas },
          })
        );
      };

      canvas.onpointermove = function (e) {
        setMousePosition(e);
        if (element !== null) {
          let scaleFactor = _getScaleFactor();

          let width = Math.abs(mouse.x - mouse.startX);
          element.style.width = _toCalcZoomPx(_scaleToDisplay(width));

          let height = Math.abs(mouse.y - mouse.startY);
          element.style.height = _toCalcZoomPx(_scaleToDisplay(height));

          let left = mouse.x - mouse.startX < 0 ? mouse.x : mouse.startX;
          element.style.left = _toCalcZoomPx(_scaleToDisplay(left));

          let top = mouse.y - mouse.startY < 0 ? mouse.y : mouse.startY;
          element.style.top = _toCalcZoomPx(_scaleToDisplay(top));

          if (drawnRedaction) {
            drawnRedaction.left = _scaleToPDF(left, scaleFactor);
            drawnRedaction.top = _scaleToPDF(top, scaleFactor);
            drawnRedaction.width = _scaleToPDF(width, scaleFactor);
            drawnRedaction.height = _scaleToPDF(height, scaleFactor);
          }
        }
      };

      canvas.onclick = function (e) {
        if (element !== null) {
          _saveAndResetDrawnRedaction();
          console.log("finished.");
        } else {
          if (redactionMode !== RedactionModes.DRAWING) {
            console.warn(
              "Drawing attempt when redaction mode is",
              redactionMode.description
            );
            return;
          }
          console.log("begun.");
          _captureAndDrawStartingPointOfDrawnRedaction();
        }
      };

      function _clearDrawing() {
        if (element) element.remove();
        element = null;
        drawnRedaction = null;
      }

      function _saveAndResetDrawnRedaction() {
        element.classList.add("selected-wrapper");
        element.classList.remove("rectangle");

        addRedactionOverlay(element, drawnRedaction);
        redactions.push(drawnRedaction);
        _setRedactionsInput(redactions);

        element = null;
        drawnRedaction = null;
        canvas.style.cursor = "default";
      }

      function _captureAndDrawStartingPointOfDrawnRedaction() {
        mouse.startX = mouse.x;
        mouse.startY = mouse.y;

        element = document.createElement("div");
        element.className = "rectangle";

        let left = mouse.x;
        let top = mouse.y;

        element.style.left = _toCalcZoomPx(_scaleToDisplay(left));
        element.style.top = _toCalcZoomPx(_scaleToDisplay(top));

        let scaleFactor = _getScaleFactor();
        let color = redactionsPalette.style.getPropertyValue("--palette-color");

        element.style.setProperty("--palette-color", color);

        drawnRedaction = {
          left: _scaleToPDF(left, scaleFactor),
          top: _scaleToPDF(top, scaleFactor),
          width: 0.0,
          height: 0.0,
          color: color,
          pageNumber: parseInt(canvas.getAttribute("data-page")),
          element: element,
          id: UUID.uuidv4(),
        };

        redactionsContainer.appendChild(element);
        canvas.style.cursor = "crosshair";
      }
    }
  });

  function _getScaleFactor() {
    return parseFloat(viewer.style.getPropertyValue("--scale-factor"));
  }

  function getTextLayer(element) {
    let current = element;
    while (current) {
      if (
        current instanceof HTMLDivElement &&
        current.classList.contains("textLayer")
      )
        return current;
      current = current.parentElement;
    }

    return current;
  }

  document.onclick = (e) => {
    if (
      (e.target &&
        e.target.classList.contains("selected-wrapper") &&
        e.target.firstChild == activeOverlay) ||
      e.target == activeOverlay
    )
      return;
    if (activeOverlay) {
      activeOverlay.style.display = "none";
      activeOverlay = null;
    }
  };

  document.addEventListener("keydown", (e) => {
    if (e.key === "Delete" && activeOverlay) {
      activeOverlay
        .querySelector(".delete-icon")
        ?.dispatchEvent(new Event("click", { bubbles: true }));
      return;
    }
    const isRedactionShortcut =
      e.ctrlKey && (e.key == "s" || e.key == "S" || e.code == "KeyS");
    if (!isRedactionShortcut || redactionMode !== RedactionModes.TEXT) return;

    redactTextSelection();
  });

  function redactTextSelection() {
    let selection = window.getSelection();
    if (!selection || selection.rangeCount <= 0) return;
    let range = selection.getRangeAt(0);

    let textLayer = getTextLayer(range.startContainer);
    if (!textLayer) return;

    const pageNumber = textLayer.getAttribute("data-page");
    let redactionsArea = textLayer.querySelector(
      `#redactions-container-${pageNumber}`
    );
    let textLayerRect = textLayer.getBoundingClientRect();

    let rects = range.getClientRects();
    let scaleFactor = _getScaleFactor();

    let color = redactionsPalette.style.getPropertyValue("--palette-color");

    for (const rect of rects) {
      if (!rect || !rect.width || !rect.height) continue;
      let redactionElement = document.createElement("div");
      redactionElement.classList.add("selected-wrapper");

      let left = rect.left - textLayerRect.left;
      let top = rect.top - textLayerRect.top;

      let width = rect.width;
      let height = rect.height;

      left = _scaleToDisplay(left);
      top = _scaleToDisplay(top);
      width = _scaleToDisplay(width);
      height = _scaleToDisplay(height);

      let redactionInfo = {
        left: _scaleToPDF(rect.left - textLayerRect.left, scaleFactor),
        top: _scaleToPDF(rect.top - textLayerRect.top, scaleFactor),
        width: _scaleToPDF(rect.width, scaleFactor),
        height: _scaleToPDF(rect.height, scaleFactor),
        pageNumber: parseInt(pageNumber),
        color: color,
        element: redactionElement,
        id: UUID.uuidv4(),
      };

      redactions.push(redactionInfo);

      redactionElement.style.left = _toCalcZoomPx(left);
      redactionElement.style.top = _toCalcZoomPx(top);

      redactionElement.style.width = _toCalcZoomPx(width);
      redactionElement.style.height = _toCalcZoomPx(height);
      redactionElement.style.setProperty("--palette-color", color);

      redactionsArea.appendChild(redactionElement);

      addRedactionOverlay(redactionElement, redactionInfo);
    }

    _setRedactionsInput(redactions);
  }

  function _scaleToDisplay(value) {
    return value / zoomScaleValue;
  }

  function _scaleToPDF(value, scaleFactor) {
    if (!scaleFactor)
      scaleFactor = document.documentElement.getPropertyValue("--scale-factor");
    return value / scaleFactor;
  }

  function _toCalcZoomPx(val) {
    return `calc(${val}px * var(--zoom-scale))`;
  }

  function _setRedactionsInput(redactions) {
    let stringifiedRedactions = JSON.stringify(
      redactions.filter(_nonEmptyRedaction).map((red) => ({
        x: red.left,
        y: red.top,
        width: red.width,
        height: red.height,
        color: red.color,
        page: red.pageNumber,
      }))
    );
    redactionsInput.value = stringifiedRedactions;
  }

  function addRedactionOverlay(redactionElement, redactionInfo) {
    let redactionOverlay = document.createElement("div");

    let deleteBtn = $(
      `<svg class="delete-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="#e8eaed"><path d="M312-144q-29.7 0-50.85-21.15Q240-186.3 240-216v-480h-48v-72h192v-48h192v48h192v72h-48v479.57Q720-186 698.85-165T648-144H312Zm336-552H312v480h336v-480ZM384-288h72v-336h-72v336Zm120 0h72v-336h-72v336ZM312-696v480-480Z"/></svg>`
    )[0];

    deleteBtn.onclick = (e) => {
      redactions = redactions.filter((red) => redactionInfo.id != red.id);
      redactionElement.remove();
      _setRedactionsInput(redactions);
      activeOverlay = null;
    };

    let colorPaletteLabel = $(
      `<label class="material-symbols-rounded palette-color">
         palette
       </label>`
    )[0];

    let colorPaletteInput = $(`
         <input type="color" name="color-picker" class="d-none">
      `)[0];

    colorPaletteLabel.appendChild(colorPaletteInput);

    colorPaletteInput.onchange = (e) => {
      let color = e.target.value;
      redactionElement.style.setProperty("--palette-color", color);
      let redactionIdx = redactions.findIndex(
        (red) => redactionInfo.id === red.id
      );
      if (redactionIdx < 0) return;
      redactions[redactionIdx].color = color;
      _setRedactionsInput(redactions);
    };

    redactionOverlay.appendChild(deleteBtn);
    redactionOverlay.appendChild(colorPaletteLabel);

    redactionOverlay.classList.add("redaction-overlay");
    redactionOverlay.style.display = "none";

    redactionElement.onclick = (e) => {
      if (e.target != redactionElement) return;
      activeOverlay = redactionOverlay;
      activeOverlay.style.display = "flex";
    };

    redactionElement.appendChild(redactionOverlay);
  }
});

function _isEmptyRedaction(redaction) {
  return (
    redaction.left == null ||
    redaction.top == null ||
    redaction.width == null ||
    redaction.height == null ||
    redaction.pageNumber == null
  );
}

function _nonEmptyRedaction(redaction) {
  return !_isEmptyRedaction(redaction);
}
