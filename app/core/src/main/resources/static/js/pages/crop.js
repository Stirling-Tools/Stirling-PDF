let pdfCanvas = document.getElementById('cropPdfCanvas');
let overlayCanvas = document.getElementById('overlayCanvas');
let canvasesContainer = document.getElementById('canvasesContainer');
canvasesContainer.style.display = 'none';

let context = pdfCanvas.getContext('2d');
let overlayContext = overlayCanvas.getContext('2d');

overlayCanvas.width = pdfCanvas.width;
overlayCanvas.height = pdfCanvas.height;

let isDrawing = false; // New flag to check if drawing is ongoing

let cropForm = document.getElementById('cropForm');
let fileInput = document.getElementById('fileInput-input');
let xInput = document.getElementById('x');
let yInput = document.getElementById('y');
let widthInput = document.getElementById('width');
let heightInput = document.getElementById('height');

let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;

let startX = 0;
let startY = 0;
let rectWidth = 0;
let rectHeight = 0;

let pageScale = 1; // The scale which the pdf page renders
let timeId = null; // timeout id for resizing canvases event
let currentRenderTask = null; // Track current PDF render task to cancel if needed

function renderPageFromFile(file) {
  if (file.type === 'application/pdf') {
    // Cancel any ongoing render task when loading a new file
    if (currentRenderTask) {
      currentRenderTask.cancel();
      currentRenderTask = null;
    }

    let reader = new FileReader();
    reader.onload = function (ev) {
      let typedArray = new Uint8Array(reader.result);
      pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs-legacy/pdf.worker.mjs';
      pdfjsLib.getDocument(typedArray).promise.then(function (pdf) {
        pdfDoc = pdf;
        totalPages = pdf.numPages;
        renderPage(currentPage);
      });
    };
    reader.readAsArrayBuffer(file);
  }
}

window.addEventListener('resize', function () {
  clearTimeout(timeId);

  timeId = setTimeout(function () {
    if (!pdfDoc) return; // Only resize if we have a PDF loaded
    let canvasesContainer = document.getElementById('canvasesContainer');
    let containerRect = canvasesContainer.getBoundingClientRect();

    context.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);

    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Re-render with new container size
    renderPage(currentPage);
  }, 1000);
});

fileInput.addEventListener('file-input-change', async (e) => {
  if (!e.detail) return; // Guard against null detail
  const {allFiles} = e.detail;
  if (allFiles && allFiles.length > 0) {
    canvasesContainer.style.display = 'block'; // set for visual purposes

    // Wait for the layout to be updated before rendering
    setTimeout(() => {
      let file = allFiles[0];
      renderPageFromFile(file);
    }, 100);
  }
});

cropForm.addEventListener('submit', function (e) {
  if (xInput.value == '' && yInput.value == '' && widthInput.value == '' && heightInput.value == '') {
    // Set coordinates for the entire PDF surface
    let currentContainerRect = canvasesContainer.getBoundingClientRect();
    xInput.value = 0;
    yInput.value = 0;
    widthInput.value = currentContainerRect.width;
    heightInput.value = currentContainerRect.height;
  }
});

overlayCanvas.addEventListener('mousedown', function (e) {
  // Clear previously drawn rectangle on the main canvas
  context.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
  renderPage(currentPage); // Re-render the PDF

  // Clear the overlay canvas to ensure old drawings are removed
  overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  startX = e.offsetX;
  startY = e.offsetY;
  isDrawing = true;
});

overlayCanvas.addEventListener('mousemove', function (e) {
  if (!isDrawing) return;
  overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); // Clear previous rectangle

  rectWidth = e.offsetX - startX;
  rectHeight = e.offsetY - startY;
  overlayContext.strokeStyle = 'red';
  overlayContext.strokeRect(startX, startY, rectWidth, rectHeight);
});

overlayCanvas.addEventListener('mouseup', function (e) {
  isDrawing = false;

  rectWidth = e.offsetX - startX;
  rectHeight = e.offsetY - startY;

  let flippedY = pdfCanvas.height - e.offsetY;

  xInput.value = startX / pageScale;
  yInput.value = flippedY / pageScale;
  widthInput.value = rectWidth / pageScale;
  heightInput.value = rectHeight / pageScale;

  // Draw the final rectangle on the main canvas
  context.strokeStyle = 'red';
  context.strokeRect(startX, startY, rectWidth, rectHeight);

  overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); // Clear the overlay
});

function renderPage(pageNumber) {
  // Cancel any ongoing render task
  if (currentRenderTask) {
    currentRenderTask.cancel();
    currentRenderTask = null;
  }

  pdfDoc.getPage(pageNumber).then(function (page) {
    let canvasesContainer = document.getElementById('canvasesContainer');
    let containerRect = canvasesContainer.getBoundingClientRect();

    pageScale = containerRect.width / page.getViewport({scale: 1}).width; // The new scale

    // Normalize rotation to 0, 90, 180, or 270 degrees
    let normalizedRotation = ((page.rotate % 360) + 360) % 360;
    let viewport = page.getViewport({scale: pageScale, rotation: normalizedRotation});

    // Don't set container width, let CSS handle it
    canvasesContainer.style.height = viewport.height + 'px';

    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;

    overlayCanvas.width = viewport.width; // Match overlay canvas size with PDF canvas
    overlayCanvas.height = viewport.height;

    context.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);

    context.fillStyle = 'white';
    context.fillRect(0, 0, pdfCanvas.width, pdfCanvas.height);

    let renderContext = {canvasContext: context, viewport: viewport};
    currentRenderTask = page.render(renderContext);
    currentRenderTask.promise.then(function() {
      currentRenderTask = null;
      pdfCanvas.classList.add('shadow-canvas');
    }).catch(function(error) {
      if (error.name !== 'RenderingCancelledException') {
        console.error('PDF rendering error:', error);
      }
      currentRenderTask = null;
    });
  });
}
