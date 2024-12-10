import { PDFViewerApplication } from "../pdfjs-legacy/js/viewer.mjs";
import UUID from "./uuid.js";

let zoomScaleValue = 1.0;

let activeOverlay;

const doNothing = () => {};

function hideContainer(container) {
  container?.classList.add("d-none");
}

window.addEventListener("load", (e) => {
  let hiddenInput = document.getElementById("fileInput");
  let outerContainer = document.getElementById("outerContainer");
  let printContainer = document.getElementById("printContainer");

  let viewer = document.getElementById("viewer");

  hiddenInput.files = undefined;
  let redactionMode = "drawing";

  document.documentElement.style.setProperty(
    "--textLayer-pointer-events",
    "none"
  );

  let redactions = [];

  let redactionsInput = document.getElementById("redactions-input");

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
    document.getElementById("print")?.remove();
    document.getElementById("download")?.remove();
    document.getElementById("editorStamp")?.remove();
    document.getElementById("editorFreeText")?.remove();
    document.getElementById("editorInk")?.remove();
    document.getElementById("secondaryToolbarToggle")?.remove();

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

    function initDraw(canvas, redactionsContainer) {
      function setMousePosition(e) {
        let ev = e || window.event; //Moz || IE
        if (ev.pageX) {
          //Moz
          mouse.x = e.layerX / zoomScaleValue;
          mouse.y = e.layerY / zoomScaleValue;
        }
      }

      let mouse = {
        x: 0,
        y: 0,
        startX: 0,
        startY: 0,
      };
      let element = null;
      let drawnRedaction = null;

      canvas.onpointermove = function (e) {
        setMousePosition(e);
        if (element !== null) {
          let width = Math.abs(mouse.x - mouse.startX);
          element.style.width = `calc(${width}px * var(--zoom-scale))`;

          let height = Math.abs(mouse.y - mouse.startY);
          element.style.height = `calc(${height}px * var(--zoom-scale))`;

          let left = mouse.x - mouse.startX < 0 ? mouse.x : mouse.startX;
          element.style.left = `calc(${left}px * var(--zoom-scale))`;

          let top = mouse.y - mouse.startY < 0 ? mouse.y : mouse.startY;
          element.style.top = `calc(${top}px * var(--zoom-scale))`;

          if (drawnRedaction) {
            let scaleFactor = parseFloat(
              viewer.style.getPropertyValue("--scale-factor")
            );
            drawnRedaction.width = width / scaleFactor;
            drawnRedaction.height = height / scaleFactor;
          }
        }
      };

      canvas.onclick = function (e) {
        if (element !== null) {
          element.classList.add("selected-wrapper");
          element.classList.remove("rectangle");

          redactions.push(drawnRedaction);
          let stringifiedRedactions = JSON.stringify(
            redactions.map((red) => ({
              x: red.left,
              y: red.top,
              width: red.width,
              height: red.height,
              page: red.pageNumber,
            }))
          );
          redactionsInput.value = stringifiedRedactions;

          element = null;
          drawnRedaction = null;
          canvas.style.cursor = "default";

          console.log("finished.");
        } else {
          if (redactionMode !== "drawing") {
            console.warn(
              "Drawing attempt when redaction mode is ",
              redactionMode
            );
            return;
          }
          console.log("begun.");
          mouse.startX = mouse.x;
          mouse.startY = mouse.y;

          element = document.createElement("div");
          element.className = "rectangle";

          let left = mouse.x;
          let top = mouse.y;

          element.style.left = `calc(${left}px * var(--zoom-scale))`;
          element.style.top = `calc(${top}px * var(--zoom-scale))`;

          let scaleFactor = parseFloat(
            viewer.style.getPropertyValue("--scale-factor")
          );
          drawnRedaction = {
            left: left / scaleFactor,
            top: top / scaleFactor,
            width: 0.0,
            height: 0.0,
            pageNumber: parseInt(canvas.getAttribute("data-page")),
            element: element,
            id: UUID.uuidv4(),
          };

          redactionsContainer.appendChild(element);
          canvas.style.cursor = "crosshair";
        }
      };
    }
  });

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
    const isRedactionShortcut =
      e.ctrlKey && (e.key == "s" || e.key == "S" || e.code == "KeyS");
    if (!isRedactionShortcut || redactionMode !== "text") return;

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
    let scaleFactor = parseFloat(
      viewer.style.getPropertyValue("--scale-factor")
    );
    for (const rect of rects) {
      if (!rect || !rect.width || !rect.height) continue;
      let redactionElement = document.createElement("div");
      redactionElement.classList.add("selected-wrapper");

      let left = rect.left - textLayerRect.left;
      let top = rect.top - textLayerRect.top;

      let width = rect.width;
      let height = rect.height;

      left = left / zoomScaleValue;
      top = top / zoomScaleValue;
      width = width / zoomScaleValue;
      height = height / zoomScaleValue;

      let redactionInfo = {
        left: (rect.left - textLayerRect.left) / scaleFactor,
        top: (rect.top - textLayerRect.top) / scaleFactor,
        width: rect.width / scaleFactor,
        height: rect.height / scaleFactor,
        pageNumber: parseInt(pageNumber),
        element: redactionElement,
        id: UUID.uuidv4(),
      };

      redactions.push(redactionInfo);

      redactionElement.style.left = `calc(${left}px * var(--zoom-scale))`;
      redactionElement.style.top = `calc(${top}px * var(--zoom-scale))`;

      redactionElement.style.width = `calc(${width}px * var(--zoom-scale))`;
      redactionElement.style.height = `calc(${height}px * var(--zoom-scale))`;

      redactionsArea.appendChild(redactionElement);

      let redactionOverlay = document.createElement("div");

      let deleteBtn = $(
        `<svg class="delete-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="#e8eaed"><path d="M312-144q-29.7 0-50.85-21.15Q240-186.3 240-216v-480h-48v-72h192v-48h192v48h192v72h-48v479.57Q720-186 698.85-165T648-144H312Zm336-552H312v480h336v-480ZM384-288h72v-336h-72v336Zm120 0h72v-336h-72v336ZM312-696v480-480Z"/></svg>`
      )[0];

      deleteBtn.onclick = (e) => {
        redactions = redactions.filter((red) => redactionInfo.id != red.id);
        redactionElement.remove();
        redactionsInput.value = redactions
          .filter((red) => redactionInfo.id != red.id)
          .map((red) => ({
            x: red.left,
            y: red.top,
            width: red.width,
            height: red.height,
            page: pageNumber,
          }));
        activeOverlay = null;
      };
      redactionOverlay.appendChild(deleteBtn);

      redactionOverlay.classList.add("redaction-overlay");
      redactionOverlay.style.display = "none";

      redactionElement.onclick = (e) => {
        if (e.target != redactionElement) return;
        activeOverlay = redactionOverlay;
        activeOverlay.style.display = "flex";
      };

      redactionElement.appendChild(redactionOverlay);
    }

    let stringifiedRedactions = JSON.stringify(
      redactions.map((red) => ({
        x: red.left,
        y: red.top,
        width: red.width,
        height: red.height,
        page: red.pageNumber,
      }))
    );
    redactionsInput.value = stringifiedRedactions;
  });
});
