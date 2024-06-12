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
    this.addPdfs = this.addPdfs.bind(this);
    this.addPdfsFromFiles = this.addPdfsFromFiles.bind(this);
    this.rotateElement = this.rotateElement.bind(this);
    this.rotateAll = this.rotateAll.bind(this);
    this.exportPdf = this.exportPdf.bind(this);
    this.updateFilename = this.updateFilename.bind(this);
    this.setDownloadAttribute = this.setDownloadAttribute.bind(this);
    this.preventIllegalChars = this.preventIllegalChars.bind(this);

    this.pdfAdapters = pdfAdapters;

    this.pdfAdapters.forEach((adapter) => {
      adapter.setActions({
        movePageTo: this.movePageTo,
        addPdfs: this.addPdfs,
        rotateElement: this.rotateElement,
        updateFilename: this.updateFilename,
      });
    });

    window.addPdfs = this.addPdfs;
    window.exportPdf = this.exportPdf;
    window.rotateAll = this.rotateAll;

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

  addPdfs(nextSiblingElement) {
    var input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("accept", "application/pdf");
    input.onchange = async (e) => {
      const files = e.target.files;

      this.addPdfsFromFiles(files, nextSiblingElement);
      this.updateFilename(files ? files[0].name : "");
    };

    input.click();
  }

  async addPdfsFromFiles(files, nextSiblingElement) {
    this.fileName = files[0].name;
    for (var i = 0; i < files.length; i++) {
      await this.addPdfFile(files[i], nextSiblingElement);
    }

    document.querySelectorAll(".enable-on-file").forEach((element) => {
      element.disabled = false;
    });
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
    for (var i = 0; i < this.pagesContainer.childNodes.length; i++) {
      const child = this.pagesContainer.children[i];
      if (!child) continue;
      const img = child.querySelector("img");
      if (!img) continue;
      this.rotateElement(img, deg);
    }
  }

  async exportPdf() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    const pageContainers = this.pagesContainer.querySelectorAll(".page-container"); // Select all .page-container elements
    for (var i = 0; i < pageContainers.length; i++) {
      const img = pageContainers[i].querySelector("img"); // Find the img element within each .page-container
      if (!img) continue;
      const pages = await pdfDoc.copyPages(img.doc, [img.pageIdx]);
      const page = pages[0];

      const rotation = img.style.rotate;
      if (rotation) {
        const rotationAngle = parseInt(rotation.replace(/[^\d-]/g, ""));
        page.setRotation(PDFLib.degrees(page.getRotation().angle + rotationAngle));
      }

      pdfDoc.addPage(page);
    }
    const pdfBytes = await pdfDoc.save();
    const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(pdfBlob);
    const downloadOption = localStorage.getItem("downloadOption");

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
}

export default PdfContainer;
