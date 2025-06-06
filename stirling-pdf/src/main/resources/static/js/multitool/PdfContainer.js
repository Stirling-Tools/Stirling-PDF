import { MovePageCommand } from './commands/move-page.js';
import { RemoveSelectedCommand } from './commands/remove.js';
import { RotateAllCommand, RotateElementCommand } from './commands/rotate.js';
import { SplitAllCommand } from './commands/split.js';
import { UndoManager } from './UndoManager.js';
import { PageBreakCommand } from './commands/page-break.js';
import { AddFilesCommand } from './commands/add-page.js';
import { DecryptFile } from '../DecryptFiles.js';
import { CommandSequence } from './commands/commands-sequence.js';

class PdfContainer {
  fileName;
  pagesContainer;
  pagesContainerWrapper;
  pdfAdapters;
  downloadLink;
  undoManager;

  constructor(id, wrapperId, pdfAdapters, undoManager) {
    this.pagesContainer = document.getElementById(id);
    this.pagesContainerWrapper = document.getElementById(wrapperId);
    this.downloadLink = null;
    this.movePageTo = this.movePageTo.bind(this);
    this.addFiles = this.addFiles.bind(this);
    this.addFilesFromFiles = this.addFilesFromFiles.bind(this);
    this.rotateElement = this.rotateElement.bind(this);
    this.rotateAll = this.rotateAll.bind(this);
    this.exportPdf = this.exportPdf.bind(this);
    this.updateFilename = this.updateFilename.bind(this);
    this.setDownloadAttribute = this.setDownloadAttribute.bind(this);
    this.preventIllegalChars = this.preventIllegalChars.bind(this);
    this.addImageFile = this.addImageFile.bind(this);
    this.nameAndArchiveFiles = this.nameAndArchiveFiles.bind(this);
    this.splitPDF = this.splitPDF.bind(this);
    this.splitAll = this.splitAll.bind(this);
    this.deleteSelected = this.deleteSelected.bind(this);
    this.selectAll = this.selectAll.bind(this);
    this.deselectAll = this.deselectAll.bind(this);
    this.updateSelectedPagesDisplay = this.updateSelectedPagesDisplay.bind(this);
    this.toggleSelectPageVisibility = this.toggleSelectPageVisibility.bind(this);
    this.updatePagesFromCSV = this.updatePagesFromCSV.bind(this);
    this.addFilesBlankAll = this.addFilesBlankAll.bind(this);
    this.removeAllElements = this.removeAllElements.bind(this);
    this.resetPages = this.resetPages.bind(this);

    this.decryptFile = new DecryptFile();

    this.undoManager = undoManager || new UndoManager();

    this.pdfAdapters = pdfAdapters;

    this.pdfAdapters.forEach((adapter) => {
      adapter.setActions({
        movePageTo: this.movePageTo,
        addFiles: this.addFiles,
        rotateElement: this.rotateElement,
        updateFilename: this.updateFilename,
        deleteSelected: this.deleteSelected,
      });
    });

    window.addFiles = this.addFiles;
    window.exportPdf = this.exportPdf;
    window.rotateAll = this.rotateAll;
    window.splitAll = this.splitAll;
    window.deleteSelected = this.deleteSelected;
    window.selectAll = this.selectAll;
    window.deselectAll = this.deselectAll;
    window.updateSelectedPagesDisplay = this.updateSelectedPagesDisplay;
    window.toggleSelectPageVisibility = this.toggleSelectPageVisibility;
    window.updatePagesFromCSV = this.updatePagesFromCSV;
    window.updateSelectedPagesDisplay = this.updateSelectedPagesDisplay;
    window.updatePageNumbersAndCheckboxes = this.updatePageNumbersAndCheckboxes;
    window.addFilesBlankAll = this.addFilesBlankAll;
    window.removeAllElements = this.removeAllElements;
    window.resetPages = this.resetPages;

    let undoBtn = document.getElementById('undo-btn');
    let redoBtn = document.getElementById('redo-btn');

    document.addEventListener('undo-manager-update', (e) => {
      let canUndo = e.detail.canUndo;
      let canRedo = e.detail.canRedo;

      undoBtn.disabled = !canUndo;
      redoBtn.disabled = !canRedo;
    });

    window.undo = () => {
      if (undoManager.canUndo()) undoManager.undo();
      else {
        undoBtn.disabled = !undoManager.canUndo();
        redoBtn.disabled = !undoManager.canRedo();
      }
    };

    window.redo = () => {
      if (undoManager.canRedo()) undoManager.redo();
      else {
        undoBtn.disabled = !undoManager.canUndo();
        redoBtn.disabled = !undoManager.canRedo();
      }
    };

    const filenameInput = document.getElementById('filename-input');
    const downloadBtn = document.getElementById('export-button');

    filenameInput.onkeyup = this.updateFilename;
    filenameInput.onkeydown = this.preventIllegalChars;
    filenameInput.disabled = false;
    filenameInput.innerText = '';
    downloadBtn.disabled = true;
  }

