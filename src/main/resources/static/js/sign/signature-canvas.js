const signaturePadCanvas = document.getElementById('drawing-pad-canvas');
const undoButton = document.getElementById("signature-undo-button");
const redoButton = document.getElementById("signature-redo-button");
const signaturePad = new SignaturePad(signaturePadCanvas, {
  minWidth: 1,
  maxWidth: 2,
  penColor: 'black',
});

let undoData = [];

signaturePad.addEventListener("endStroke", () => {
  undoData = [];
});

window.addEventListener("keydown", (event) => {
  switch (true) {
    case event.key === "z" && event.ctrlKey:
      undoButton.click();
      break;
    case event.key === "y" && event.ctrlKey:
      redoButton.click();
      break;
  }
});

function undoDraw() {
  const data = signaturePad.toData();

  if (data && data.length > 0) {
    const removed = data.pop();
    undoData.push(removed);
    signaturePad.fromData(data);
  }
}

function redoDraw() {

  if (undoData.length > 0) {
    const data = signaturePad.toData();
    data.push(undoData.pop());
    signaturePad.fromData(data);
  }
}

function addDraggableFromPad() {
  if (signaturePad.isEmpty()) return;
  const startTime = Date.now();
  const croppedDataUrl = getCroppedCanvasDataUrl(signaturePadCanvas);
  console.log(Date.now() - startTime);
  DraggableUtils.createDraggableCanvasFromUrl(croppedDataUrl);
}

function getCroppedCanvasDataUrl(canvas) {
  let originalCtx = canvas.getContext('2d');
  let originalWidth = canvas.width;
  let originalHeight = canvas.height;
  let imageData = originalCtx.getImageData(0, 0, originalWidth, originalHeight);

  let minX = originalWidth + 1,
    maxX = -1,
    minY = originalHeight + 1,
    maxY = -1,
    x = 0,
    y = 0,
    currentPixelColorValueIndex;

  for (y = 0; y < originalHeight; y++) {
    for (x = 0; x < originalWidth; x++) {
      currentPixelColorValueIndex = (y * originalWidth + x) * 4;
      let currentPixelAlphaValue = imageData.data[currentPixelColorValueIndex + 3];
      if (currentPixelAlphaValue > 0) {
        if (minX > x) minX = x;
        if (maxX < x) maxX = x;
        if (minY > y) minY = y;
        if (maxY < y) maxY = y;
      }
    }
  }

  let croppedWidth = maxX - minX;
  let croppedHeight = maxY - minY;
  if (croppedWidth < 0 || croppedHeight < 0) return null;
  let cuttedImageData = originalCtx.getImageData(minX, minY, croppedWidth, croppedHeight);

  let croppedCanvas = document.createElement('canvas'),
    croppedCtx = croppedCanvas.getContext('2d');

  croppedCanvas.width = croppedWidth;
  croppedCanvas.height = croppedHeight;
  croppedCtx.putImageData(cuttedImageData, 0, 0);

  return croppedCanvas.toDataURL();
}

function isMobile() {
  const userAgentCheck = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|Opera Mini/i.test(navigator.userAgent);
  const viewportCheck = window.matchMedia('(max-width: 768px)').matches;
  return userAgentCheck || viewportCheck;
}

function getDeviceScalingFactor() {
  return isMobile() ? 3 : 10;
}

function resizeCanvas() {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const additionalFactor = getDeviceScalingFactor();

  signaturePadCanvas.width = signaturePadCanvas.offsetWidth * ratio * additionalFactor;
  signaturePadCanvas.height = signaturePadCanvas.offsetHeight * ratio * additionalFactor;
  signaturePadCanvas.getContext('2d').scale(ratio * additionalFactor, ratio * additionalFactor);

  signaturePad.clear();
}

new IntersectionObserver((entries, observer) => {
  if (entries.some((entry) => entry.intersectionRatio > 0)) {
    resizeCanvas();
  }
}).observe(signaturePadCanvas);

new ResizeObserver(resizeCanvas).observe(signaturePadCanvas);
