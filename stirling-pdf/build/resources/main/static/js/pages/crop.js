let pdfCanvas = document.getElementById('cropPdfCanvas');
let overlayCanvas = document.getElementById('overlayCanvas');
let canvasesContainer = document.getElementById('canvasesContainer');
canvasesContainer.style.display = 'none';
let containerRect = canvasesContainer.getBoundingClientRect();

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

function renderPageFromFile(file) {
  if (file.type === 'application/pdf') {
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
    if (fileInput.files.length == 0) return;
    let canvasesContainer = document.getElementById('canvasesContainer');
    let containerRect = canvasesContainer.getBoundingClientRect();

    context.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);

    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    pdfCanvas.width = containerRect.width;
    pdfCanvas.height = containerRect.height;

    overlayCanvas.width = containerRect.width;
    overlayCanvas.height = containerRect.height;

    let file = fileInput.files[0];
    renderPageFromFile(file);
  }, 1000);
});

fileInput.addEventListener('change', function (e) {
  fileInput.addEventListener('file-input-change', async (e) => {
    const {allFiles} = e.detail;
    if (allFiles && allFiles.length > 0) {
      canvasesContainer.style.display = 'block'; // set for visual purposes
      let file = allFiles[0];
      renderPageFromFile(file);
    }
  });
});

cropForm.addEventListener('submit', function (e) {
  if (xInput.value == '' && yInput.value == '' && widthInput.value == '' && heightInput.value == '') {
    // Ορίστε συντεταγμένες για ολόκληρη την επιφάνεια του PDF
    xInput.value = 0;
    yInput.value = 0;
    widthInput.value = containerRect.width;
    heightInput.value = containerRect.height;
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
  pdfDoc.getPage(pageNumber).then(function (page) {
    let canvasesContainer = document.getElementById('canvasesContainer');
    let containerRect = canvasesContainer.getBoundingClientRect();

    pageScale = containerRect.width / page.getViewport({scale: 1}).width; // The new scale

    let viewport = page.getViewport({scale: containerRect.width / page.getViewport({scale: 1}).width});

    canvasesContainer.width = viewport.width;
    canvasesContainer.height = viewport.height;

    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;

    overlayCanvas.width = viewport.width; // Match overlay canvas size with PDF canvas
    overlayCanvas.height = viewport.height;

    let renderContext = {canvasContext: context, viewport: viewport};
    page.render(renderContext);
    pdfCanvas.classList.add('shadow-canvas');
  });
}
