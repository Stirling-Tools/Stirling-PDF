export class DecryptFile {
  async decryptFile(file) {
    try {
      const password = prompt('This file is password-protected. Please enter the password:');

      if (password === null) {
        // User cancelled
        console.error(`Password prompt cancelled for PDF: ${file.name}`);
        this.showErrorBanner(
          `${window.translations.cancelled.replace('{0}', file.name)}`,
          '',
          `${window.translations.unexpectedError}`
        );
        return null; // No file to return
      }

      if (!password) {
        // No password provided
        console.error(`No password provided for encrypted PDF: ${file.name}`);
        this.showErrorBanner(
          `${window.translations.noPassword.replace('{0}', file.name)}`,
          '',
          `${window.translations.unexpectedError}`
        );
        return null; // No file to return
      }

      const formData = new FormData();
      formData.append('fileInput', file);
      formData.append('password', password);

      // Send decryption request
      const response = await fetch('/api/v1/security/remove-password', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const decryptedBlob = await response.blob();
        this.removeErrorBanner();
        return new File([decryptedBlob], file.name, {type: 'application/pdf'});
      } else {
        const errorText = await response.text();
        console.error(`${window.translations.invalidPassword} ${errorText}`);
        this.showErrorBanner(
          `${window.translations.invalidPassword}`,
          errorText,
          `${window.translations.invalidPasswordHeader.replace('{0}', file.name)}`
        );
        return null; // No file to return
      }
    } catch (error) {
      // Handle network or unexpected errors
      console.error(`Failed to decrypt PDF: ${file.name}`, error);
      this.showErrorBanner(
        `${window.translations.unexpectedError.replace('{0}', file.name)}`,
        `${error.message || window.translations.unexpectedError}`,
        error
      );
      return null; // No file to return
    }
  }

  async checkFileEncrypted(file) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs-legacy/pdf.worker.mjs';
      const arrayBuffer = await file.arrayBuffer(); // Convert file to ArrayBuffer
      await pdfjsLib.getDocument({
        data: arrayBuffer,
        password: '',
      }).promise;

      return false; // File is not encrypted
    } catch (error) {
      if (error.name === 'PasswordException') {
        return true; // File is encrypted
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