  movePagesTo(startElements, endElement, scrollTo = false) {
    let commands = [];
    startElements.forEach((page) => {
      let command = new MovePageCommand(
        page,
        endElement,
        this.pagesContainer,
        this.pagesContainerWrapper,
        scrollTo
      )
      command.execute();
      commands.push(command);
    })

    let commandSequence = new CommandSequence(commands);
    this.undoManager.pushUndoClearRedo(commandSequence);
    return commandSequence;
  }

  showButton(button, show) {
    button.classList.toggle('hidden', !show);
  }

  movePageTo(startElements, endElement, scrollTo = false) {

    if (Array.isArray(startElements)){
      return this.movePagesTo(startElements, endElement, scrollTo = false);
    }

    let movePageCommand = new MovePageCommand(
      startElements,
      endElement,
      this.pagesContainer,
      this.pagesContainerWrapper,
      scrollTo
    );

    movePageCommand.execute();
    this.undoManager.pushUndoClearRedo(movePageCommand);
    return movePageCommand;
  }

  async addFiles(element) {
    let addFilesCommand = new AddFilesCommand(
      element,
      window.selectedPages,
      this.addFilesAction.bind(this),
      this.pagesContainer
    );

    await addFilesCommand.execute();

    this.undoManager.pushUndoClearRedo(addFilesCommand);
    window.tooltipSetup();

  }

  async addFilesAction(nextSiblingElement) {
    let pages = [];
    return new Promise((resolve) => {
      var input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.setAttribute('accept', 'application/pdf,image/*');

      input.onchange = async (e) => {
        const files = e.target.files;
        if (files.length > 0) {
          pages = await this.addFilesFromFiles(files, nextSiblingElement, pages);
          this.updateFilename(files[0].name);

          if(window.selectPage){
            this.showButton(document.getElementById('select-pages-container'), true);
          }
        }
        resolve(pages);
      };

      input.click();
    });
  }

  async handleDroppedFiles(files, nextSiblingElement = null) {
    if (files.length > 0) {
      const pages = await this.addFilesFromFiles(files, nextSiblingElement, []);
      this.updateFilename(files[0]?.name || 'untitled');

      if(window.selectPage) {
        this.showButton(document.getElementById('select-pages-container'), true);
      }

      return pages;
    }
  }

