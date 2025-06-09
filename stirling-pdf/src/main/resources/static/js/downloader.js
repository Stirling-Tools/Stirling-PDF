(function () {
  if (window.isDownloadScriptInitialized) return; // Prevent re-execution
  window.isDownloadScriptInitialized = true;

  const {
    pdfPasswordPrompt,
    multipleInputsForSingleRequest,
    disableMultipleFiles,
    remoteCall,
    sessionExpired,
    refreshPage,
    error,
  } = window.stirlingPDF;

  function showErrorBanner(message, stackTrace) {
    const errorContainer = document.getElementById('errorContainer');
    errorContainer.style.display = 'block'; // Display the banner
    errorContainer.querySelector('.alert-heading').textContent = error;
    errorContainer.querySelector('p').textContent = message;
    document.querySelector('#traceContent').textContent = stackTrace;
  }

  function showSessionExpiredPrompt() {
    const errorContainer = document.getElementById('errorContainer');
    errorContainer.style.display = 'block';
    errorContainer.querySelector('.alert-heading').textContent = sessionExpired;
    errorContainer.querySelector('p').textContent = sessionExpired;
    document.querySelector('#traceContent').textContent = '';

    // Optional: Add a refresh button
    const refreshButton = document.createElement('button');
    refreshButton.textContent = refreshPage;
    refreshButton.className = 'btn btn-primary mt-3';
    refreshButton.onclick = () => location.reload();
    errorContainer.appendChild(refreshButton);
  }

  let firstErrorOccurred = false;

  $(document).ready(function () {
    $('form').submit(async function (event) {
      event.preventDefault();
      firstErrorOccurred = false;
      const url = this.action;
      let files = $('#fileInput-input')[0].files;
      const uploadLimit = window.stirlingPDF?.uploadLimit ?? 0;
      if (uploadLimit > 0) {
        const oversizedFiles = Array.from(files).filter(f => f.size > uploadLimit);
        if (oversizedFiles.length > 0) {
          const names = oversizedFiles.map(f => `"${f.name}"`).join(', ');
          if (names.length === 1) {
            alert(`${names} ${window.stirlingPDF.uploadLimitExceededSingular} ${window.stirlingPDF.uploadLimitReadable}.`);
          } else {
            alert(`${names} ${window.stirlingPDF.uploadLimitExceededPlural} ${window.stirlingPDF.uploadLimitReadable}.`);
          }
          files = Array.from(files).filter(f => f.size <= uploadLimit);
          if (files.length === 0) return;
        }
      }
      const formData = new FormData(this);
      const submitButton = document.getElementById('submitBtn');
      const showGameBtn = document.getElementById('show-game-btn');
      const originalButtonText = submitButton.textContent;
      var boredWaiting = localStorage.getItem('boredWaiting') || 'disabled';

      if (showGameBtn) {
        showGameBtn.style.display = 'none';
      }

      // Remove empty file entries
      for (let [key, value] of formData.entries()) {
        if (value instanceof File && !value.name) {
          formData.delete(key);
        }
      }
      const override = $('#override').val() || '';
      console.log(override);

      // Set a timeout to show the game button if operation takes more than 5 seconds
      const timeoutId = setTimeout(() => {
        if (boredWaiting === 'enabled' && showGameBtn) {
          showGameBtn.style.display = 'block';
          showGameBtn.parentNode.insertBefore(document.createElement('br'), showGameBtn.nextSibling);
        }
      }, 5000);

      try {
        if (!url.includes('remove-password')) {
          // Check if any PDF files are encrypted and handle decryption if necessary
          const decryptedFiles = await checkAndDecryptFiles(url, files);
          files = decryptedFiles;
        }

        submitButton.textContent = 'Processing...';
        submitButton.disabled = true;

        if (remoteCall === true) {
          if (override === 'multi' || (!multipleInputsForSingleRequest && files.length > 1 && override !== 'single')) {
            await submitMultiPdfForm(url, files, this);
          } else {
            await handleSingleDownload(url, formData);
          }
        }

        //clearFileInput();
        clearTimeout(timeoutId);
        if (showGameBtn) {
          showGameBtn.style.display = 'none';
          showGameBtn.style.marginTop = '';
        }
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;

        // After process finishes, check for boredWaiting and gameDialog open status
        const gameDialog = document.getElementById('game-container-wrapper');
        if (boredWaiting === 'enabled' && gameDialog && gameDialog.open) {
          // Display a green banner at the bottom of the screen saying "Download complete"
          let downloadCompleteText = 'Download Complete';
          if (window.downloadCompleteText) {
            downloadCompleteText = window.downloadCompleteText;
          }
          $('body').append(
            '<div id="download-complete-banner" style="position:fixed;bottom:0;left:0;width:100%;background-color:green;color:white;text-align:center;padding:10px;font-size:16px;z-index:1000;">' +
              downloadCompleteText +
              '</div>'
          );
          setTimeout(function () {
            $('#download-complete-banner').fadeOut('slow', function () {
              $(this).remove(); // Remove the banner after fading out
            });
          }, 5000); // Banner will fade out after 5 seconds
        }
      } catch (error) {
        clearTimeout(timeoutId);
        if(showGameBtn){
          showGameBtn.style.display = 'none';
        }
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;
        handleDownloadError(error);
        console.error(error);
      }
    });
  });

  async function getPDFPageCount(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs-legacy/pdf.worker.mjs';
      const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
      return pdf.numPages;
    } catch (error) {
      console.error('Error getting PDF page count:', error);
      return null;
    }
  }

  async function checkAndDecryptFiles(url, files) {
    const decryptedFiles = [];
    pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs-legacy/pdf.worker.mjs';

    // Extract the base URL
    const baseUrl = new URL(url);
    let removePasswordUrl = `${baseUrl.origin}`;

    // Check if there's a path before /api/
    const apiIndex = baseUrl.pathname.indexOf('/api/');
    if (apiIndex > 0) {
      removePasswordUrl += baseUrl.pathname.substring(0, apiIndex);
    }

    // Append the new endpoint
    removePasswordUrl += '/api/v1/security/remove-password';

    console.log(`Remove password URL: ${removePasswordUrl}`);

    for (const file of files) {
      console.log(`Processing file: ${file.name}`);
      if (file.type !== 'application/pdf') {
        console.log(`Skipping non-PDF file: ${file.name}`);
        decryptedFiles.push(file);
        continue;
      }
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({data: arrayBuffer});

        console.log(`Attempting to load PDF: ${file.name}`);
        const pdf = await loadingTask.promise;
        console.log(`File is not encrypted: ${file.name}`);
        decryptedFiles.push(file); // If no error, file is not encrypted
      } catch (error) {
        if (error.name === 'PasswordException' && error.code === 1) {
          console.log(`PDF requires password: ${file.name}`, error);
          console.log(`Attempting to remove password from PDF: ${file.name} with password.`);
          const password = prompt(`${window.translations.decrypt.passwordPrompt}`);

          if (!password) {
            console.error(`No password provided for encrypted PDF: ${file.name}`);
            showErrorBanner(
              `${window.translations.decrypt.noPassword.replace('{0}', file.name)}`,
              `${window.translations.decrypt.unexpectedError}`
            );
            throw error;
          }

          try {
            // Prepare FormData for the decryption request
            const formData = new FormData();
            formData.append('fileInput', file);
            formData.append('password', password);

            // Use handleSingleDownload to send the request
            const decryptionResult = await fetch(removePasswordUrl, {method: 'POST', body: formData});

            if (decryptionResult && decryptionResult.blob) {
              const decryptedBlob = await decryptionResult.blob();
              const decryptedFile = new File([decryptedBlob], file.name, {type: 'application/pdf'});

              /*    // Create a link element to download the file
            const link = document.createElement('a');
            link.href = URL.createObjectURL(decryptedBlob);
            link.download = 'test.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
*/
              decryptedFiles.push(decryptedFile);
              console.log(`Successfully decrypted PDF: ${file.name}`);
            } else {
              throw new Error('Decryption failed: No valid response from server');
            }
          } catch (decryptError) {
            console.error(`Failed to decrypt PDF: ${file.name}`, decryptError);
            showErrorBanner(
              `${window.translations.invalidPasswordHeader.replace('{0}', file.name)}`,
              `${window.translations.invalidPassword}`
            );
            throw decryptError;
          }
        } else {
          console.log(`Error loading PDF: ${file.name}`, error);
          throw error;
        }
      }
    }
    return decryptedFiles;
  }

  async function handleSingleDownload(url, formData, isMulti = false, isZip = false) {
    const startTime = performance.now();
    const file = formData.get('fileInput');
    let success = false;
    let errorMessage = null;

    try {
      const response = await window.fetchWithCsrf(url, {method: 'POST', body: formData});
      const contentType = response.headers.get('content-type');

      if (!response.ok) {
        errorMessage = response.status;
        if (response.status === 401) {
          showSessionExpiredPrompt();
          return;
        }
        if (contentType && contentType.includes('application/json')) {
          console.error('Throwing error banner, response was not okay');
          return handleJsonResponse(response);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = getFilenameFromContentDisposition(contentDisposition);

      const blob = await response.blob();
      success = true;

      if (contentType.includes('application/pdf') || contentType.includes('image/')) {
        //clearFileInput();
        return handleResponse(blob, filename, !isMulti, isZip);
      } else {
        //clearFileInput();
        return handleResponse(blob, filename, false, isZip);
      }
    } catch (error) {
      success = false;
      errorMessage = error.message;
      console.error('Error in handleSingleDownload:', error);
      throw error;
    } finally {
      const processingTime = performance.now() - startTime;

      // Capture analytics
      const pageCount = file && file.type === 'application/pdf' ? await getPDFPageCount(file) : null;
      if (analyticsEnabled) {
        posthog.capture('file_processing', {
          success: success,
          file_type: file ? file.type || 'unknown' : 'unknown',
          file_size: file ? file.size : 0,
          processing_time: processingTime,
          error_message: errorMessage,
          pdf_pages: pageCount,
        });
      }
    }
  }

  function getFilenameFromContentDisposition(contentDisposition) {
    let filename;

    if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
      filename = decodeURIComponent(contentDisposition.split('filename=')[1].replace(/"/g, '')).trim();
    } else {
      // If the Content-Disposition header is not present or does not contain the filename, use a default filename
      filename = 'download';
    }

    return filename;
  }

  async function handleJsonResponse(response) {
    const json = await response.json();
    const errorMessage = JSON.stringify(json, null, 2);
    if (
      errorMessage.toLowerCase().includes('the password is incorrect') ||
      errorMessage.toLowerCase().includes('Password is not provided') ||
      errorMessage.toLowerCase().includes('PDF contains an encryption dictionary')
    ) {
      if (!firstErrorOccurred) {
        firstErrorOccurred = true;
        alert(pdfPasswordPrompt);
      }
    } else {
      showErrorBanner(json.error + ':' + json.message, json.trace);
    }
  }

  async function handleResponse(blob, filename, considerViewOptions = false, isZip = false) {
    if (!blob) return;
    const downloadOption = localStorage.getItem('downloadOption');
    if (considerViewOptions) {
      if (downloadOption === 'sameWindow') {
        const url = URL.createObjectURL(blob);
        window.location.href = url;
        return;
      } else if (downloadOption === 'newWindow') {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        return;
      }
    }
    if (!isZip) {
      downloadFile(blob, filename);
    }
    return {filename, blob};
  }

  function handleDownloadError(error) {
    const errorMessage = error.message;
    showErrorBanner(errorMessage);
  }

  let urls = []; // An array to hold all the URLs

  function downloadFile(blob, filename) {
    if (!(blob instanceof Blob)) {
      console.error('Invalid blob passed to downloadFile function');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    urls.push(url); // Store the URL so it doesn't get garbage collected too soon

    return {filename, blob};
  }

  async function submitMultiPdfForm(url, files, form) {
    const zipThreshold = parseInt(localStorage.getItem('zipThreshold'), 10) || 4;
    const zipFiles = files.length > zipThreshold;
    let jszip = null;
    // Add Space below Progress Bar before Showing
    $('.progressBarContainer').after($('<br>'));
    $('.progressBarContainer').show();
    // Initialize the progress bar

    let progressBar = $('.progressBar');
    progressBar.css('width', '0%');
    progressBar.attr('aria-valuenow', 0);
    progressBar.attr('aria-valuemax', files.length);

    if (zipFiles) {
      jszip = new JSZip();
    }

    // Get the form with the method attribute set to POST
    let postForm = document.querySelector('form[method="POST"]');

    // Get existing form data
    let formData;
    if (form) {
      formData = new FormData(form);
    } else if (postForm) {
      formData = new FormData($(postForm)[0]); // Convert the form to a jQuery object and get the raw DOM element
    } else {
      console.log('No form with POST method found.');
    }
    //Remove file to reuse parameters for other runs
    formData.delete('fileInput');
    // Remove empty file entries
    for (let [key, value] of formData.entries()) {
      if (value instanceof File && !value.name) {
        formData.delete(key);
      }
    }
    const CONCURRENCY_LIMIT = 8;
    const chunks = [];
    for (let i = 0; i < Array.from(files).length; i += CONCURRENCY_LIMIT) {
      chunks.push(Array.from(files).slice(i, i + CONCURRENCY_LIMIT));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (file) => {
        let fileFormData = new FormData();
        fileFormData.append('fileInput', file);
        for (let [key, value] of fileFormData.entries()) {
          console.log(key, value);
        } // Add other form data
        for (let pair of formData.entries()) {
          fileFormData.append(pair[0], pair[1]);
          console.log(pair[0] + ', ' + pair[1]);
        }

        try {
          const downloadDetails = await handleSingleDownload(url, fileFormData, true, zipFiles);
          console.log(downloadDetails);
          if (zipFiles) {
            jszip.file(downloadDetails.filename, downloadDetails.blob);
          } else {
            //downloadFile(downloadDetails.blob, downloadDetails.filename);
          }
          updateProgressBar(progressBar, Array.from(files).length);
        } catch (error) {
          handleDownloadError(error);
          console.error(error);
        }
      });
      await Promise.all(promises);
    }

    if (zipFiles) {
      try {
        const content = await jszip.generateAsync({type: 'blob'});
        downloadFile(content, 'files.zip');
      } catch (error) {
        console.error('Error generating ZIP file: ' + error);
      }
    }
    progressBar.css('width', '100%');
    progressBar.attr('aria-valuenow', Array.from(files).length);
  }

  function updateProgressBar(progressBar, files) {
    let progress = (progressBar.attr('aria-valuenow') / files.length) * 100 + 100 / files.length;
    progressBar.css('width', progress + '%');
    progressBar.attr('aria-valuenow', parseInt(progressBar.attr('aria-valuenow')) + 1);
  }
  window.addEventListener('unload', () => {
    for (const url of urls) {
      URL.revokeObjectURL(url);
    }
  });

  // Clear file input after job
  function clearFileInput() {
    let pathname = document.location.pathname;
    if (pathname != '/merge-pdfs') {
      let formElement = document.querySelector('#fileInput-input');
      formElement.value = '';
      let editSectionElement = document.querySelector('#editSection');
      if (editSectionElement) {
        editSectionElement.style.display = 'none';
      }
      let cropPdfCanvas = document.querySelector('#cropPdfCanvas');
      let overlayCanvas = document.querySelector('#overlayCanvas');
      if (cropPdfCanvas && overlayCanvas) {
        cropPdfCanvas.width = 0;
        cropPdfCanvas.height = 0;

        overlayCanvas.width = 0;
        overlayCanvas.height = 0;
      }
    } else {
      console.log("Disabled for 'Merge'");
    }
  }
})();
