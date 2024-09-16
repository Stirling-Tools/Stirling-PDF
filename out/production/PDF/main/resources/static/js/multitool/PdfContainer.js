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

    this.pdfAdapters = pdfAdapters;

    this.pdfAdapters.forEach((adapter) => {
      adapter.setActions({
        movePageTo: this.movePageTo,
        addFiles: this.addFiles,
        rotateElement: this.rotateElement,
        updateFilename: this.updateFilename,
      });
    });

    window.addFiles = this.addFiles;
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

  addFiles(nextSiblingElement) {
    var input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("accept", "application/pdf,image/*");
    input.onchange = async (e) => {
      const files = e.target.files;

      this.addFilesFromFiles(files, nextSiblingElement);
      this.updateFilename(files ? files[0].name : "");
    };

    input.click();
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