  async addFilesFromFiles(files, nextSiblingElement, pages) {
    this.fileName = files[0].name;
    for (var i = 0; i < files.length; i++) {
      const startTime = Date.now();
      let processingTime,
        errorMessage = null,
        pageCount = 0;

      try {
        let decryptedFile = files[i];
        let isEncrypted = false;
        let requiresPassword = false;
        await this.decryptFile
          .checkFileEncrypted(decryptedFile)
          .then((result) => {
            isEncrypted = result.isEncrypted;
            requiresPassword = result.requiresPassword;
          })
          .catch((error) => {
            console.error(error);
          });
        if (decryptedFile.type === 'application/pdf' && isEncrypted) {
          decryptedFile = await this.decryptFile.decryptFile(decryptedFile, requiresPassword);
          if (!decryptedFile) {
            throw new Error('File decryption failed.');
          }
        }

        if (decryptedFile.type === 'application/pdf') {
          const { renderer, pdfDocument } = await this.loadFile(decryptedFile);
          pageCount = renderer.pageCount || 0;
          pages = await this.addPdfFile(renderer, pdfDocument, nextSiblingElement, pages);
        } else if (decryptedFile.type.startsWith('image/')) {
          pages = await this.addImageFile(decryptedFile, nextSiblingElement, pages);
        }

        processingTime = Date.now() - startTime;
        this.captureFileProcessingEvent(true, decryptedFile, processingTime, null, pageCount);
      } catch (error) {
        processingTime = Date.now() - startTime;
        errorMessage = error.message || 'Unknown error';
        this.captureFileProcessingEvent(false, files[i], processingTime, errorMessage, pageCount);
      }
    }

    document.querySelectorAll('.enable-on-file').forEach((element) => {
      element.disabled = false;
    });

    return pages;
  }

  captureFileProcessingEvent(success, file, processingTime, errorMessage, pageCount) {
    try {
      if (analyticsEnabled) {
        posthog.capture('file_processing', {
          success,
          file_type: file?.type || 'unknown',
          file_size: file?.size || 0,
          processing_time: processingTime,
          error_message: errorMessage,
          pdf_pages: pageCount,
        });
      }
    } catch { }
  }

  async addFilesBlank(nextSiblingElement, pages) {
    let doc = await PDFLib.PDFDocument.create();
    let docBytes = await doc.save();

    const url = URL.createObjectURL(new Blob([docBytes], { type: 'application/pdf' }));

    const renderer = await this.toRenderer(url);
    pages = await this.addPdfFile(renderer, doc, nextSiblingElement, pages);
    return pages;
  }

  rotateElement(element, deg) {
    let rotateCommand = new RotateElementCommand(element, deg);
    rotateCommand.execute();

    return rotateCommand;
  }

  async addPdfFile(renderer, pdfDocument, nextSiblingElement, pages) {
    for (var i = 0; i < renderer.pageCount; i++) {
      const div = document.createElement('div');

      div.classList.add('page-container');
      div.id = 'page-container-' + (i + 1);
      var img = document.createElement('img');
      img.classList.add('page-image');
      const imageSrc = await renderer.renderPage(i);
      img.src = imageSrc;
      img.pageIdx = i;
      img.rend = renderer;
      img.doc = pdfDocument;
      div.appendChild(img);

      this.pdfAdapters.forEach((adapter) => {
        adapter.adapt?.(div);
      });

      if (nextSiblingElement) {
        this.pagesContainer.insertBefore(div, nextSiblingElement);
      } else {
        this.pagesContainer.appendChild(div);
      }

      pages.push(div);
    }

    return pages;
  }

  async addImageFile(file, nextSiblingElement, pages) {
    const div = document.createElement('div');
    div.classList.add('page-container');

    var img = document.createElement('img');
    img.classList.add('page-image');
    img.src = URL.createObjectURL(file);
    div.appendChild(img);

    this.pdfAdapters.forEach((adapter) => {
      adapter.adapt?.(div);
    });
    if (nextSiblingElement) {
      this.pagesContainer.insertBefore(div, nextSiblingElement);
    } else {
      this.pagesContainer.appendChild(div);
    }
    pages.push(div);
    return pages;
  }

  async loadFile(file) {
    var objectUrl = URL.createObjectURL(file);
    var pdfDocument = await this.toPdfLib(objectUrl);
    var renderer = await this.toRenderer(objectUrl);
    return { renderer, pdfDocument };
  }

