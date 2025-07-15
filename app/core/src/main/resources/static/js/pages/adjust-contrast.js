var canvas = document.getElementById('contrast-pdf-canvas');
var context = canvas.getContext('2d');
var originalImageData = null;
var allPages = [];
var pdfDoc = null;
var pdf = null; // This is the current PDF document

async function renderPDFAndSaveOriginalImageData(file) {
  var fileReader = new FileReader();
  fileReader.onload = async function () {
    var data = new Uint8Array(this.result);
    pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs-legacy/pdf.worker.mjs';
    pdf = await pdfjsLib.getDocument({data: data}).promise;

    // Get the number of pages in the PDF
    var numPages = pdf.numPages;
    allPages = Array.from({length: numPages}, (_, i) => i + 1);

    // Create a new PDF document
    pdfDoc = await PDFLib.PDFDocument.create();
    // Render the first page in the viewer
    await renderPageAndAdjustImageProperties(1);
    document.getElementById('sliders-container').style.display = 'block';
  };
  fileReader.readAsArrayBuffer(file);
}

// This function is now async and returns a promise
function renderPageAndAdjustImageProperties(pageNum) {
  return new Promise(async function (resolve, reject) {
    var page = await pdf.getPage(pageNum);
    var scale = 1.5;
    var viewport = page.getViewport({scale: scale});

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    var renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    var renderTask = page.render(renderContext);
    renderTask.promise.then(function () {
      originalImageData = context.getImageData(0, 0, canvas.width, canvas.height);
      adjustImageProperties();
      resolve();
    });
    canvas.classList.add('fixed-shadow-canvas');
  });
}

function adjustImageProperties() {
  var contrast = parseFloat(document.getElementById('contrast-slider').value);
  var brightness = parseFloat(document.getElementById('brightness-slider').value);
  var saturation = parseFloat(document.getElementById('saturation-slider').value);

  contrast /= 100; // normalize to range [0, 2]
  brightness /= 100; // normalize to range [0, 2]
  saturation /= 100; // normalize to range [0, 2]

  if (originalImageData) {
    var newImageData = context.createImageData(originalImageData.width, originalImageData.height);
    newImageData.data.set(originalImageData.data);

    for (var i = 0; i < newImageData.data.length; i += 4) {
      var r = newImageData.data[i];
      var g = newImageData.data[i + 1];
      var b = newImageData.data[i + 2];
      // Adjust contrast
      r = adjustContrastForPixel(r, contrast);
      g = adjustContrastForPixel(g, contrast);
      b = adjustContrastForPixel(b, contrast);
      // Adjust brightness
      r = adjustBrightnessForPixel(r, brightness);
      g = adjustBrightnessForPixel(g, brightness);
      b = adjustBrightnessForPixel(b, brightness);
      // Adjust saturation
      var rgb = adjustSaturationForPixel(r, g, b, saturation);
      newImageData.data[i] = rgb[0];
      newImageData.data[i + 1] = rgb[1];
      newImageData.data[i + 2] = rgb[2];
    }
    context.putImageData(newImageData, 0, 0);
  }
}

function rgbToHsl(r, g, b) {
  (r /= 255), (g /= 255), (b /= 255);

  var max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  var h,
    s,
    l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }

    h /= 6;
  }

  return [h, s, l];
}

function hslToRgb(h, s, l) {
  var r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    var hue2rgb = function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [r * 255, g * 255, b * 255];
}

function adjustContrastForPixel(pixel, contrast) {
  // Normalize to range [-0.5, 0.5]
  var normalized = pixel / 255 - 0.5;

  // Apply contrast
  normalized *= contrast;

  // Denormalize back to [0, 255]
  return (normalized + 0.5) * 255;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function adjustSaturationForPixel(r, g, b, saturation) {
  var hsl = rgbToHsl(r, g, b);

  // Adjust saturation
  hsl[1] = clamp(hsl[1] * saturation, 0, 1);

  // Convert back to RGB
  var rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);

  // Return adjusted RGB values
  return rgb;
}

function adjustBrightnessForPixel(pixel, brightness) {
  return Math.max(0, Math.min(255, pixel * brightness));
}
let inputFileName = '';
async function downloadPDF() {
  for (var i = 0; i < allPages.length; i++) {
    await renderPageAndAdjustImageProperties(allPages[i]);
    const pngImageBytes = canvas.toDataURL('image/png');
    const pngImage = await pdfDoc.embedPng(pngImageBytes);
    const pngDims = pngImage.scale(1);

    // Create a blank page matching the dimensions of the image
    const page = pdfDoc.addPage([pngDims.width, pngDims.height]);

    // Draw the PNG image
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pngDims.width,
      height: pngDims.height,
    });
  }

  // Serialize the PDFDocument to bytes (a Uint8Array)
  const pdfBytes = await pdfDoc.save();

  // Create a Blob
  const blob = new Blob([pdfBytes.buffer], {type: 'application/pdf'});

  // Create download link
  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(blob);
  let newFileName = inputFileName ? inputFileName.replace('.pdf', '') : 'download';
  newFileName += '_adjusted_color.pdf';

  downloadLink.download = newFileName;
  downloadLink.click();

  // After download, reset the viewer and clear stored data
  allPages = []; // Clear the pages
  originalImageData = null; // Clear the image data

  // Go back to page 1 and render it in the viewer
  if (pdf !== null) {
    renderPageAndAdjustImageProperties(1);
  }
}

// Event listeners
document.getElementById('fileInput-input').addEventListener('change', function (e) {
  const fileInput = e.target;
  fileInput.addEventListener('file-input-change', async (e) => {
    const {allFiles} = e.detail;
    if (allFiles && allFiles.length > 0) {
      const file = allFiles[0];
      inputFileName = file.name;
      renderPDFAndSaveOriginalImageData(file);
    }
  });
});

document.getElementById('contrast-slider').addEventListener('input', function () {
  document.getElementById('contrast-val').textContent = this.value;
  adjustImageProperties();
});

document.getElementById('brightness-slider').addEventListener('input', function () {
  document.getElementById('brightness-val').textContent = this.value;
  adjustImageProperties();
});

document.getElementById('saturation-slider').addEventListener('input', function () {
  document.getElementById('saturation-val').textContent = this.value;
  adjustImageProperties();
});

document.getElementById('download-button').addEventListener('click', function () {
  downloadPDF();
});
