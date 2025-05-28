import {PDFViewerApplication} from '../pdfjs-legacy/js/viewer.mjs';
import UUID from './uuid.js';

let zoomScaleValue = 1.0;

let activeOverlay;
let drawingLayer = null;

const doNothing = () => {};

function addRedactedPagePreview(pagesSelector) {
  document.querySelectorAll(pagesSelector).forEach((page) => {
    let textLayer = page.querySelector('.textLayer');
    if (textLayer) textLayer.classList.add('redacted-page-preview');
  });
}

function addRedactedThumbnailPreview(sidebarPagesSelector) {
  document.querySelectorAll(sidebarPagesSelector).forEach((thumbnail) => {
    thumbnail.classList.add('redacted-thumbnail-preview');
    let thumbnailImage = thumbnail.querySelector('.thumbnailImage');
    if (thumbnailImage) thumbnailImage.classList.add('redacted-thumbnail-image-preview');
  });
}

function removeRedactedPagePreview() {
  document.querySelectorAll('.textLayer').forEach((textLayer) => textLayer.classList.remove('redacted-page-preview'));
  document.querySelectorAll('#thumbnailView > a > div.thumbnail').forEach((thumbnail) => {
    thumbnail.classList.remove('redacted-thumbnail-preview');
    let thumbnailImage = thumbnail.querySelector('.thumbnailImage');
    if (thumbnailImage) thumbnailImage.classList.remove('redacted-thumbnail-image-preview');
  });
}

function extractPagesDetailed(pagesInput, totalPageCount) {
  let parts = pagesInput.split(',').filter((s) => s);
  let pagesDetailed = {
    numbers: new Set(),
    functions: new Set(),
    ranges: new Set(),
    all: false,
  };
  for (let part of parts) {
    let trimmedPart = part.trim();
    if ('all' == trimmedPart) {
      pagesDetailed.all = true;
      return pagesDetailed;
    } else if (isValidFunction(trimmedPart)) {
      pagesDetailed.functions.add(formatNFunction(trimmedPart));
    } else if (trimmedPart.includes('-')) {
      let range = trimmedPart
        .replaceAll(' ', '')
        .split('-')
        .filter((s) => s);
      if (range && range.length == 2 && range[0].trim() > 0 && range[1].trim() > 0)
        pagesDetailed.ranges.add({
          low: range[0].trim(),
          high: range[1].trim(),
        });
    } else if (isPageNumber(trimmedPart)) {
      pagesDetailed.numbers.add(trimmedPart <= totalPageCount ? trimmedPart : totalPageCount);
    }
  }

  return pagesDetailed;
}

function formatNFunction(expression) {
  let result = insertMultiplicationBeforeN(expression.replaceAll(' ', ''));
  let multiplyByOpeningRoundBracketPattern = /([0-9n)])\(/g; // example: n(n-1), 9(n-1), (n-1)(n-2)
  result = result.replaceAll(multiplyByOpeningRoundBracketPattern, '$1*(');

  let multiplyByClosingRoundBracketPattern = /\)([0-9n)])/g; // example: (n-1)n, (n-1)9, (n-1)(n-2)
  result = result.replaceAll(multiplyByClosingRoundBracketPattern, ')*$1');
  return result;
}

function insertMultiplicationBeforeN(expression) {
  let result = expression.replaceAll(/(\d)n/g, '$1*n');
  while (result.match(/nn/)) {
    result = result.replaceAll(/nn/g, 'n*n'); // From nn -> n*n
  }
  return result;
}

function validatePages(pages) {
  let parts = pages.split(',').filter((s) => s);
  let errors = [];
  for (let part of parts) {
    let trimmedPart = part.trim();
    if ('all' == trimmedPart) continue;
    else if (trimmedPart.includes('n')) {
      if (!isValidFunction(trimmedPart))
        errors.push(`${trimmedPart} is an invalid function, it should consist of digits 0-9, n, *, -, /, (, ), \\.`);
    } else if (trimmedPart.includes('-')) {
      let range = trimmedPart.split('-').filter((s) => s);
      if (!range || range.length != 2)
        errors.push(`${trimmedPart} is an invalid range, it should consist of from-to, example: 1-5`);
      else if (range[0].trim() <= 0 || range[1].trim() <= 0)
        errors.push(`${trimmedPart} has invalid range(s), page numbers should be positive.`);
    } else if (!isPageNumber(trimmedPart)) {
      errors.push(`${trimmedPart} is invalid, it should either be a function, page number or a range.`);
    }
  }

  return {errors};
}

