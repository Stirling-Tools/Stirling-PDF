window.goToFirstOrLastPage = goToFirstOrLastPage;

document.getElementById('download-pdf').addEventListener('click', async () => {
  const downloadButton = document.getElementById('download-pdf');
  const originalContent = downloadButton.innerHTML;

  downloadButton.disabled = true;
  downloadButton.innerHTML = `
    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
  `;

  try {
    const modifiedPdf = await DraggableUtils.getOverlayedPdfDocument();
    const modifiedPdfBytes = await modifiedPdf.save();
    const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = originalFileName + '_addedImage.pdf';
    link.click();
  } finally {
    downloadButton.disabled = false;
    downloadButton.innerHTML = originalContent;
  }
});
let originalFileName = '';
document.querySelector('input[name=pdf-upload]').addEventListener('change', async (event) => {
  const fileInput = event.target;
  fileInput.addEventListener('file-input-change', async (e) => {
    const { allFiles } = e.detail;
    if (allFiles && allFiles.length > 0) {
      const file = allFiles[0];
      originalFileName = file.name.replace(/\.[^/.]+$/, '');
      const pdfData = await file.arrayBuffer();
      pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs-legacy/pdf.worker.mjs';
      const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
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
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete') {
      DraggableUtils.deleteDraggableCanvas(DraggableUtils.getLastInteracted());
    }
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

async function goToFirstOrLastPage(page) {
  if (page) {
    const lastPage = DraggableUtils.pdfDoc.numPages;
    await DraggableUtils.goToPage(lastPage - 1);
  } else {
    await DraggableUtils.goToPage(0);
  }
}
