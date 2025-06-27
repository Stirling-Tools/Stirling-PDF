import * as pdfjsLib from '../../pdfjs-legacy/pdf.mjs';
import {PDFViewerApplication} from '../../pdfjs-legacy/js/viewer.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs-legacy/pdf.worker.mjs';

document.addEventListener('DOMContentLoaded', () => {

  PDFViewerApplication.run();
  const CUSTOM = "-1";
  const fileInput = document.getElementById('fileInput-input');
  const pagesInput = document.getElementById("pageNumbers");
  const previewContainer = document.getElementById('previewContainer');

  const overlayHeaderCheckbox = document.getElementById('overlay-removeHeader');
  const overlayFooterCheckbox = document.getElementById('overlay-removeFooter');
  const overlayHeaderMargin = document.getElementById('overlay-headerMargin');
  const overlayFooterMargin = document.getElementById('overlay-footerMargin');
  const customOverlayHeaderWrapper = document.getElementById("overlay-headerCustomMarginWrapper");
  const customOverlayFooterWrapper = document.getElementById("overlay-footerCustomMarginWrapper");
  const customOverlayHeaderInput = document.getElementById("overlay-headerCustomMarginInput");
  const customOverlayFooterInput = document.getElementById("overlay-footerCustomMarginInput");

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

  const pageContainer = document.getElementById('page-container');
  const outerContainer = document.getElementById('outerContainer');

  let pdfFileUrl = null;
  let loadedPdf = null;
  let currentPage = 1;
  let currentScale = 1.0;

  const drawMarginLine = (ctx, y, width, type) => {
    if (y < 0 || y > ctx.canvas.height) return;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = type === "header" ? "red" : "blue";
    ctx.fillRect(0, type === "header" ? 0 : y, width, type === "header" ? y : ctx.canvas.height - y);
    ctx.restore();
  };

  function getMarginValue(type, context = 'main') {
    const select = context === 'main'
      ? document.querySelector(`select[name="${type}Margin"]`)
      : document.getElementById(`overlay-${type}Margin`);
    if (select.value === CUSTOM) {
      const input = context === 'main'
        ? document.getElementById(`${type}CustomMarginInput`)
        : document.getElementById(`overlay-${type}CustomMarginInput`);
      return parseInt(input.value, 10) || 0;
    }
    return parseInt(select.value, 10) || 0;
  }

  async function renderPreview() {
    if (!loadedPdf) {
      if (preview) preview.remove();
      document.querySelector("#editSection").style.display = "none";
      return;
    } else {
      document.querySelector("#editSection").style.display = "block";
    }
    const mainHeaderMargin = getMarginValue('header');
    const mainFooterMargin = getMarginValue('footer');

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
		const viewport = page.getViewport({ scale: currentScale });
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
    
		canvas.height = viewport.height;
		canvas.width = viewport.width;

    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    const headerY = mainHeaderMargin * currentScale;
    const footerY = canvas.height - mainFooterMargin * currentScale;

    if (mainHeaderCheckbox.checked) {
      drawMarginLine(ctx, headerY, canvas.width, "header");
    }
    if (mainFooterCheckbox.checked) {
      drawMarginLine(ctx, footerY, canvas.width, "footer");
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

  function parsePagesInput(maxPage) {
    const pageInput = pagesInput.value.trim();
    if (!pageInput) return Array.from({length: maxPage}, (_, i) => i + 1);
    const parts = pageInput.split(',');
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

    const headerMargin = getMarginValue('header', 'overlay');
    const footerMargin = getMarginValue('footer', 'overlay');

    const removeHeaderChecked = overlayHeaderCheckbox.checked;
    const removeFooterChecked = overlayFooterCheckbox.checked;
    const pagesToShow = parsePagesInput(loadedPdf.numPages);

    const renderPage = (num, idx) => {
      loadedPdf.getPage(num).then(page => {
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

        const headerY = headerMargin * currentScale;
        const footerY = canvas.height - footerMargin * currentScale;
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        if (removeHeaderChecked) {
          drawMarginLine(ctx, headerY, canvas.width, "header");
        }
        if (removeFooterChecked) {
          drawMarginLine(ctx, footerY, canvas.width, "footer");
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

  function syncMarginControls(fromOverlay) {

    const overlay = {
      check:{
        headerCheckbox: overlayHeaderCheckbox,
        footerCheckbox: overlayFooterCheckbox
      },
      value: {
        headerMargin: overlayHeaderMargin,
        footerMargin: overlayFooterMargin,
        customFooterInput: customOverlayFooterInput,
        customHeaderInput: customOverlayHeaderInput
      },
      style: {
        headerMarginColumn: overlayHeaderMargin,
        footerMarginColumn: overlayFooterMargin,
        customHeaderWrapper: customOverlayHeaderWrapper,
        customFooterWrapper: customOverlayFooterWrapper
      }
    };

    const main = {
      check:{
        headerCheckbox: mainHeaderCheckbox,
        footerCheckbox: mainFooterCheckbox,
      },
      value: {
        headerMargin: mainHeaderMargin,
        footerMargin: mainFooterMargin,
        customFooterInput: customMainFooterInput,
        customHeaderInput: customMainHeaderInput,
      },
      style: {
        headerMarginColumn: headerMarginColumn,
        footerMarginColumn: footerMarginColumn,
        customHeaderWrapper: customMainHeaderWrapper,
        customFooterWrapper: customMainFooterWrapper,
      }
    };

   const src = fromOverlay ? overlay : main;
   const tgt = fromOverlay ? main : overlay;

   Object.keys(src.check).forEach(key => {
     if (src.check[key] && tgt.check[key]) {
       tgt.check[key].checked = src.check[key].checked;
     }
   });
   Object.keys(src.value).forEach(key => {
     if (src.value[key] && tgt.value[key]) {
       tgt.value[key].value = src.value[key].value;
     }
   });
   Object.keys(src.style).forEach(key => {
     if (src.style[key] && tgt.style[key]) {
       tgt.style[key].style.display = src.style[key].style.display;
     }
   });
  }

  function toggleOverlayMarginOptions() {

    overlayHeaderMargin.style.display = overlayHeaderCheckbox.checked ? "block" : "none";
    overlayFooterMargin.style.display = overlayFooterCheckbox.checked ? "block" : "none";

    if(overlayHeaderMargin.value == CUSTOM && overlayHeaderCheckbox.checked){
      customOverlayHeaderWrapper.style.display = "block";
    }
    else{
      customOverlayHeaderWrapper.style.display = "none";
    }
    if(overlayFooterMargin.value == CUSTOM && overlayFooterCheckbox.checked){
      customOverlayFooterWrapper.style.display = "block";
    }
    else{
      customOverlayFooterWrapper.style.display = "none";
    }
    syncMarginControls(true);
  }

  function toggleMainMarginOptions() {

    headerMarginColumn.style.display = mainHeaderCheckbox.checked ? "block" : "none";
    footerMarginColumn.style.display = mainFooterCheckbox.checked ? "block" : "none";

    if(mainHeaderMargin.value == CUSTOM && mainHeaderCheckbox.checked){
      customMainHeaderWrapper.style.display = "block";
    }
    else{
      customMainHeaderWrapper.style.display = "none";
    }
    if(mainFooterMargin.value == CUSTOM && mainFooterCheckbox.checked){
      customMainFooterWrapper.style.display = "block";
    }
    else{
      customMainFooterWrapper.style.display = "none";
    }

    if (loadedPdf) {
      syncMarginControls(false);
    }
  }

  async function checkValue(inputBlock) {

    const value = parseInt(inputBlock.value, 10) || 0;
    const pagesToShow = parsePagesInput(loadedPdf.numPages);
    const page = await loadedPdf.getPage(pagesToShow[0]);
    if (!isNaN(value) && value > 0) {
      if(value > page.view[3]) inputBlock.value = page.view[3];
      return true;
    }
    return false;
  }

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

    if (!loadedPdf) return 1.0;
    const firstCanvas = viewer.querySelector('canvas');
    if (!firstCanvas) return 1.0;
    const container = viewerContainer;
    const pageIndex = 1;
    return loadedPdf.getPage(pageIndex).then(page => {
      const viewport = page.getViewport({ scale: 1.0 });

      if (mode === 'page-fit') {
        return container.clientHeight / viewport.height;
      } else if (mode === 'page-width') {
        return container.clientWidth / viewport.width;
      } else if (mode === 'page-actual') {
        return 1.0;
      }
      return 1.0;
    });
  }

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
    if (loadedPdf) {
      renderPreview();
    }
  });

  document.getElementById('removeHeaderFooterForm').addEventListener('submit', async function (event) {
    event.preventDefault();

		const form = event.target;

		const formData = new FormData(form);

    const responseContainer = document.getElementById('responseContainer');
    responseContainer.textContent = '';
    responseContainer.className = '';
    console.log("Form data:", Array.from(formData.entries()));
    try {
			const response = await fetch(form.action, {
			  method: form.method,
			  body: formData,
			});

			await response.text();
			if (response.ok) {
				if (formData.get('removeHeader')) {
					if (formData.get('removeFooter')) {
						responseContainer.textContent = 'Header and Footer removed successfully.';
					}
					else {
						responseContainer.textContent = 'Header removed successfully.';
					}
				}
				else if (formData.get('removeFooter')) {
					responseContainer.textContent = 'Footer removed successfully.';
				}
				responseContainer.className = 'alert alert-success';
			}

    } catch (error) {
			responseContainer.textContent = 'An error occurred. Please try again.';
			responseContainer.className = 'alert alert-danger';
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
      if (loadedPdf)
        renderPreview();
    });
  });

  [
    [customMainHeaderInput, toggleMainMarginOptions, renderPreview],
    [customMainFooterInput, toggleMainMarginOptions, renderPreview],
    [customOverlayHeaderInput, toggleOverlayMarginOptions, renderAllPages],
    [customOverlayFooterInput, toggleOverlayMarginOptions, renderAllPages]
  ].forEach(([el, toggleFn, renderFn]) => {
    el.addEventListener("input", async () => {
      if (await checkValue(el)) {
        toggleFn();
        renderFn();
      }
    });
  });

  window.addEventListener("resize", () => {
    if (loadedPdf) {
      renderPreview();
    }
  });

  document.getElementById('zoomButton').addEventListener('click', async () => {
    if (!fileInput.files[0]) return;

    syncMarginControls(false);
    outerContainer.style.display = 'block';
    pageContainer.style.display = 'none';

    currentPage = 1;
    currentScale = 1.0;
    renderAllPages();
  });

  document.getElementById('closeOverlay').addEventListener('click', () => {
    syncMarginControls(true);
    outerContainer.style.display = 'none';
    pageContainer.style.display = 'block';
    viewer.innerHTML = '';
    renderPreview();
  });

  document.getElementById('next').addEventListener('click', () => {
    if (currentPage < loadedPdf.numPages) {
      currentPage++;
      pageNumberInput.value = currentPage;
      scrollToPage(currentPage);
    }
  });

  document.getElementById('previous').addEventListener('click', () => {
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
    if (!isNaN(num) && num >= 1 && num <= loadedPdf.numPages) {
      currentPage = num;
      scrollToPage(currentPage);
    }
  });


  viewerContainer.addEventListener('scroll', () => {
    const canvases = viewer.querySelectorAll('canvas');
    let closest = 0;
    let minDiff = Infinity;

    for (let i = 0; i < canvases.length; i++) {
      const rect = canvases[i].getBoundingClientRect();
      const diff = Math.abs(rect.top - viewerContainer.getBoundingClientRect().top);
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
    }
    if (loadedPdf && pageNumberInput.value != (closest + 1)) {
      pageNumberInput.value = closest + 1;
      currentPage = closest + 1;
    }
  });

  document.getElementById('zoomIn').addEventListener('click', () => {
    onZoomChange(currentScale + 0.1);
  });

  document.getElementById('zoomOut').addEventListener('click', () => {
    onZoomChange(currentScale - 0.1);
  });

  toggleMainMarginOptions();
});
