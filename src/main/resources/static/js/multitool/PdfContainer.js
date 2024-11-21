class PdfContainer {
  fileName;
  pagesContainer;
  pagesContainerWrapper;
  pdfAdapters;
  downloadLink;

  constructor(id, wrapperId, pdfAdapters) {
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
    this.toggleSelectAll = this.toggleSelectAll.bind(this);
    this.updateSelectedPagesDisplay = this.updateSelectedPagesDisplay.bind(this);
    this.toggleSelectPageVisibility = this.toggleSelectPageVisibility.bind(this);
    this.updatePagesFromCSV = this.updatePagesFromCSV.bind(this);
    this.addFilesBlankAll = this.addFilesBlankAll.bind(this)
    this.removeAllElements = this.removeAllElements.bind(this);

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
    window.toggleSelectAll = this.toggleSelectAll;
    window.updateSelectedPagesDisplay = this.updateSelectedPagesDisplay;
    window.toggleSelectPageVisibility = this.toggleSelectPageVisibility;
    window.updatePagesFromCSV = this.updatePagesFromCSV;
    window.updateSelectedPagesDisplay = this.updateSelectedPagesDisplay;
    window.updatePageNumbersAndCheckboxes = this.updatePageNumbersAndCheckboxes;
    window.addFilesBlankAll = this.addFilesBlankAll
    window.removeAllElements = this.removeAllElements;

    const filenameInput = document.getElementById("filename-input");
    const downloadBtn = document.getElementById("export-button");

    filenameInput.onkeyup = this.updateFilename;
    filenameInput.onkeydown = this.preventIllegalChars;
    filenameInput.disabled = false;
    filenameInput.innerText = "";
    downloadBtn.disabled = true;
  }

  movePageTo(startElement, endElement, scrollTo = false) {
    const childArray = Array.from(this.pagesContainer.childNodes);
    const startIndex = childArray.indexOf(startElement);
    const endIndex = childArray.indexOf(endElement);

    // Check & remove page number elements here too if they exist because Firefox doesn't fire the relevant event on page move.
    const pageNumberElement = startElement.querySelector(".page-number");
    if (pageNumberElement) {
      startElement.removeChild(pageNumberElement);
    }

    this.pagesContainer.removeChild(startElement);
    if (!endElement) {
      this.pagesContainer.append(startElement);
    } else {
      this.pagesContainer.insertBefore(startElement, endElement);
    }

    if (scrollTo) {
      const { width } = startElement.getBoundingClientRect();
      const vector = endIndex !== -1 && startIndex > endIndex ? 0 - width : width;

      this.pagesContainerWrapper.scroll({
        left: this.pagesContainerWrapper.scrollLeft + vector,
      });
    }
  }

  addFiles(nextSiblingElement, blank = false) {
    if (blank) {

      this.addFilesBlank(nextSiblingElement);

    } else {
      var input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.setAttribute("accept", "application/pdf,image/*");
      input.onchange = async (e) => {
        const files = e.target.files;

        this.addFilesFromFiles(files, nextSiblingElement);
        this.updateFilename(files ? files[0].name : "");
        const selectAll = document.getElementById("select-pages-container");
        selectAll.classList.toggle("hidden", false);
      };

      input.click();
    }
  }

  async addFilesFromFiles(files, nextSiblingElement) {
    this.fileName = files[0].name;
    for (var i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type === "application/pdf") {
        await this.addPdfFile(file, nextSiblingElement);
      } else if (file.type.startsWith("image/")) {
        await this.addImageFile(file, nextSiblingElement);
      }
    }

    document.querySelectorAll(".enable-on-file").forEach((element) => {
      element.disabled = false;
    });
  }

  async addFilesBlank(nextSiblingElement) {
    const pdfContent = `
      %PDF-1.4
      1 0 obj
      << /Type /Catalog /Pages 2 0 R >>
      endobj
      2 0 obj
      << /Type /Pages /Kids [3 0 R] /Count 1 >>
      endobj
      3 0 obj
      << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R >>
      endobj
      5 0 obj
      << /Length 44 >>
      stream
      0 0 0 595 0 842 re
      W
      n
      endstream
      endobj
      xref
      0 6
      0000000000 65535 f
      0000000010 00000 n
      0000000071 00000 n
      0000000121 00000 n
      0000000205 00000 n
      0000000400 00000 n
      trailer
      << /Size 6 /Root 1 0 R >>
      startxref
      278
      %%EOF
    `;
    const blob = new Blob([pdfContent], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const file = new File([blob], "blank_page.pdf", { type: "application/pdf" });
    await this.addPdfFile(file, nextSiblingElement);
  }


  rotateElement(element, deg) {
    var lastTransform = element.style.rotate;
    if (!lastTransform) {
      lastTransform = "0";
    }
    const lastAngle = parseInt(lastTransform.replace(/[^\d-]/g, ""));
    const newAngle = lastAngle + deg;

    element.style.rotate = newAngle + "deg";

  }

  async addPdfFile(file, nextSiblingElement) {
    const { renderer, pdfDocument } = await this.loadFile(file);

    for (var i = 0; i < renderer.pageCount; i++) {
      const div = document.createElement("div");

      div.classList.add("page-container");

      var img = document.createElement("img");
      img.classList.add("page-image");
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
    }
  }

  async addImageFile(file, nextSiblingElement) {
    const div = document.createElement("div");
    div.classList.add("page-container");

    var img = document.createElement("img");
    img.classList.add("page-image");
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
  }

  async loadFile(file) {
    var objectUrl = URL.createObjectURL(file);
    var pdfDocument = await this.toPdfLib(objectUrl);
    var renderer = await this.toRenderer(objectUrl);
    return { renderer, pdfDocument };
  }

  async toRenderer(objectUrl) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdfjs-legacy/pdf.worker.mjs";
    const pdf = await pdfjsLib.getDocument(objectUrl).promise;
    return {
      document: pdf,
      pageCount: pdf.numPages,
      renderPage: async function (pageIdx) {
        const page = await this.document.getPage(pageIdx + 1);

        const canvas = document.createElement("canvas");

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
          canvasContext: canvas.getContext("2d"),
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
    for (let i = 0; i < this.pagesContainer.childNodes.length; i++) {
      const child = this.pagesContainer.children[i];
      if (!child) continue;

      const pageIndex = i + 1;
      //if in page select mode is active rotate only selected pages
      if (window.selectPage && !window.selectedPages.includes(pageIndex)) continue;

      const img = child.querySelector("img");
      if (!img) continue;

      this.rotateElement(img, deg);
    }
  }

  removeAllElements(){
    let pageContainerNodeList = document.querySelectorAll(".page-container");
    for (var i = 0; i < pageContainerNodeList.length; i++) {
      pageContainerNodeList[i].remove();
    }
    document.querySelectorAll(".enable-on-file").forEach((element) => {
      element.disabled = true;
    });
  }

  deleteSelected() {
    window.selectedPages.sort((a, b) => a - b);
    let deletions = 0;

    window.selectedPages.forEach((pageIndex) => {
      const adjustedIndex = pageIndex - 1 - deletions;
      const child = this.pagesContainer.children[adjustedIndex];
      if (child) {
        this.pagesContainer.removeChild(child);
        deletions++;
      }
    });

    if (this.pagesContainer.childElementCount === 0) {
      const filenameInput = document.getElementById("filename-input");
      const filenameParagraph = document.getElementById("filename");
      const downloadBtn = document.getElementById("export-button");

      if (filenameInput)
        filenameInput.disabled = true;
      filenameInput.value = "";
      if (filenameParagraph)
        filenameParagraph.innerText = "";

      downloadBtn.disabled = true;
    }

    window.selectedPages = [];
    this.updatePageNumbersAndCheckboxes();
    document.dispatchEvent(new Event("selectedPagesUpdated"));
  }

  toggleSelectAll() {
    const checkboxes = document.querySelectorAll(".pdf-actions_checkbox");
    window.selectAll = !window.selectAll;
    const selectIcon = document.getElementById("select-All-Container");
    const deselectIcon = document.getElementById("deselect-All-Container");

    if (selectIcon.style.display === "none") {
      selectIcon.style.display = "inline";
      deselectIcon.style.display = "none";
    } else {
      selectIcon.style.display = "none";
      deselectIcon.style.display = "inline";
    }
    checkboxes.forEach((checkbox) => {

      checkbox.checked = window.selectAll;

      const pageNumber = Array.from(checkbox.parentNode.parentNode.children).indexOf(checkbox.parentNode) + 1;

      if (checkbox.checked) {
        if (!window.selectedPages.includes(pageNumber)) {
          window.selectedPages.push(pageNumber);
        }
      } else {
        const index = window.selectedPages.indexOf(pageNumber);
        if (index !== -1) {
          window.selectedPages.splice(index, 1);
        }
      }
    });

    this.updateSelectedPagesDisplay();
  }

  parseCSVInput(csvInput, maxPageIndex) {
    const pages = new Set();

    csvInput.split(",").forEach((item) => {
      const range = item.split("-").map((p) => parseInt(p.trim()));
      if (range.length === 2) {
        const [start, end] = range;
        for (let i = start; i <= end && i <= maxPageIndex; i++) {
          if (i > 0) { // Ensure the page number is greater than 0
            pages.add(i);
          }
        }
      } else if (range.length === 1 && Number.isInteger(range[0])) {
        const page = range[0];
        if (page > 0 && page <= maxPageIndex) { // Ensure page is within valid range
          pages.add(page);
        }
      }
    });

    return Array.from(pages).sort((a, b) => a - b);
  }

  updatePagesFromCSV() {
    const csvInput = document.getElementById("csv-input").value;

    const allPages = this.pagesContainer.querySelectorAll(".page-container");
    const maxPageIndex = allPages.length;

    window.selectedPages = this.parseCSVInput(csvInput, maxPageIndex);

    this.updateSelectedPagesDisplay();

    const allCheckboxes = document.querySelectorAll(".pdf-actions_checkbox");
    allCheckboxes.forEach((checkbox) => {
      const page = parseInt(checkbox.getAttribute("data-page-number"));
      checkbox.checked = window.selectedPages.includes(page);
    });
  }

  formatSelectedPages(pages) {
    if (pages.length === 0) return "";

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

    return ranges.join(", ");
  }

  updateSelectedPagesDisplay() {
    const selectedPagesList = document.getElementById("selected-pages-list");
    const selectedPagesInput = document.getElementById("csv-input");
    selectedPagesList.innerHTML = ""; // Clear the list
    window.selectedPages.sort((a, b) => a - b);
    window.selectedPages.forEach((page) => {
      const pageItem = document.createElement("div");
      pageItem.className = "page-item";

      const pageNumber = document.createElement("span");
      const pagelabel = /*[[#{multiTool.page}]]*/ 'Page';
      pageNumber.className = "selected-page-number";
      pageNumber.innerText = `${pagelabel} ${page}`;
      pageItem.appendChild(pageNumber);

      const removeBtn = document.createElement("span");
      removeBtn.className = "remove-btn";
      removeBtn.innerHTML = "✕";

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
  }

  parsePageRanges(ranges) {
    const pages = new Set();

    ranges.split(',').forEach(range => {
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

  addFilesBlankAll() {
    const allPages = this.pagesContainer.querySelectorAll(".page-container");
    allPages.forEach((page, index) => {
      if (index !== 0) {
        this.addFiles(page, true)
      }
    });
  }

  splitAll() {
    const allPages = this.pagesContainer.querySelectorAll(".page-container");

    if (!window.selectPage) {
      const hasSplit = this.pagesContainer.querySelectorAll(".split-before").length > 0;
      if (hasSplit) {
        allPages.forEach(page => {
          page.classList.remove("split-before");
        });
      } else {
        allPages.forEach(page => {
          page.classList.add("split-before");
        });
      }
      return;
    }

    allPages.forEach((page, index) => {
      const pageIndex = index;
      if (window.selectPage && !window.selectedPages.includes(pageIndex)) return;

      if (page.classList.contains("split-before")) {
        page.classList.remove("split-before");
      } else {
        page.classList.add("split-before");
      }
    });
  }


  async splitPDF(baseDocBytes, splitters) {
    const baseDocument = await PDFLib.PDFDocument.load(baseDocBytes);
    const pageNum = baseDocument.getPages().length;

    splitters.sort((a, b) => a - b);; // We'll sort the separator indexes just in case querySelectorAll does something funny.
    splitters.push(pageNum); // We'll also add a faux separator at the end in order to get the pages after the last separator.

    const splitDocuments = [];
    for (const splitterPosition of splitters) {
      const subDocument = await PDFLib.PDFDocument.create();

      const splitterIndex = splitters.indexOf(splitterPosition);

      let firstPage = splitterIndex === 0 ? 0 : splitters[splitterIndex - 1];

      const pageIndices = Array.from({ length: splitterPosition - firstPage }, (value, key) => firstPage + key);

      const copiedPages = await subDocument.copyPages(baseDocument, pageIndices);

      copiedPages.forEach(copiedPage => {
        subDocument.addPage(copiedPage);
      });

      const subDocumentBytes = await subDocument.save();

      splitDocuments.push(subDocumentBytes);
    };

    return splitDocuments;
  }

  async nameAndArchiveFiles(pdfBytesArray, baseNameString) {
    const zip = new JSZip();

    for (let i = 0; i < pdfBytesArray.length; i++) {
      const documentBlob = new Blob([pdfBytesArray[i]], { type: "application/pdf" });
      zip.file(baseNameString + "-" + (i + 1) + ".pdf", documentBlob);
    }

    return zip;
  }

  async exportPdf(selected) {
    const pdfDoc = await PDFLib.PDFDocument.create();
    const pageContainers = this.pagesContainer.querySelectorAll(".page-container"); // Select all .page-container elements
    for (var i = 0; i < pageContainers.length; i++) {
      if (!selected || window.selectedPages.includes(i + 1)) {
        const img = pageContainers[i].querySelector("img"); // Find the img element within each .page-container
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
          const rotationAngle = parseInt(rotation.replace(/[^\d-]/g, ""));
          page.setRotation(PDFLib.degrees(page.getRotation().angle + rotationAngle));
        }
      }
    }
    pdfDoc.setCreator(stirlingPDFLabel);
    pdfDoc.setProducer(stirlingPDFLabel);

    const pdfBytes = await pdfDoc.save();
    const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });

    const filenameInput = document.getElementById("filename-input");

    let inputArr = filenameInput.value.split(".");

    if (inputArr !== null && inputArr !== undefined && inputArr.length > 0) {
      inputArr = inputArr.filter((n) => n); // remove all empty strings, nulls or undefined

      if (inputArr.length > 1) {
        inputArr.pop(); // remove right part after last dot
      }

      filenameInput.value = inputArr.join("");
      this.fileName = filenameInput.value;
    }

    const separators = this.pagesContainer.querySelectorAll(".split-before");
    if (separators.length !== 0) { // Split the pdf if there are separators.
      const baseName = this.fileName ? this.fileName : "managed";

      const pagesArray = Array.from(this.pagesContainer.children);
      const splitters = [];
      separators.forEach(page => {
        const pageIndex = pagesArray.indexOf(page);
        if (pageIndex !== 0) {
          splitters.push(pageIndex);
        }
      });

      const splitDocuments = await this.splitPDF(pdfBytes, splitters);
      const archivedDocuments = await this.nameAndArchiveFiles(splitDocuments, baseName);

      const self = this;
      archivedDocuments.generateAsync({ type: "base64" }).then(function (base64) {
        const url = "data:application/zip;base64," + base64;
        self.downloadLink = document.createElement("a");
        self.downloadLink.href = url;
        self.downloadLink.setAttribute("download", baseName + ".zip");
        self.downloadLink.setAttribute("target", "_blank");
        self.downloadLink.click();
      });

    } else { // Continue normally if there are no separators

      const url = URL.createObjectURL(pdfBlob);
      const downloadOption = localStorage.getItem("downloadOption");

      if (!filenameInput.value.includes(".pdf")) {
        filenameInput.value = filenameInput.value + ".pdf";
        this.fileName = filenameInput.value;
      }

      if (downloadOption === "sameWindow") {
        // Open the file in the same window
        window.location.href = url;
      } else if (downloadOption === "newWindow") {
        // Open the file in a new window
        window.open(url, "_blank");
      } else {
        // Download the file
        this.downloadLink = document.createElement("a");
        this.downloadLink.id = "download-link";
        this.downloadLink.href = url;
        // downloadLink.download = this.fileName ? this.fileName : 'managed.pdf';
        // downloadLink.download = this.fileName;
        this.downloadLink.setAttribute("download", this.fileName ? this.fileName : "managed.pdf");
        this.downloadLink.setAttribute("target", "_blank");
        this.downloadLink.onclick = this.setDownloadAttribute;
        this.downloadLink.click();
      }
    }
  }


  setDownloadAttribute() {
    this.downloadLink.setAttribute("download", this.fileName ? this.fileName : "managed.pdf");
  }

  updateFilename(fileName = "") {
    const filenameInput = document.getElementById("filename-input");
    const pagesContainer = document.getElementById("pages-container");
    const downloadBtn = document.getElementById("export-button");

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
    const checkboxes = document.querySelectorAll(".pdf-actions_checkbox");
    checkboxes.forEach(checkbox => {
      checkbox.classList.toggle("hidden", !window.selectPage);
    });
    const deleteButton = document.getElementById("delete-button");
    deleteButton.classList.toggle("hidden", !window.selectPage);
    const selectedPages = document.getElementById("selected-pages-display");
    selectedPages.classList.toggle("hidden", !window.selectPage);
    const selectAll = document.getElementById("select-All-Container");
    selectAll.classList.toggle("hidden", !window.selectPage);
    const exportSelected = document.getElementById("export-selected-button");
    exportSelected.classList.toggle("hidden", !window.selectPage);
    const selectPagesButton = document.getElementById("select-pages-button");
    selectPagesButton.style.opacity = window.selectPage ? "1" : "0.5";

    if (window.selectPage) {
      this.updatePageNumbersAndCheckboxes();
    }
  }


  updatePageNumbersAndCheckboxes() {
    const pageDivs = document.querySelectorAll(".pdf-actions_container");

    pageDivs.forEach((div, index) => {
      const pageNumber = index + 1;
      const checkbox = div.querySelector(".pdf-actions_checkbox");
      checkbox.id = `selectPageCheckbox-${pageNumber}`;
      checkbox.setAttribute("data-page-number", pageNumber);
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
  if ((uint8Array[0] === 73 && uint8Array[1] === 73 && uint8Array[2] === 42 && uint8Array[3] === 0) ||
    (uint8Array[0] === 77 && uint8Array[1] === 77 && uint8Array[2] === 0 && uint8Array[3] === 42)) {
    return 'TIFF';
  }

  // Check for GIF signature
  if (uint8Array[0] === 71 && uint8Array[1] === 73 && uint8Array[2] === 70) {
    return 'GIF';
  }

  return 'UNKNOWN';
}



export default PdfContainer;
