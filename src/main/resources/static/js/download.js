document.getElementById('download-pdf').addEventListener('click', async () => {
  const modifiedPdf = await DraggableUtils.getOverlayedPdfDocument();
  let decryptedFile = modifiedPdf;
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
  const modifiedPdfBytes = await modifiedPdf.save();
  const blob = new Blob([modifiedPdfBytes], {type: 'application/pdf'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = originalFileName + '_signed.pdf';
  link.click();
});
