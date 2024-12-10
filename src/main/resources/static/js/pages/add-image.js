document.getElementById('download-pdf').addEventListener('click', async () => {
  const modifiedPdf = await DraggableUtils.getOverlayedPdfDocument();
  const modifiedPdfBytes = await modifiedPdf.save();
  const blob = new Blob([modifiedPdfBytes], {type: 'application/pdf'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = originalFileName + '_addedImage.pdf';
  link.click();
});
let originalFileName = '';
document.querySelector('input[name=pdf-upload]').addEventListener('change', async (event) => {
  const fileInput = event.target;
  fileInput.addEventListener('file-input-change', async (e) => {
    const {allFiles} = e.detail;
    if (allFiles && allFiles.length > 0) {
      const file = allFiles[0];
      originalFileName = file.name.replace(/\.[^/.]+$/, '');
      const pdfData = await file.arrayBuffer();
      pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs-legacy/pdf.worker.mjs';
      const pdfDoc = await pdfjsLib.getDocument({data: pdfData}).promise;
      await DraggableUtils.renderPage(pdfDoc, 0);

      document.querySelectorAll('.show-on-file-selected').forEach((el) => {
        el.style.cssText = '';
      });
    }
  });
});
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.show-on-file-selected').forEach((el) => {
    el.style.cssText = 'display:none !important';
  });
});

const imageUpload = document.querySelector('input[name=image-upload]');
imageUpload.addEventListener('change', (e) => {
  if (!e.target.files) {
    return;
  }
  for (const imageFile of e.target.files) {
    var reader = new FileReader();
    reader.readAsDataURL(imageFile);
    reader.onloadend = function (e) {
      DraggableUtils.createDraggableCanvasFromUrl(e.target.result);
    };
  }
});
