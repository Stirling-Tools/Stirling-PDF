import * as pdfjsLib from '../../pdfjs-legacy/pdf.mjs';
import {PDFViewerApplication} from '../../pdfjs-legacy/js/viewer.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs-legacy/pdf.worker.mjs';
let loadedPdf = null;
let pdfFileUrl = null;
let pdfBlobUrl = null;
document.getElementById('removeHeaderFooterForm').addEventListener('submit', async function (event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const responseContainer = document.getElementById('responseContainer');

    try {
        const response = await fetch(form.action, {
        method: form.method,
        body: formData,
        });

        const responseText = await response.text();

        responseContainer.textContent = responseText;
        responseContainer.className = 'alert alert-success';
    } catch (error) {
        responseContainer.textContent = 'An error occurred. Please try again.';
        responseContainer.className = 'alert alert-danger';
    }
});

document.addEventListener('DOMContentLoaded', () => {

  PDFViewerApplication.run();
  const fileInput = document.getElementById('fileInput-input');
  const pagesInput = document.getElementById("pageNumbers");
  const previewContainer = document.getElementById('previewContainer');
  const modeSelect = document.querySelector('select[name="mode"]');

  const overlayHeaderCheckbox = document.getElementById('overlay-removeHeader');
  const overlayFooterCheckbox = document.getElementById('overlay-removeFooter');
  const overlayHeaderMargin = document.getElementById('overlay-headerMargin');
  const overlayFooterMargin = document.getElementById('overlay-footerMargin');
  const customOverlayHeaderWrapper = document.getElementById("overlay-headerCustomMarginWrapper");
  const customOverlayFooterWrapper = document.getElementById("overlay-footerCustomMarginWrapper");
  const customOverlayHeaderInput = document.getElementById("overlay-headerCustomMarginInput");
  const customOverlayFooterInput = document.getElementById("overlay-footerCustomMarginInput");

  const marginOptions = document.getElementById("margin-options");
  const headerMarginColumn = document.getElementById("header-margin-column");
  const footerMarginColumn = document.getElementById("footer-margin-column");
  const mainHeaderCheckbox = document.getElementById("removeHeader");
  const mainFooterCheckbox = document.getElementById("removeFooter");
  const mainHeaderMargin = document.querySelector('select[name="headerMargin"]');
  const mainFooterMargin = document.querySelector('select[name="footerMargin"]');
  const customMainHeaderWrapper = document.getElementById("headerCustomMarginWrapper");
  const customMainFooterWrapper = document.getElementById("footerCustomMarginWrapper");
  const customMainHeaderInput = document.getElementById("headerCustomMarginInput");
  const customMainFooterInput = document.getElementById("footerCustomMarginInput");

  const viewerContainer = document.getElementById('viewerContainer');
  const viewer = document.getElementById('viewer');
  const pageNumberInput = document.getElementById('pageNumber');
  const numPagesLabel = document.getElementById('numPages');
  const scaleSelect = document.getElementById('scaleSelect');
  const zoomInBtn = document.getElementById('zoomIn');
  const zoomOutBtn = document.getElementById('zoomOut');
  const nextBtn = document.getElementById('next');
  const prevBtn = document.getElementById('previous');
  const closeBtn = document.getElementById('closeOverlay');
  const zoomButton = document.getElementById('zoomButton');

  const pageContainer = document.getElementById('page-container');
  const outerContainer = document.getElementById('outerContainer');

  let pdfDoc = null;
  let currentPage = 1;
  let currentScale = 1.0;

  // Sync margin controls between overlay and main form
  function syncMarginControls(fromOverlay) {

    const copyState = (source, target) => {
      target.headerCheckbox.checked = source.headerCheckbox.checked;
      target.footerCheckbox.checked = source.footerCheckbox.checked;
      target.headerMargin.value = source.headerMargin.value;
      target.footerMargin.value = source.footerMargin.value;
      target.headerMarginColumn.style.display = source.headerMarginColumn.style.display;
      target.footerMarginColumn.style.display = source.footerMarginColumn.style.display;
      target.customHeaderWrapper.style.display = source.customHeaderWrapper.style.display;
      target.customHeaderInput.value = source.customHeaderInput.value;
      target.customFooterWrapper.style.display = source.customFooterWrapper.style.display;
      target.customFooterInput.value = source.customFooterInput.value;
    };

    const overlay = {
      headerCheckbox: overlayHeaderCheckbox,
      footerCheckbox: overlayFooterCheckbox,
      headerMargin: overlayHeaderMargin,
      footerMargin: overlayFooterMargin,
      headerMarginColumn: overlayHeaderMargin,
      footerMarginColumn: overlayFooterMargin,
      customHeaderWrapper: customOverlayHeaderWrapper,
      customHeaderInput: customOverlayHeaderInput,
      customFooterWrapper: customOverlayFooterWrapper,
      customFooterInput: customOverlayFooterInput
    };

    const main = {
      headerCheckbox: mainHeaderCheckbox,
      footerCheckbox: mainFooterCheckbox,
      headerMargin: mainHeaderMargin,
      footerMargin: mainFooterMargin,
      headerMarginColumn: headerMarginColumn,
      footerMarginColumn: footerMarginColumn,
      customHeaderWrapper: customMainHeaderWrapper,
      customHeaderInput: customMainHeaderInput,
      customFooterWrapper: customMainFooterWrapper,
      customFooterInput: customMainFooterInput
    };

    if (fromOverlay) {
      copyState(overlay, main);
    } else {
      copyState(main, overlay);
    }
  }

  function toggleOverlayMarginOptions() {
      overlayHeaderMargin.style.display = overlayHeaderCheckbox.checked ? "block" : "none";
      overlayFooterMargin.style.display = overlayFooterCheckbox.checked ? "block" : "none";
      if(overlayHeaderMargin.value == "custom" && overlayHeaderCheckbox.checked){
      customOverlayHeaderWrapper.style.display = "block";
      }
      else{
      customOverlayHeaderWrapper.style.display = "none";
      }
      if(overlayFooterMargin.value == "custom" && overlayFooterCheckbox.checked){
      customOverlayFooterWrapper.style.display = "block";
      }
      else{
      customOverlayFooterWrapper.style.display = "none";
      }
      syncMarginControls(true);
  }

  function toggleMainMarginOptions() {
    if (modeSelect.value === "margin") {
      marginOptions.style.display = "flex";
      headerMarginColumn.style.display = mainHeaderCheckbox.checked ? "block" : "none";
      footerMarginColumn.style.display = mainFooterCheckbox.checked ? "block" : "none";
      if(mainHeaderMargin.value == "custom"){
          customMainHeaderWrapper.style.display = "block";
      }
      else{
          customMainHeaderWrapper.style.display = "none";
      }
      if(mainFooterMargin.value == "custom"){
          customMainFooterWrapper.style.display = "block";
      }
      else{
          customMainFooterWrapper.style.display = "none";
      }

      if (loadedPdf) {
          syncMarginControls(false);
      }
    } else {
      marginOptions.style.display = "none";
    }
  }

  // Initialize correctly on page load
  toggleMainMarginOptions();

  // Update when mode changes
  modeSelect.addEventListener("change", toggleMainMarginOptions);


  [
    overlayHeaderCheckbox,
    overlayFooterCheckbox,
    overlayHeaderMargin,
    overlayFooterMargin
  ].forEach(el => {
    el.addEventListener('change', () => {
    toggleOverlayMarginOptions();
    renderAllPages();
    });
  });

  fileInput.addEventListener("change", async function () {

      const existingPreview = document.getElementById("pdf-preview");
      if (existingPreview) existingPreview.remove();

      const file = fileInput.files[0];
      if (!file || file.type !== 'application/pdf') return;


      if (pdfFileUrl) URL.revokeObjectURL(pdfFileUrl);
      pdfFileUrl = URL.createObjectURL(file);

      loadedPdf = await pdfjsLib.getDocument(pdfFileUrl).promise;

      renderPreview();
  });

  pagesInput.addEventListener("input", () => {
      if (modeSelect.value == "margin" && loadedPdf) {
      renderPreview();
      }
  });

  modeSelect.addEventListener("change", () => {
      const preview = document.getElementById("pdf-preview");

      if (modeSelect.value == "margin" && loadedPdf){
      document.querySelector("#editSection").style.display = "block";
      renderPreview();
      }
      else {
      if (preview) preview.remove();
      document.querySelector("#editSection").style.display = "none";
      }
  });

  [
    mainFooterCheckbox,
    mainHeaderCheckbox,
    mainFooterMargin,
    mainHeaderMargin
  ].forEach(el => {
    el.addEventListener("input", () => {
      toggleMainMarginOptions();
      if (modeSelect.value == "margin" && loadedPdf)
        renderPreview();
    });
  });

  [
    customMainHeaderInput,
    customMainFooterInput
  ].forEach(el => {
    el.addEventListener("input", () => {
      if (checkValue(el)) {
        toggleMainMarginOptions();
        renderPreview();
      }
    });
  });

  [
    customOverlayHeaderInput,
    customOverlayFooterInput
  ].forEach(el => {
    el.addEventListener("input", () => {
      if (checkValue(el)) {
        toggleOverlayMarginOptions();
        renderAllPages();
      }
    });
  });

  function checkValue(inputBlock) {
      const value = parseInt(inputBlock.value, 10) || 0;
      if (!isNaN(value) && value > 0) {
      return true;
      }
      return false;
  }

  window.addEventListener("resize", () => {
      if (modeSelect.value == "margin" && loadedPdf) {
      renderPreview();
      }
  });

  function drawMarginLine(ctx, y, width) {
      if (y < 0 || y > ctx.canvas.height) return;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
  }

  async function renderPreview() {
    if (modeSelect.value != "margin" || !loadedPdf) {
      if (preview) preview.remove();
      document.querySelector("#editSection").style.display = "none";
      return;
    } else {
      document.querySelector("#editSection").style.display = "block";
    }
    document.querySelectorAll(".margin-line").forEach(e => e.remove());


    const mainHeaderMargin = document.querySelector('select[name="headerMargin"]').value === 'custom'
    ? parseInt(document.getElementById('headerCustomMarginInput').value, 10) || 0
    : parseInt(document.querySelector('select[name="headerMargin"]').value, 10) || 0;
    const mainFooterMargin = document.querySelector('select[name="footerMargin"]').value === 'custom'
    ? parseInt(document.getElementById('footerCustomMarginInput').value, 10) || 0
    : parseInt(document.querySelector('select[name="footerMargin"]').value, 10) || 0;

    const existingPreview = document.getElementById("pdf-preview");
    if (existingPreview) existingPreview.remove();


    const pageInput = pagesInput.value.trim();
    let firstPageNumber = 1;

    if (pageInput) {
      const pages = pageInput.split(',').flatMap(part => {
        if (part.includes('-')) {
          const [start, end] = part.split('-').map(Number);
          return Array.from({ length: end - start + 1 }, (_, i) => start + i);
        }
        return [Number(part)];
      }).filter(n => !isNaN(n) && n > 0);

      if (pages.length > 0) {
        firstPageNumber = pages[0];
      }
    }

    const page = await loadedPdf.getPage(firstPageNumber);
    const canvas = document.createElement("canvas");


    if (page.rotate == 90 || page.rotate == 270) {
      canvas.width = page.view[3];
      canvas.height = page.view[2];
    } else {
      canvas.width = page.view[2];
      canvas.height = page.view[3];
    }

    const ctx = canvas.getContext("2d");

    const renderContext = {
    canvasContext: ctx,
    viewport: page.getViewport({ scale: 1 }),
    };

    await page.render(renderContext).promise;

    const scale = canvas.height / page.view[3]; // PDF pts to pixels
    const headerY = mainHeaderMargin * scale;
    const footerY = canvas.height - mainFooterMargin * scale;


    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    if (mainHeaderCheckbox.checked) {
      drawMarginLine(ctx, headerY, canvas.width);
    }
    if (mainFooterCheckbox.checked) {
      drawMarginLine(ctx, footerY, canvas.width);
    }

    const preview = document.createElement("img");
    preview.id = "pdf-preview";
    preview.alt = "preview";
    preview.src = canvas.toDataURL();
    preview.style.position = "absolute";
    preview.style.top = "50%";
    preview.style.left = "50%";
    preview.style.transform = "translate(-50%, -50%)";

    previewContainer.appendChild(preview);

    URL.revokeObjectURL(pdfFileUrl);
  };

  function parsePagesInput(input, maxPage) {
    if (!input) return Array.from({length: maxPage}, (_, i) => i + 1);
    const parts = input.split(',');
    const pages = new Set();
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start && end <= maxPage) {
          for (let i = start; i <= end; i++) pages.add(i);
        }
      } else {
        const n = Number(part);
        if (!isNaN(n) && n > 0 && n <= maxPage) pages.add(n);
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  }

  function renderAllPages() {
    viewer.innerHTML = '';

    const headerMargin = document.querySelector('select[name="headerMargin"]').value === 'custom'
    ? parseInt(document.getElementById('headerCustomMarginInput').value, 10) || 0
    : parseInt(document.querySelector('select[name="headerMargin"]').value, 10) || 0;
    const footerMargin = document.querySelector('select[name="footerMargin"]').value === 'custom'
    ? parseInt(document.getElementById('footerCustomMarginInput').value, 10) || 0
    : parseInt(document.querySelector('select[name="footerMargin"]').value, 10) || 0;

    const removeHeaderChecked = document.getElementById('removeHeader').checked;
    const removeFooterChecked = document.getElementById('removeFooter').checked;

    const pageInput = document.getElementById('pageNumbers').value.trim();
    const pagesToShow = parsePagesInput(pageInput, pdfDoc.numPages);

    const renderPage = (num, idx) => {
      pdfDoc.getPage(num).then(page => {
        const viewport = page.getViewport({ scale: currentScale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto 16px auto';
        viewer.appendChild(canvas);
        page.render({ canvasContext: ctx, viewport: viewport }).promise.then(() => {
        if (idx === 0) {
            pageNumberInput.value = pagesToShow[0];
            numPagesLabel.textContent = `/ ${pagesToShow.length}`;
        }

        const scale = canvas.height / page.view[3];
        const headerY = headerMargin * scale;
        const footerY = canvas.height - footerMargin * scale;
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        if (removeHeaderChecked) {
            drawMarginLine(ctx, headerY, canvas.width);
        }
        if (removeFooterChecked) {
            drawMarginLine(ctx, footerY, canvas.width);
        }
        });
      });
    };
    pagesToShow.forEach((pageNum, idx) => renderPage(pageNum, idx));
  }

  function scrollToPage(num) {
    const canvases = viewer.querySelectorAll('canvas');
    if (canvases[num - 1]) {
      canvases[num - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  zoomButton.addEventListener('click', async () => {
    if (!fileInput.files[0]) return;
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    pdfBlobUrl = URL.createObjectURL(fileInput.files[0]);

    syncMarginControls(false);
    outerContainer.style.display = 'block';
    pageContainer.style.display = 'none';

    pdfjsLib.getDocument(pdfBlobUrl).promise.then(pdf => {
    pdfDoc = pdf;
    currentPage = 1;
    currentScale = 1.0;
    renderAllPages();
    });
  });

  closeBtn.addEventListener('click', () => {
    syncMarginControls(true);
    outerContainer.style.display = 'none';
    pageContainer.style.display = 'block';
    viewer.innerHTML = '';
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    pdfDoc = null;
    renderPreview();
  });

  nextBtn.addEventListener('click', () => {
    if (currentPage < pdfDoc.numPages) {
      currentPage++;
      pageNumberInput.value = currentPage;
      scrollToPage(currentPage);
    }
  });

  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      pageNumberInput.value = currentPage;
      scrollToPage(currentPage);
    }
  });

  scaleSelect.addEventListener('change', async e => {
    let val = e.target.value;
    if (val === 'page-fit' || val === 'page-width' || val === 'page-actual') {
      const scale = await getPageScale(val);
      onZoomChange(scale);
      scaleSelect.value = val;
    } else if (val === 'auto') {
      onZoomChange(1.25);
      scaleSelect.value = val;
    } else {
      onZoomChange(Number(val));
    }
  });

  pageNumberInput.addEventListener('change', e => {
    let num = parseInt(e.target.value, 10);
    if (!isNaN(num) && num >= 1 && num <= pdfDoc.numPages) {
      currentPage = num;
      scrollToPage(currentPage);
    }
  });

  function setScaleSelectValue(scale) {

    let found = false;
    for (const opt of scaleSelect.options) {
      if (Number(opt.value) === scale) {
        scaleSelect.value = opt.value;
        const customOpt = scaleSelect.querySelector('#customScaleOption');
        if (customOpt) {
        customOpt.hidden = true;
        customOpt.disabled = true;
        }
        found = true;
        break;
      }
    }
    if (!found) {

      let customOpt = scaleSelect.querySelector('#customScaleOption');
      if (!customOpt) {
        customOpt = document.createElement('option');
        customOpt.id = 'customScaleOption';
        scaleSelect.appendChild(customOpt);
      }
      customOpt.value = 'custom';
      customOpt.textContent = `${Math.round(scale * 100)}%`;
      customOpt.hidden = false;
      customOpt.disabled = false;
      scaleSelect.value = 'custom';
    }
  }

  function onZoomChange(newScale) {
    currentScale = newScale;
    setScaleSelectValue(currentScale);
    renderAllPages();
  }

  function getPageScale(mode) {

    if (!pdfDoc) return 1.0;
    const firstCanvas = viewer.querySelector('canvas');
    if (!firstCanvas) return 1.0;
    const container = viewerContainer;
    const pageIndex = 1;
    return pdfDoc.getPage(pageIndex).then(page => {
      const viewport = page.getViewport({ scale: 1.0 });
      if (mode === 'page-fit') {
        // Fit page height to container height
        return container.clientHeight / viewport.height;
      } else if (mode === 'page-width') {
        // Fit page width to container width
        return container.clientWidth / viewport.width;
      } else if (mode === 'page-actual') {
        return 1.0;
      }
      return 1.0;
    });
  }

  // Updates the page number with the visible page number during scroll
  viewerContainer.addEventListener('scroll', () => {
    const canvases = viewer.querySelectorAll('canvas');
    let closest = 0;
    let minDiff = Infinity;
    const containerTop = viewerContainer.scrollTop;
    for (let i = 0; i < canvases.length; i++) {
      const rect = canvases[i].getBoundingClientRect();
      const diff = Math.abs(rect.top - viewerContainer.getBoundingClientRect().top);
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
    }
    if (pdfDoc && pageNumberInput.value != (closest + 1)) {
      pageNumberInput.value = closest + 1;
      currentPage = closest + 1;
    }
  });

  zoomInBtn.addEventListener('click', () => {
    onZoomChange(currentScale + 0.1);
  });

  zoomOutBtn.addEventListener('click', () => {
    onZoomChange(currentScale - 0.1);
  });

});