function isPageNumber(page) {
  return /^[0-9]*$/.test(page);
}

function isValidFunction(part) {
  return part.includes('n') && /[0-9n+\-*/() ]+$/.test(part);
}

function hideContainer(container) {
  container?.classList.add('d-none');
}

const RedactionModes = Object.freeze({
  DRAWING: Symbol('drawing'),
  TEXT: Symbol('text'),
  NONE: Symbol('none'),
});

function removePDFJSButtons() {
  document.getElementById('print')?.remove();
  document.getElementById('download')?.remove();
  document.getElementById('editorStamp')?.remove();
  document.getElementById('editorFreeText')?.remove();
  document.getElementById('editorInk')?.remove();
  document.getElementById('secondaryToolbarToggle')?.remove();
  document.getElementById('openFile')?.remove();
}

function hideInitialPage() {
  document.body.style.overflowY = 'hidden';
  let redactionsFormContainer = document.getElementById('redactionFormContainer');
  for (
    let el = redactionsFormContainer.previousElementSibling;
    el && el instanceof HTMLBRElement;
    el = el.previousElementSibling
  ) {
    el.classList.add('d-none');
  }
  redactionsFormContainer.classList.add('d-none');
  const footer = document.getElementsByTagName('footer')[0];

  // Check if the parent of the footer has the id "viewerContainer"
  if (footer.parentElement && footer.parentElement.id !== 'viewerContainer') {
    footer.classList.add('d-none');
  }
}