  async toRenderer(objectUrl) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs-legacy/pdf.worker.mjs';
    const pdf = await pdfjsLib.getDocument(objectUrl).promise;
    return {
      document: pdf,
      pageCount: pdf.numPages,
      renderPage: async function (pageIdx) {
        const page = await this.document.getPage(pageIdx + 1);

        const canvas = document.createElement('canvas');

        // set the canvas size to the size of the page
        if (page.rotate == 90 || page.rotate == 270) {
          canvas.width = page.view[3];
          canvas.height = page.view[2];
        } else {
          canvas.width = page.view[2];
          canvas.height = page.view[3];
        }

        // render the page onto the canvas
        var renderContext = {
          canvasContext: canvas.getContext('2d'),
          viewport: page.getViewport({ scale: 1 }),
        };

        await page.render(renderContext).promise;
        return canvas.toDataURL();
      },
    };
  }

  async toPdfLib(objectUrl) {
    const existingPdfBytes = await fetch(objectUrl).then((res) => res.arrayBuffer());
    const pdfDoc = await PDFLib.PDFDocument.load(existingPdfBytes, {
      ignoreEncryption: true,
    });
    return pdfDoc;
  }

  rotateAll(deg) {
    let elementsToRotate = [];
    for (let i = 0; i < this.pagesContainer.childNodes.length; i++) {
      const child = this.pagesContainer.children[i];
      if (!child) continue;

      const pageIndex = i + 1;
      //if in page select mode is active rotate only selected pages
      if (window.selectPage && !window.selectedPages.includes(pageIndex)) continue;

      const img = child.querySelector('img');
      if (!img) continue;

      elementsToRotate.push(img);
    }

    let rotateAllCommand = new RotateAllCommand(elementsToRotate, deg);
    rotateAllCommand.execute();

    this.undoManager.pushUndoClearRedo(rotateAllCommand);
  }

  removeAllElements() {
    let pageContainerNodeList = document.querySelectorAll('.page-container');
    for (var i = 0; i < pageContainerNodeList.length; i++) {
      pageContainerNodeList[i].remove();
    }
    document.querySelectorAll('.enable-on-file').forEach((element) => {
      element.disabled = true;
    });
  }

  deleteSelected() {
    window.selectedPages.sort((a, b) => a - b);
    let removeSelectedCommand = new RemoveSelectedCommand(
      this.pagesContainer,
      window.selectedPages,
      this.updatePageNumbersAndCheckboxes
    );
    removeSelectedCommand.execute();
    this.undoManager.pushUndoClearRedo(removeSelectedCommand);
  }

  selectAll() {
    const checkboxes = document.querySelectorAll('.pdf-actions_checkbox');
    const selectIcon = document.getElementById('select-All-Container');
    const deselectIcon = document.getElementById('deselect-All-Container');

    this.showButton(selectIcon, false);
    this.showButton(deselectIcon, true);

    checkboxes.forEach((checkbox) => {
      checkbox.checked = true;

      const pageNumber = Array.from(checkbox.parentNode.parentNode.children).indexOf(checkbox.parentNode) + 1;

      if (!window.selectedPages.includes(pageNumber)) {
        window.selectedPages.push(pageNumber);
      }
    });

    this.updateSelectedPagesDisplay();
  }

  deselectAll() {
    const checkboxes = document.querySelectorAll('.pdf-actions_checkbox');
    const selectIcon = document.getElementById('select-All-Container');
    const deselectIcon = document.getElementById('deselect-All-Container');

    this.showButton(selectIcon, true);
    this.showButton(deselectIcon, false);

    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;

      const pageNumber = Array.from(checkbox.parentNode.parentNode.children).indexOf(checkbox.parentNode) + 1;

      const index = window.selectedPages.indexOf(pageNumber);
      if (index !== -1) {
        window.selectedPages.splice(index, 1);
      }
    });

    this.updateSelectedPagesDisplay();
  }

  parseCSVInput(csvInput, maxPageIndex) {
    const pages = new Set();

    csvInput.split(',').forEach((item) => {
      const range = item.split('-').map((p) => parseInt(p.trim()));
      if (range.length === 2) {
        const [start, end] = range;
        for (let i = start; i <= end && i <= maxPageIndex; i++) {
          if (i > 0) {
            // Ensure the page number is greater than 0
            pages.add(i);
          }
        }
      } else if (range.length === 1 && Number.isInteger(range[0])) {
        const page = range[0];
        if (page > 0 && page <= maxPageIndex) {
          // Ensure page is within valid range
          pages.add(page);
        }
      }
    });

    return Array.from(pages).sort((a, b) => a - b);
  }

  updatePagesFromCSV() {
    const csvInput = document.getElementById('csv-input').value;

    const allPages = this.pagesContainer.querySelectorAll('.page-container');
    const maxPageIndex = allPages.length;

    window.selectedPages = this.parseCSVInput(csvInput, maxPageIndex);

    this.updateSelectedPagesDisplay();

    const allCheckboxes = document.querySelectorAll('.pdf-actions_checkbox');
    allCheckboxes.forEach((checkbox) => {
      const page = parseInt(checkbox.getAttribute('data-page-number'));
      checkbox.checked = window.selectedPages.includes(page);
    });
  }

  formatSelectedPages(pages) {
    if (pages.length === 0) return '';

    pages.sort((a, b) => a - b); // Sort the page numbers in ascending order
    const ranges = [];
    let start = pages[0];
    let end = start;

    for (let i = 1; i < pages.length; i++) {
      if (pages[i] === end + 1) {
        // Consecutive page, update end
        end = pages[i];
      } else {
        // Non-consecutive page, finalize current range
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = pages[i];
        end = start;
      }
    }
    // Add the last range
    ranges.push(start === end ? `${start}` : `${start}-${end}`);

    return ranges.join(', ');
  }

  updateSelectedPagesDisplay() {
    const selectedPagesList = document.getElementById('selected-pages-list');
    const selectedPagesInput = document.getElementById('csv-input');
    selectedPagesList.innerHTML = ''; // Clear the list
    window.selectedPages.sort((a, b) => a - b);
    window.selectedPages.forEach((page) => {
      const pageItem = document.createElement('div');
      pageItem.className = 'page-item';

      const pageNumber = document.createElement('span');
      const pagelabel = /*[[#{multiTool.page}]]*/ 'Page';
      pageNumber.className = 'selected-page-number';
      pageNumber.innerText = `${pagelabel} ${page}`;
      pageItem.appendChild(pageNumber);

      const removeBtn = document.createElement('span');
      removeBtn.className = 'remove-btn';
      removeBtn.innerHTML = '✕';

      // Remove page from selected pages list and update display and checkbox
      removeBtn.onclick = () => {
        window.selectedPages = window.selectedPages.filter((p) => p !== page);
        this.updateSelectedPagesDisplay();

        const checkbox = document.getElementById(`selectPageCheckbox-${page}`);
        if (checkbox) {
          checkbox.checked = false;
        }
      };

      pageItem.appendChild(removeBtn);
      selectedPagesList.appendChild(pageItem);
    });

    // Update the input field with the formatted page list
    selectedPagesInput.value = this.formatSelectedPages(window.selectedPages);

    const selectIcon = document.getElementById('select-All-Container');
    const deselectIcon = document.getElementById('deselect-All-Container');

    if (window.selectPage) { // Check if selectPage mode is active
      console.log("Page Select on. Showing buttons");
      //Check if no pages are selected
      if (window.selectedPages.length === 0) {
        this.showButton(selectIcon, true);
        this.showButton(deselectIcon, false);
      } else {
        this.showButton(deselectIcon, true);
      }

      //Check if all pages are selected
      const allCheckboxes = document.querySelectorAll('.pdf-actions_checkbox');
      const allSelected = Array.from(allCheckboxes).every((checkbox) => checkbox.checked);
      if (allSelected) {
        this.showButton(selectIcon, false);
        this.showButton(deselectIcon, true);
      } else {
        this.showButton(selectIcon, true);
      }
    } else {
      console.log("Page Select off. Hidding buttons");
      this.showButton(selectIcon, false);
      this.showButton(deselectIcon, false);
    }
  }

  parsePageRanges(ranges) {
    const pages = new Set();

    ranges.split(',').forEach((range) => {
      const [start, end] = range.split('-').map(Number);
      if (end) {
        for (let i = start; i <= end; i++) {
          pages.add(i);
        }
      } else {
        pages.add(start);
      }
    });

    return Array.from(pages).sort((a, b) => a - b);
  }

  async addFilesBlankAll() {
    const allPages = this.pagesContainer.querySelectorAll('.page-container');

    let pageBreakCommand = new PageBreakCommand(
      allPages,
      window.selectPage,
      window.selectedPages,
      this.addFilesBlank.bind(this),
      this.pagesContainer
    );

    await pageBreakCommand.execute();

    this.undoManager.pushUndoClearRedo(pageBreakCommand);
  }

  splitAll() {
    const allPages = this.pagesContainer.querySelectorAll('.page-container');
    let splitAllCommand = new SplitAllCommand(allPages, window.selectPage, window.selectedPages, 'split-before');
    splitAllCommand.execute();

    this.undoManager.pushUndoClearRedo(splitAllCommand);
  }

  async splitPDF(baseDocBytes, splitters) {
    const baseDocument = await PDFLib.PDFDocument.load(baseDocBytes);
    const pageNum = baseDocument.getPages().length;

    splitters.sort((a, b) => a - b); // We'll sort the separator indexes just in case querySelectorAll does something funny.
    splitters.push(pageNum); // We'll also add a faux separator at the end in order to get the pages after the last separator.

    const splitDocuments = [];
    for (const splitterPosition of splitters) {
      const subDocument = await PDFLib.PDFDocument.create();

      const splitterIndex = splitters.indexOf(splitterPosition);

      let firstPage = splitterIndex === 0 ? 0 : splitters[splitterIndex - 1];

      const pageIndices = Array.from({ length: splitterPosition - firstPage }, (value, key) => firstPage + key);

      const copiedPages = await subDocument.copyPages(baseDocument, pageIndices);

      copiedPages.forEach((copiedPage) => {
        subDocument.addPage(copiedPage);
      });

      const subDocumentBytes = await subDocument.save();

      splitDocuments.push(subDocumentBytes);
    }

    return splitDocuments;
  }

  async nameAndArchiveFiles(pdfBytesArray, baseNameString) {
    const zip = new JSZip();

    for (let i = 0; i < pdfBytesArray.length; i++) {
      const documentBlob = new Blob([pdfBytesArray[i]], {
        type: 'application/pdf',
      });
      zip.file(baseNameString + '-' + (i + 1) + '.pdf', documentBlob);
    }

    return zip;
  }

  async exportPdf(selected) {
    const pdfDoc = await PDFLib.PDFDocument.create();
    const pageContainers = this.pagesContainer.querySelectorAll('.page-container'); // Select all .page-container elements
    for (var i = 0; i < pageContainers.length; i++) {
      if (!selected || window.selectedPages.includes(i + 1)) {
        const img = pageContainers[i].querySelector('img'); // Find the img element within each .page-container
        if (!img) continue;
        let page;
        if (img.doc) {
          const pages = await pdfDoc.copyPages(img.doc, [img.pageIdx]);
          page = pages[0];
          pdfDoc.addPage(page);
        } else {
          page = pdfDoc.addPage([img.naturalWidth, img.naturalHeight]);
          const imageBytes = await fetch(img.src).then((res) => res.arrayBuffer());
          const uint8Array = new Uint8Array(imageBytes);
          const imageType = detectImageType(uint8Array);

          let image;
          switch (imageType) {
            case 'PNG':
              image = await pdfDoc.embedPng(imageBytes);
              break;
            case 'JPEG':
              image = await pdfDoc.embedJpg(imageBytes);
              break;
            case 'TIFF':
              image = await pdfDoc.embedTiff(imageBytes);
              break;
            case 'GIF':
              console.warn(`Unsupported image type: ${imageType}`);
              continue; // Skip this image
            default:
              console.warn(`Unsupported image type: ${imageType}`);
              continue; // Skip this image
          }
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
        }
        const rotation = img.style.rotate;
        if (rotation) {
          const rotationAngle = parseInt(rotation.replace(/[^\d-]/g, ''));
          page.setRotation(PDFLib.degrees(page.getRotation().angle + rotationAngle));
        }
      }
    }
    pdfDoc.setCreator(stirlingPDFLabel);
    pdfDoc.setProducer(stirlingPDFLabel);

    const pdfBytes = await pdfDoc.save();
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

    const filenameInput = document.getElementById('filename-input');

    let inputArr = filenameInput.value.split('.');

    if (inputArr !== null && inputArr !== undefined && inputArr.length > 0) {
      inputArr = inputArr.filter((n) => n); // remove all empty strings, nulls or undefined

      if (inputArr.length > 1) {
        inputArr.pop(); // remove right part after last dot
      }

      filenameInput.value = inputArr.join('');
      this.fileName = filenameInput.value;
    }

    const separators = this.pagesContainer.querySelectorAll('.split-before');
    if (separators.length !== 0) {
      // Split the pdf if there are separators.
      const baseName = this.fileName ? this.fileName : 'managed';

      const pagesArray = Array.from(this.pagesContainer.children);
      const splitters = [];
      separators.forEach((page) => {
        const pageIndex = pagesArray.indexOf(page);
        if (pageIndex !== 0) {
          splitters.push(pageIndex);
        }
      });

      const splitDocuments = await this.splitPDF(pdfBytes, splitters);
      const archivedDocuments = await this.nameAndArchiveFiles(splitDocuments, baseName);

      const self = this;
      archivedDocuments.generateAsync({ type: 'base64' }).then(function (base64) {
        const url = 'data:application/zip;base64,' + base64;
        self.downloadLink = document.createElement('a');
        self.downloadLink.href = url;
        self.downloadLink.setAttribute('download', baseName + '.zip');
        self.downloadLink.setAttribute('target', '_blank');
        self.downloadLink.click();
      });
    } else {
      // Continue normally if there are no separators

      const url = URL.createObjectURL(pdfBlob);
      const downloadOption = localStorage.getItem('downloadOption');

      if (!filenameInput.value.includes('.pdf')) {
        filenameInput.value = filenameInput.value + '.pdf';
        this.fileName = filenameInput.value;
      }

      if (downloadOption === 'sameWindow') {
        // Open the file in the same window
        window.location.href = url;
      } else if (downloadOption === 'newWindow') {
        // Open the file in a new window
        window.open(url, '_blank');
      } else {
        // Download the file
        this.downloadLink = document.createElement('a');
        this.downloadLink.id = 'download-link';
        this.downloadLink.href = url;
        // downloadLink.download = this.fileName ? this.fileName : 'managed.pdf';
        // downloadLink.download = this.fileName;
        this.downloadLink.setAttribute('download', this.fileName ? this.fileName : 'managed.pdf');
        this.downloadLink.setAttribute('target', '_blank');
        this.downloadLink.onclick = this.setDownloadAttribute;
        this.downloadLink.click();
      }
    }
  }

  resetPages() {
    const pageContainers = this.pagesContainer.querySelectorAll('.page-container');

    pageContainers.forEach((container, index) => {
      container.id = 'page-container-' + (index + 1);
    });

    const checkboxes = document.querySelectorAll('.pdf-actions_checkbox');
    const selectIcon = document.getElementById('select-All-Container');
    const deselectIcon = document.getElementById('deselect-All-Container');

    checkboxes.forEach((checkbox) => {
      const pageNumber = Array.from(checkbox.parentNode.parentNode.children).indexOf(checkbox.parentNode) + 1;

      const index = window.selectedPages.indexOf(pageNumber);
      if (index !== -1) {
        window.selectedPages.splice(index, 1);
      }
    });
    window.toggleSelectPageVisibility();
  }

  setDownloadAttribute() {
    this.downloadLink.setAttribute('download', this.fileName ? this.fileName : 'managed.pdf');
  }

  updateFilename(fileName = '') {
    const filenameInput = document.getElementById('filename-input');
    const pagesContainer = document.getElementById('pages-container');
    const downloadBtn = document.getElementById('export-button');

    downloadBtn.disabled = pagesContainer.childElementCount === 0;

    if (!this.fileName) {
      this.fileName = fileName;
    }

    if (!filenameInput.value) {
      filenameInput.value = this.fileName;
    }
  }

  preventIllegalChars(e) {
    // const filenameInput = document.getElementById('filename-input');
    //
    // filenameInput.value = filenameInput.value.replace('.pdf', '');
    //
    // // prevent .
    // if (filenameInput.value.includes('.')) {
    //     filenameInput.value.replace('.','');
    // }
  }

  toggleSelectPageVisibility() {
    window.selectPage = !window.selectPage;
    const checkboxes = document.querySelectorAll('.pdf-actions_checkbox');
    checkboxes.forEach((checkbox) => {
      checkbox.classList.toggle('hidden', !window.selectPage);
    });
    const deleteButton = document.getElementById('delete-button');
    deleteButton.classList.toggle('hidden', !window.selectPage);
    const selectedPages = document.getElementById('selected-pages-display');
    selectedPages.classList.toggle('hidden', !window.selectPage);

    if(!window.selectPage)
    {
      this.showButton(document.getElementById('deselect-All-Container'), false);
      this.showButton(document.getElementById('select-All-Container'), false);

      // Uncheck all checkboxes and clear selected pages
      const allCheckboxes = document.querySelectorAll('.pdf-actions_checkbox');
      allCheckboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });
      window.selectedPages = [];
      this.updateSelectedPagesDisplay();
    }
    else{
      const allCheckboxes = document.querySelectorAll('.pdf-actions_checkbox');
      const allSelected = Array.from(allCheckboxes).every((checkbox) => checkbox.checked);
      if (!allSelected) {
        this.showButton(document.getElementById('select-All-Container'), true);
      }

      if (window.selectedPages.length > 0) {
        this.showButton(document.getElementById('deselect-All-Container'), true);
      }
    }

    const exportSelected = document.getElementById('export-selected-button');
    exportSelected.classList.toggle('hidden', !window.selectPage);
    const selectPagesButton = document.getElementById('select-pages-button');
    selectPagesButton.style.opacity = window.selectPage ? '1' : '0.5';

    if (window.selectPage) {
      this.updatePageNumbersAndCheckboxes();
    }
  }

  updatePageNumbersAndCheckboxes() {
    const pageDivs = document.querySelectorAll('.pdf-actions_container');

    pageDivs.forEach((div, index) => {
      const pageNumber = index + 1;
      const checkbox = div.querySelector('.pdf-actions_checkbox');
      checkbox.id = `selectPageCheckbox-${pageNumber}`;
      checkbox.setAttribute('data-page-number', pageNumber);
      checkbox.checked = window.selectedPages.includes(pageNumber);
    });
  }
}

function detectImageType(uint8Array) {
  // Check for PNG signature
  if (uint8Array[0] === 137 && uint8Array[1] === 80 && uint8Array[2] === 78 && uint8Array[3] === 71) {
    return 'PNG';
  }

  // Check for JPEG signature
  if (uint8Array[0] === 255 && uint8Array[1] === 216 && uint8Array[2] === 255) {
    return 'JPEG';
  }

  // Check for TIFF signature (little-endian and big-endian)
  if (
    (uint8Array[0] === 73 && uint8Array[1] === 73 && uint8Array[2] === 42 && uint8Array[3] === 0) ||
    (uint8Array[0] === 77 && uint8Array[1] === 77 && uint8Array[2] === 0 && uint8Array[3] === 42)
  ) {
    return 'TIFF';
  }

  // Check for GIF signature
  if (uint8Array[0] === 71 && uint8Array[1] === 73 && uint8Array[2] === 70) {
    return 'GIF';
  }

  return 'UNKNOWN';
}

export default PdfContainer;
