export class DecryptFile {

  constructor(){
    this.decryptWorker = null
  }

  async decryptFile(file, requiresPassword) {

    try {
      async function getCsrfToken() {
        const cookieValue = document.cookie
          .split('; ')
          .find((row) => row.startsWith('XSRF-TOKEN='))
          ?.split('=')[1];

        if (cookieValue) {
          return cookieValue;
        }

        const csrfElement = document.querySelector('input[name="_csrf"]');
        return csrfElement ? csrfElement.value : null;
      }
      const csrfToken = await getCsrfToken();
      const formData = new FormData();
      formData.append('fileInput', file);
      if (requiresPassword) {
        const password = prompt(`${window.decrypt.passwordPrompt}`);

        if (password === null) {
          // User cancelled
          console.error(`Password prompt cancelled for PDF: ${file.name}`);
          return null; // No file to return
        }

        if (!password) {
          // No password provided
          console.error(`No password provided for encrypted PDF: ${file.name}`);
          this.showErrorBanner(
            `${window.decrypt.noPassword.replace('{0}', file.name)}`,
            '',
            `${window.decrypt.unexpectedError}`
          );
          return null; // No file to return
        }

        formData.append('password', password);
      }
      // Send decryption request
      const response = await fetch('/api/v1/security/remove-password', {
        method: 'POST',
        body: formData,
        headers: csrfToken ? {'X-XSRF-TOKEN': csrfToken} : undefined,
      });

      if (response.ok) {
        this.removeErrorBanner();
        const decryptedBlob = await response.blob();
        return new File([decryptedBlob], file.name, {
          type: "application/pdf",
        });
      } else {
        const errorText = await response.text();
        console.error(`${window.decrypt.invalidPassword} ${errorText}`);
        this.showErrorBanner(
          `${window.decrypt.invalidPassword}`,
          errorText,
          `${window.decrypt.invalidPasswordHeader.replace('{0}', file.name)}`
        );
        return null; // No file to return
      }
    } catch (error) {
      // Handle network or unexpected errors
      console.error(`Failed to decrypt PDF: ${file.name}`, error);
      this.showErrorBanner(
        `${window.decrypt.unexpectedError.replace('{0}', file.name)}`,
        `${error.message || window.decrypt.unexpectedError}`,
        error
      );
      return null; // No file to return
    }
  }

  async checkFileEncrypted(file) {
    try {
      if (file.type !== 'application/pdf') {
        return {isEncrypted: false, requiresPassword: false};
      }

      pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs-legacy/pdf.worker.mjs';

      const arrayBuffer = await file.arrayBuffer();
      const arrayBufferForPdfLib = arrayBuffer.slice(0);
      var loadingTask;

      if(this.decryptWorker == null){
        loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
        });
        this.decryptWorker = loadingTask._worker

      }else {
        loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          worker: this.decryptWorker
        });
      }

      await loadingTask.promise;

      try {
        //Uses PDFLib.PDFDocument to check if unpassworded but encrypted
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBufferForPdfLib);
        return {isEncrypted: false, requiresPassword: false};
      } catch (error) {
        if (error.message.includes('Input document to `PDFDocument.load` is encrypted')) {
          return {isEncrypted: true, requiresPassword: false};
        }
        console.error('Error checking encryption:', error);
        throw new Error('Failed to determine if the file is encrypted.');
      }
    } catch (error) {
      if (error.name === 'PasswordException') {
        if (error.code === pdfjsLib.PasswordResponses.NEED_PASSWORD) {
          return {isEncrypted: true, requiresPassword: true};
        } else if (error.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD) {
          return {isEncrypted: true, requiresPassword: false};
        }
      }

      console.error('Error checking encryption:', error);
      throw new Error('Failed to determine if the file is encrypted.');
    }
  }

  showErrorBanner(message, stackTrace, error) {
    const errorContainer = document.getElementById('errorContainer');
    errorContainer.style.display = 'block'; // Display the banner
    errorContainer.querySelector('.alert-heading').textContent = error;
    errorContainer.querySelector('p').textContent = message;
    document.querySelector('#traceContent').textContent = stackTrace;
  }

  removeErrorBanner() {
    const errorContainer = document.getElementById('errorContainer');
    errorContainer.style.display = 'none'; // Hide the banner
    errorContainer.querySelector('.alert-heading').textContent = '';
    errorContainer.querySelector('p').textContent = '';
    document.querySelector('#traceContent').textContent = '';
  }
}
