let pdfCanvas = document.getElementById('cropPdfCanvas');
let overlayCanvas = document.getElementById('overlayCanvas');
let canvasesContainer = document.getElementById('canvasesContainer');
canvasesContainer.style.display = 'none';
// let paginationBtnContainer = ;

let context = pdfCanvas.getContext('2d');
let overlayContext = overlayCanvas.getContext('2d');

let btn1Object = document.getElementById('previous-page-btn');
let btn2Object = document.getElementById('next-page-btn');
overlayCanvas.width = pdfCanvas.width;
overlayCanvas.height = pdfCanvas.height;

let fileInput = document.getElementById('fileInput-input');

let file;

let pdfDoc = null;
let pageNumbers = document.getElementById('pageNumbers');
let currentPage = 1;
let totalPages = 0;

let startX = 0;
let startY = 0;
let rectWidth = 0;
let rectHeight = 0;

let timeId = null; // timeout id for resizing canvases event

btn1Object.addEventListener('click', function (e) {
  if (currentPage !== 1) {
    currentPage = currentPage - 1;
    pageNumbers.value = currentPage;

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
});

btn2Object.addEventListener('click', function (e) {
  if (currentPage !== totalPages) {
    currentPage = currentPage + 1;
    pageNumbers.value = currentPage;

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
});

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
      pageNumbers.value = currentPage;
    };
    reader.readAsArrayBuffer(file);
    document.getElementById('pagination-button-container').style.display = 'flex';
    document.getElementById('instruction-text').style.display = 'block';
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
      file = e.target.files[0];
      renderPageFromFile(file);
    }
  });
});

function renderPage(pageNumber) {
  pdfDoc.getPage(pageNumber).then(function (page) {
    let viewport = page.getViewport({scale: 1.0});
    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;

    overlayCanvas.width = viewport.width; // Match overlay canvas size with PDF canvas
    overlayCanvas.height = viewport.height;

    let renderContext = {canvasContext: context, viewport: viewport};
    page.render(renderContext);
    pdfCanvas.classList.add('shadow-canvas');
  });
}