window.addEventListener('load', (e) => {
  let isChromium =
    !!window.chrome ||
    (!!navigator.userAgentData && navigator.userAgentData.brands.some((data) => data.brand == 'Chromium'));

  let isSafari =
    /constructor/i.test(window.HTMLElement) ||
    (function (p) {
      return p.toString() === '[object SafariRemoteNotification]';
    })(!window['safari'] || (typeof safari !== 'undefined' && window['safari'].pushNotification));
  let isWebkit = navigator.userAgent.search(/webkit/i) > 0;
  let isGecko = navigator.userAgent.search(/gecko/i) > 0;
  let isFirefox = typeof InstallTrigger !== 'undefined';

  let hiddenInput = document.getElementById('fileInput');
  let outerContainer = document.getElementById('outerContainer');
  let printContainer = document.getElementById('printContainer');

  let toolbarViewerRight = document.getElementById('toolbarViewerRight');
  let showMoreBtn = document.getElementById('showMoreBtn');

  window.onresize = (e) => {
    if (window.innerWidth > 1125 && showMoreBtn.classList.contains('toggled')) {
      showMoreBtn.click();
    } else if (window.innerWidth > 1125 && toolbarViewerRight.hasAttribute('style')) {
      toolbarViewerRight.style.removeProperty('display');
    }
  };

  showMoreBtn.onclick = (e) => {
    if (showMoreBtn.classList.contains('toggled')) {
      toolbarViewerRight.style.display = 'none';
      showMoreBtn.classList.remove('toggled');
    } else {
      toolbarViewerRight.style.display = 'flex';
      showMoreBtn.classList.add('toggled');
    }
  };

  let viewer = document.getElementById('viewer');

  hiddenInput.files = undefined;
  let redactionMode = RedactionModes.NONE;

  let redactions = [];

  let redactionsInput = document.getElementById('redactions-input');

  let redactionsPalette = document.getElementById('redactions-palette');
  let redactionsPaletteInput = redactionsPalette.querySelector('input');

  let redactionsPaletteContainer = document.getElementById('redactionsPaletteContainer');

  let redactedPagesDetails = {
    numbers: new Set(),
    ranges: new Set(),
    functions: new Set(),
    all: false,
  };
  let pageBasedRedactionBtn = document.getElementById('pageBasedRedactionBtn');
  let pageBasedRedactionOverlay = document.getElementById('pageBasedRedactionOverlay');
  pageBasedRedactionBtn.onclick = (e) => pageBasedRedactionOverlay.classList.remove('d-none');

  pageBasedRedactionOverlay.querySelector('input[type=text]').onchange = (e) => {
    let input = e.target;
    let parentElement = input.parentElement;

    resetFieldFeedbackMessages(input, parentElement);

    let value = input.value.trim();
    let {errors} = validatePages(value);
    if (errors && errors.length > 0) {
      applyPageRedactionBtn.disabled = 'true';
      displayFieldErrorMessages(input, errors);
    } else {
      applyPageRedactionBtn.removeAttribute('disabled');
      input.classList.add('is-valid');
    }
  };

  let applyPageRedactionBtn = document.getElementById('applyPageRedactionBtn');
  applyPageRedactionBtn.onclick = (e) => {
    pageBasedRedactionOverlay.querySelectorAll('input').forEach((input) => {
      const id = input.getAttribute('data-for');
      if (id == 'pageNumbers') {
        let {errors} = validatePages(input.value);

        resetFieldFeedbackMessages(input, input.parentElement);

        if (errors?.length > 0) {
          applyPageRedactionBtn.disabled = true;
          displayFieldErrorMessages(input, errors);
        } else {
          pageBasedRedactionOverlay.classList.add('d-none');
          input.classList.remove('is-valid');

          let totalPagesCount = PDFViewerApplication.pdfViewer.pagesCount;
          let pagesDetailed = extractPagesDetailed(input.value, totalPagesCount);
          redactedPagesDetails = pagesDetailed;
          addPageRedactionPreviewToPages(pagesDetailed, totalPagesCount);
        }
      } else if (id == 'pageRedactColor') setPageRedactionColor(input.value);
      let formInput = document.getElementById(id);
      if (formInput) formInput.value = input.value;
    });
  };

  let closePageRedactionBtn = document.getElementById('closePageRedactionBtn');
  closePageRedactionBtn.onclick = (e) => {
    pageBasedRedactionOverlay.classList.add('d-none');
    pageBasedRedactionOverlay.querySelectorAll('input').forEach((input) => {
      const id = input.getAttribute('data-for');
      if (id == 'pageNumbers') {
        resetFieldFeedbackMessages(input, input.parentElement);
      }
      let formInput = document.getElementById(id);
      if (formInput) input.value = formInput.value;
    });
  };

  let pdfToImageCheckbox = document.getElementById('convertPDFToImage');

  let pdfToImageBtn = document.getElementById('pdfToImageBtn');
  pdfToImageBtn.onclick = (e) => {
    pdfToImageBtn.classList.toggle('btn-success');
    pdfToImageBtn.classList.toggle('btn-danger');
    pdfToImageCheckbox.checked = !pdfToImageCheckbox.checked;
  };

  let fileChooser = document.getElementsByClassName('custom-file-chooser')[0];
  let fileChooserInput = fileChooser.querySelector(`#${fileChooser.getAttribute('data-bs-element-id')}`);

  let uploadButton = document.getElementById('uploadBtn');
  uploadButton.onclick = (e) => fileChooserInput.click();

  document.addEventListener('file-input-change', (e) => {
    redactions = [];
    _setRedactionsInput(redactions);
  });

  let submitBtn = document.getElementById('submitBtn');

  let downloadBtn = document.getElementById('downloadBtn');
  let downloadBtnIcon = document.getElementById('downloadBtnIcon');

  downloadBtn.onclick = (e) => {
    submitBtn.click();
    setTimeout(_showOrHideLoadingSpinner, 100); // wait 100 milliseconds so that submitBtn would be disabled
  };

  function _showOrHideLoadingSpinner() {
    if (!submitBtn.disabled) {
      downloadBtnIcon.innerHTML = 'download';
      downloadBtnIcon.classList.remove('spin-animation');
      return;
    }

    downloadBtnIcon.innerHTML = 'progress_activity';
    downloadBtnIcon.classList.add('spin-animation');
    setTimeout(_showOrHideLoadingSpinner, 500);
  }

  redactionsPaletteContainer.onclick = (e) => redactionsPalette.click();

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

  viewer.onmouseup = (e) => {
    if (redactionMode !== RedactionModes.TEXT) return;
    const containsText = window.getSelection() && window.getSelection().toString() != '';
    if(containsText){
      redactTextSelection();
      clearSelection();
    }
  };

  redactionsPaletteInput.onchange = (e) => {
    let color = e.target.value;
    redactionsPalette.style.setProperty('--palette-color', color);
  };

  document.addEventListener('file-input-change', (e) => {
    let fileChooser = document.getElementsByClassName('custom-file-chooser')[0];
    let fileChooserInput = fileChooser.querySelector(`#${fileChooser.getAttribute('data-bs-element-id')}`);

    hiddenInput.files = fileChooserInput.files;
    if (!hiddenInput.files || hiddenInput.files.length === 0) {
      hideContainer(outerContainer);
      hideContainer(printContainer);
    } else {
      outerContainer?.classList.remove('d-none');
      printContainer?.classList.remove('d-none');
      hideInitialPage();
    }

    hiddenInput.dispatchEvent(new Event('change', {bubbles: true}));
  });

  PDFViewerApplication.downloadOrSave = doNothing;
  PDFViewerApplication.triggerPrinting = doNothing;

  let redactionContainersDivs = {};
  PDFViewerApplication.eventBus.on('pagerendered', (e) => {
    removePDFJSButtons();

    let textSelectionRedactionBtn = document.getElementById('man-text-select-redact');
    let drawRedactionBtn = document.getElementById('man-shape-redact');

    textSelectionRedactionBtn.onclick = _handleTextSelectionRedactionBtnClick;
    drawRedactionBtn.onclick = _handleDrawRedactionBtnClick;

    let layer = e.source.textLayer.div;
    layer.setAttribute('data-page', e.pageNumber);
    if (redactedPagesDetails.all || redactedPagesDetails.numbers.has(e.pageNumber)) {
      layer.classList.add('redacted-page-preview');
    } else {
      layer.classList.remove('redacted-page-preview');
    }

    zoomScaleValue = e.source.scale ? e.source.scale : e.source.pageScale;
    document.documentElement.style.setProperty('--zoom-scale', zoomScaleValue);

    let redactionsContainer = document.getElementById(`redactions-container-${e.pageNumber}`);
    if (!redactionsContainer && !redactionContainersDivs[`${e.pageNumber}`]) {
      redactionsContainer = document.createElement('div');
      redactionsContainer.style.position = 'relative';
      redactionsContainer.style.height = '100%';
      redactionsContainer.style.width = '100%';
      redactionsContainer.id = `redactions-container-${e.pageNumber}`;
      redactionsContainer.style.setProperty('z-index', 'unset');

      layer.appendChild(redactionsContainer);
      redactionContainersDivs[`${e.pageNumber}`] = redactionsContainer;
    } else if (!redactionsContainer && redactionContainersDivs[`${e.pageNumber}`]) {
      redactionsContainer = redactionContainersDivs[`${e.pageNumber}`];

      layer.appendChild(redactionsContainer);
      // Dispatch event to update text layer references for elements' events
      redactionsContainer.querySelectorAll('.selected-wrapper').forEach((area) =>
        area.dispatchEvent(
          new CustomEvent('textLayer-reference-changed', {
            bubbles: true,
            detail: {textLayer: layer},
          })
        )
      );
    }

    document.onpointerup = (e) => {
      if (drawingLayer && e.target != drawingLayer && e.button == 0)
        drawingLayer.dispatchEvent(new Event('external-pointerup'));
    };

    initDraw(layer, redactionsContainer);
    enableTextRedactionMode();

    function _handleTextSelectionRedactionBtnClick(e) {
      if (textSelectionRedactionBtn.classList.contains('toggled')) {
        resetTextSelection();
      } else {
        enableTextRedactionMode();
      }
    }

    function enableTextRedactionMode() {
      if(!textSelectionRedactionBtn.classList.contains('toggled')){
        textSelectionRedactionBtn.classList.add('toggled');
      }
      resetDrawRedactions();
      redactionMode = RedactionModes.TEXT;
    };

    function resetTextSelection() {
      textSelectionRedactionBtn.classList.remove('toggled');
      redactionMode = RedactionModes.NONE;
      clearSelection();
    }

    function _handleDrawRedactionBtnClick(e) {
      if (drawRedactionBtn.classList.contains('toggled')) {
        resetDrawRedactions();
      } else {
        resetTextSelection();
        drawRedactionBtn.classList.add('toggled');
        document.documentElement.style.setProperty('--textLayer-pointer-events', 'none');
        document.documentElement.style.setProperty('--textLayer-user-select', 'none');
        redactionMode = RedactionModes.DRAWING;
      }
    }

    function resetDrawRedactions() {
      redactionMode = RedactionModes.NONE;
      drawRedactionBtn.classList.remove('toggled');
      document.documentElement.style.setProperty('--textLayer-pointer-events', 'auto');
      document.documentElement.style.setProperty('--textLayer-user-select', 'auto');
      window.dispatchEvent(new CustomEvent('reset-drawing', {bubbles: true}));
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

      window.addEventListener('reset-drawing', (e) => {
        _clearDrawing();
        canvas.style.cursor = 'default';
        document.documentElement.style.setProperty('--textLayer-pointer-events', 'auto');
        document.documentElement.style.setProperty('--textLayer-user-select', 'auto');
      });

      window.addEventListener('drawing-entered', (e) => {
        let target = e.detail?.target;
        if (canvas === target) return;
        _clearDrawing();
      });

      window.addEventListener('cancel-drawing', (e) => {
        _clearDrawing();
        canvas.style.cursor = 'default';
      });

      function setMousePosition(e) {
        if (isChromium || isSafari || isWebkit) {
          mouse.x = e.offsetX;
          mouse.y = e.offsetY;
        } else if (isFirefox || isGecko) {
          mouse.x = e.layerX;
          mouse.y = e.layerY;
        } else {
          let rect = (e.target || e.srcElement).getBoundingClientRect();
          mouse.x = e.clientX - rect.left;
          mouse.y = e.clientY - rect.top;
        }
      }

      window.onkeydown = (e) => {
        if (e.key === 'Escape' && redactionMode === RedactionModes.DRAWING) {
          window.dispatchEvent(new CustomEvent('cancel-drawing', {bubbles: true}));
        }
      };

      canvas.onpointerenter = (e) => {
        window.dispatchEvent(
          new CustomEvent('drawing-entered', {
            bubbles: true,
            detail: {target: canvas},
          })
        );
      };

      canvas.onpointerup = (e) => {
        let isLeftClick = e.button == 0;
        if (!isLeftClick) return;

        if (element !== null) {
          _saveAndResetDrawnRedaction();
          console.log('finished.');
        }
      };

      canvas.addEventListener('external-pointerup', (e) => {
        if (element != null) {
          _saveAndResetDrawnRedaction();
        }
      });

      canvas.onpointerleave = (e) => {
        let ev = copyEvent(e, 'pointerleave');
        let {left, top} = calculateMouseCoordinateToRotatedBox(canvas, e);

        ev.layerX = left;
        ev.offsetX = left;

        ev.layerY = top;
        ev.offsetY = top;

        setMousePosition(ev);
        if (element !== null) {
          draw();
        }
      };

      canvas.onpointerdown = (e) => {
        let isLeftClick = e.button == 0;
        if (!isLeftClick) return;

        if (element == null) {
          if (redactionMode !== RedactionModes.DRAWING) {
            console.warn('Drawing attempt when redaction mode is', redactionMode.description);
            return;
          }
          console.log('begun.');
          _captureAndDrawStartingPointOfDrawnRedaction();
        }
      };

      canvas.onpointermove = function (e) {
        setMousePosition(e);
        if (element !== null) {
          draw();
        }
      };

      function draw() {
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

      function _clearDrawing() {
        if (element) element.remove();
        if (drawingLayer == canvas) drawingLayer = null;
        element = null;
        drawnRedaction = null;
      }

      function _saveAndResetDrawnRedaction() {
        if (!element) return;
        if (
          !element.style.height ||
          element.style.height.includes('(0px * var') ||
          !element.style.width ||
          element.style.width.includes('(0px * var')
        ) {
          element.remove();
        } else {
          element.classList.add('selected-wrapper');
          element.classList.remove('rectangle');

          addRedactionOverlay(element, drawnRedaction, canvas);
          redactions.push(drawnRedaction);
          _setRedactionsInput(redactions);
        }
        drawingLayer = null;
        element = null;
        drawnRedaction = null;
        canvas.style.cursor = 'default';
      }

      function _captureAndDrawStartingPointOfDrawnRedaction() {
        mouse.startX = mouse.x;
        mouse.startY = mouse.y;

        element = document.createElement('div');
        element.className = 'rectangle';
        drawingLayer = canvas;

        let left = mouse.x;
        let top = mouse.y;

        element.style.left = _toCalcZoomPx(_scaleToDisplay(left));
        element.style.top = _toCalcZoomPx(_scaleToDisplay(top));

        let scaleFactor = _getScaleFactor();
        let color = redactionsPalette.style.getPropertyValue('--palette-color');

        element.style.setProperty('--palette-color', color);

        drawnRedaction = {
          left: _scaleToPDF(left, scaleFactor),
          top: _scaleToPDF(top, scaleFactor),
          width: 0.0,
          height: 0.0,
          color: color,
          pageNumber: parseInt(canvas.getAttribute('data-page')),
          element: element,
          id: UUID.uuidv4(),
        };

        redactionsContainer.appendChild(element);
        canvas.style.cursor = 'crosshair';
      }
    }
  });

  PDFViewerApplication.eventBus.on('rotationchanging', (e) => {
    if (!activeOverlay) return;
    hideOverlay();
  });

  function _getScaleFactor() {
    return parseFloat(viewer.style.getPropertyValue('--scale-factor'));
  }

  function getTextLayer(element) {
    let current = element;
    while (current) {
      if (current instanceof HTMLDivElement && current.classList.contains('textLayer')) return current;
      current = current.parentElement;
    }

    return current;
  }

  document.onclick = (e) => {
    if (
      (e.target && e.target.classList.contains('selected-wrapper') && e.target.firstChild == activeOverlay) ||
      e.target == activeOverlay
    )
      return;
    if (activeOverlay) hideOverlay();
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && activeOverlay) {
      activeOverlay.querySelector('.delete-icon')?.dispatchEvent(new Event('click', {bubbles: true}));
      return;
    }
    const isRedactionShortcut = e.ctrlKey && (e.key == 's' || e.key == 'S' || e.code == 'KeyS');
    if (!isRedactionShortcut || redactionMode !== RedactionModes.TEXT) return;

    redactTextSelection();
  });

  function rotateTextBox(rect, textLayerRect, angle) {
    let left, top, width, height;
    if (!angle || angle == 0) {
      left = rect.left - textLayerRect.left;
      top = rect.top - textLayerRect.top;
      width = rect.width;
      height = rect.height;
    } else if (angle == 90) {
      left = rect.top - textLayerRect.top;
      top = textLayerRect.right - rect.right;
      width = rect.height;
      height = rect.width;
    } else if (angle == 180) {
      left = textLayerRect.right - rect.right;
      top = textLayerRect.bottom - rect.bottom;
      width = rect.width;
      height = rect.height;
    } else if (angle == 270) {
      left = textLayerRect.bottom - rect.bottom;
      top = rect.left - textLayerRect.left;
      width = rect.height;
      height = rect.width;
    }

    return {left, top, width, height};
  }

  function redactTextSelection() {
    let selection = window.getSelection();
    if (!selection || selection.rangeCount <= 0) return;
    let range = selection.getRangeAt(0);

    let textLayer = getTextLayer(range.startContainer);
    if (!textLayer) return;

    const pageNumber = textLayer.getAttribute('data-page');
    let redactionsArea = textLayer.querySelector(`#redactions-container-${pageNumber}`);
    let textLayerRect = textLayer.getBoundingClientRect();

    let rects = range.getClientRects();
    let scaleFactor = _getScaleFactor();

    let color = redactionsPalette.style.getPropertyValue('--palette-color');

    let angle = textLayer.getAttribute('data-main-rotation');
    for (const rect of rects) {
      if (!rect || !rect.width || !rect.height) continue;
      let redactionElement = document.createElement('div');
      redactionElement.classList.add('selected-wrapper');

      let {left, top, width, height} = rotateTextBox(rect, textLayerRect, angle);

      let leftDisplayScaled = _scaleToDisplay(left);
      let topDisplayScaled = _scaleToDisplay(top);
      let widthDisplayScaled = _scaleToDisplay(width);
      let heightDisplayScaled = _scaleToDisplay(height);

      let redactionInfo = {
        left: _scaleToPDF(left, scaleFactor),
        top: _scaleToPDF(top, scaleFactor),
        width: _scaleToPDF(width, scaleFactor),
        height: _scaleToPDF(height, scaleFactor),
        pageNumber: parseInt(pageNumber),
        color: color,
        element: redactionElement,
        id: UUID.uuidv4(),
      };

      redactions.push(redactionInfo);

      redactionElement.style.left = _toCalcZoomPx(leftDisplayScaled);
      redactionElement.style.top = _toCalcZoomPx(topDisplayScaled);

      redactionElement.style.width = _toCalcZoomPx(widthDisplayScaled);
      redactionElement.style.height = _toCalcZoomPx(heightDisplayScaled);
      redactionElement.style.setProperty('--palette-color', color);

      redactionsArea.appendChild(redactionElement);

      addRedactionOverlay(redactionElement, redactionInfo, textLayer);
    }

    _setRedactionsInput(redactions);
  }

  function _scaleToDisplay(value) {
    return value / zoomScaleValue;
  }

  function _scaleToPDF(value, scaleFactor) {
    if (!scaleFactor) scaleFactor = document.documentElement.getPropertyValue('--scale-factor');
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

  function addRedactionOverlay(redactionElement, redactionInfo, textLayer) {
    let redactionOverlay = document.createElement('div');

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
      `<label class="material-symbols-rounded palette-color position-relative">
         palette
       </label>`
    )[0];

    let colorPaletteInput = $(`
      <input type="color" name="color-picker" class="overlay-colorpicker-window">
      `)[0];

    colorPaletteLabel.appendChild(colorPaletteInput);

    colorPaletteLabel.onclick = (e) => {
      if (colorPaletteLabel === e.target) {
        e.stopPropagation();
      }
    };

    colorPaletteInput.onchange = (e) => {
      let color = e.target.value;
      redactionElement.style.setProperty('--palette-color', color);
      let redactionIdx = redactions.findIndex((red) => redactionInfo.id === red.id);
      if (redactionIdx < 0) return;
      redactions[redactionIdx].color = color;
      _setRedactionsInput(redactions);
    };

    redactionOverlay.appendChild(deleteBtn);
    redactionOverlay.appendChild(colorPaletteLabel);

    redactionOverlay.classList.add('redaction-overlay');
    redactionOverlay.style.display = 'none';

    redactionElement.addEventListener('textLayer-reference-changed', (e) => {
      textLayer = e.detail.textLayer;
    });

    redactionElement.onclick = (e) => {
      if (e.target != redactionElement) return;
      if (activeOverlay) hideOverlay();
      redactionElement.classList.add('active-redaction');
      activeOverlay = redactionOverlay;
      _adjustActiveOverlayCoordinates();
    };

    redactionElement.appendChild(redactionOverlay);

    // Adjust active overlay coordinates to avoid placing the overlay out of page bounds
    function _adjustActiveOverlayCoordinates() {
      activeOverlay.style.visibility = 'hidden';
      activeOverlay.style.display = 'flex';
      textLayer = textLayer || getTextLayer(redactionElement);
      let angle = parseInt(textLayer.getAttribute('data-main-rotation'));
      if (textLayer) redactionOverlay.style.transform = `rotate(${angle * -1}deg)`;

      activeOverlay.style.removeProperty('left');
      activeOverlay.style.removeProperty('top');

      let textRect = textLayer.getBoundingClientRect();
      let overlayRect = redactionOverlay.getBoundingClientRect();

      let leftOffset = 0,
        topOffset = 0;
      if (overlayRect.right > textRect.right) {
        leftOffset = textRect.right - overlayRect.right;
      } else if (overlayRect.left < textRect.left) {
        leftOffset = textRect.left - overlayRect.left;
      }

      if (overlayRect.top < textRect.top) {
        topOffset = textRect.top - overlayRect.top;
      } else if (overlayRect.bottom > textRect.bottom) {
        topOffset = textRect.bottom - overlayRect.bottom;
      }

      switch (angle) {
        case 90:
          [leftOffset, topOffset] = [topOffset, -leftOffset];
          break;
        case 180:
          [leftOffset, topOffset] = [-leftOffset, -topOffset];
          break;
        case 270:
          [leftOffset, topOffset] = [-topOffset, leftOffset];
          break;
      }

      if (leftOffset != 0) activeOverlay.style.left = `calc(50% + ${leftOffset}px`;
      if (topOffset != 0) activeOverlay.style.top = `calc(100% + ${topOffset}px`;
      activeOverlay.style.visibility = 'unset';
    }
  }
});

