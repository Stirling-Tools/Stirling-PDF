import UUID from "./uuid.js";
import { PDFViewerApplication } from "../pdfjs-legacy/js/viewer.mjs";

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

  hiddenInput.files = undefined;

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

  // TODO: Replace ctrl Shift with Ctrl S
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

    let redactionsContainer = document.createElement("div");
    redactionsContainer.style.position = "relative";
    redactionsContainer.style.height = "100%";
    redactionsContainer.style.width = "100%";
    redactionsContainer.id = `redactions-container-${e.pageNumber}`;
    redactionsContainer.style.setProperty("z-index", "unset");

    layer.appendChild(redactionsContainer);
  });
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

let redactions = [];

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
  // TODO: change keys
  const redact = e.ctrlKey && e.shiftKey;
  if (redact) {
    let selection = window.getSelection();
    if (!selection || selection.rangeCount <= 0) return;
    let range = selection.getRangeAt(0);

    let textLayer = getTextLayer(range.startContainer);
    if (!textLayer) return;

    let redactionsArea = textLayer.querySelector(
      `#redactions-container-${textLayer.getAttribute("data-page")}`
    );
    let textLayerRect = textLayer.getBoundingClientRect();

    let rects = range.getClientRects();
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
        left,
        top,
        width,
        height,
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
  }
});