function calculateMouseCoordinateToRotatedBox(canvas, e) {
  let textRect = canvas.getBoundingClientRect();
  let left,
    top = 0;
  let angle = parseInt(canvas.getAttribute('data-main-rotation'));
  switch (angle) {
    case 0:
      left = clamp(e.pageX - textRect.left, 0, textRect.width);
      top = clamp(e.pageY - textRect.top, 0, textRect.height);
      break;

    case 90:
      left = clamp(e.pageY - textRect.top, 0, textRect.height);
      top = clamp(textRect.right - e.pageX, 0, textRect.width);
      break;
    case 180:
      left = clamp(textRect.right - e.pageX, 0, textRect.width);
      top = clamp(textRect.bottom - e.pageY, 0, textRect.width);
      break;
    case 270:
      left = clamp(textRect.bottom - e.pageY, 0, textRect.height);
      top = clamp(e.pageX - textRect.left, 0, textRect.width);
      break;
  }
  return {left, top};
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function addPageRedactionPreviewToPages(pagesDetailed, totalPagesCount) {
  if (pagesDetailed.all) {
    addRedactedPagePreview('#viewer > .page');
    addRedactedThumbnailPreview('#thumbnailView > a > div.thumbnail');
  } else {
    removeRedactedPagePreview();

    setPageNumbersFromRange(pagesDetailed, totalPagesCount);
    setPageNumbersFromNFunctions(pagesDetailed, totalPagesCount);

    let pageNumbers = Array.from(pagesDetailed.numbers);
    if (pageNumbers?.length > 0) {
      let pagesSelector = pageNumbers.map((number) => `#viewer > .page[data-page-number="${number}"]`).join(',');
      addRedactedPagePreview(pagesSelector);
      let thumbnailSelector = pageNumbers
        .map((number) => `#thumbnailView > a > div.thumbnail[data-page-number="${number}"]`)
        .join(',');
      addRedactedThumbnailPreview(thumbnailSelector);
    }
  }
}

function resetFieldFeedbackMessages(input, parentElement) {
  if (parentElement) parentElement.querySelectorAll('.invalid-feedback').forEach((feedback) => feedback.remove());
  if (input) {
    input.classList.remove('is-invalid');
    input.classList.remove('is-valid');
  }
}

function displayFieldErrorMessages(input, errors) {
  input.classList.add('is-invalid');
  errors.forEach((error) => {
    let element = document.createElement('div');
    element.classList.add('invalid-feedback');
    element.classList.add('list-styling');
    element.textContent = error;
    input.parentElement.appendChild(element);
  });
}

function setPageRedactionColor(color) {
  document.documentElement.style.setProperty('--page-redaction-color', color);
}

function setPageNumbersFromNFunctions(pagesDetailed, totalPagesCount) {
  pagesDetailed.functions.forEach((fun) => {
    if (!isValidFunction(fun)) return;
    for (let n = 1; n <= totalPagesCount; n++) {
      let pageNumber = eval(fun);
      if (!pageNumber || pageNumber <= 0 || pageNumber > totalPagesCount) continue;
      pagesDetailed.numbers.add(pageNumber);
    }
  });
}

function setPageNumbersFromRange(pagesDetailed, totalPagesCount) {
  pagesDetailed.ranges.forEach((range) => {
    for (let i = range.low; i <= range.high && i <= totalPagesCount; i++) {
      pagesDetailed.numbers.add(i);
    }
  });
}

function hideOverlay() {
  activeOverlay.style.display = 'none';
  activeOverlay.parentElement.classList.remove('active-redaction');
  activeOverlay = null;
}

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

function copyEvent(e, type) {
  if (type == 'pointerleave')
    return {
      layerX: e.layerX,
      layerY: e.layerY,
      pageX: e.pageX,
      pageY: e.pageY,
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      height: e.height,
      width: e.width,
      offsetX: e.offsetX,
      offsetY: e.offsetY,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      type: e.type,
      screenX: e.screenX,
      screenY: e.screenY,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      x: e.x,
      y: e.y,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      isPrimary: e.isPrimary,
      isTrusted: e.isTrusted,
      metaKey: e.metaKey,
      pressure: e.pressure,
      returnValue: e.returnValue,
      shiftKey: e.shiftKey,
      timeStamp: e.timeStamp,
      which: e.which,
      twist: e.twist,
      tangentialPressure: e.tangentialPressure,
      target: e.target,
      srcElement: e.srcElement,
      relatedTarget: e.relatedTarget,
      rangeOffset: e.rangeOffset,
      rangeParent: e.rangeParent,
      explicitOriginalTarget: e.explicitOriginalTarget,
      eventPhase: e.eventPhase,
      detail: e.detail,
      defaultPrevented: e.defaultPrevented,
      currentTarget: e.currentTarget,
      buttons: e.buttons,
      azimuthAngle: e.azimuthAngle,
      altitudeAngle: e.altitudeAngle,
    };

  return {};
}
