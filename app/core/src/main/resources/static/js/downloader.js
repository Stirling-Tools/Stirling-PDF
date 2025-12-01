(function () {
  if (window.isDownloadScriptInitialized) return; // Prevent re-execution
  window.isDownloadScriptInitialized = true;

  const PDFJS_DEFAULT_OPTIONS = {
    cMapUrl: pdfjsPath + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: pdfjsPath + 'standard_fonts/',
  };

  // Global PDF processing count tracking for survey system
  window.incrementPdfProcessingCount = function() {
    let pdfProcessingCount = parseInt(localStorage.getItem('pdfProcessingCount') || '0');
    pdfProcessingCount++;
    localStorage.setItem('pdfProcessingCount', pdfProcessingCount.toString());
  };

  const {
    pdfPasswordPrompt,
    multipleInputsForSingleRequest,
    disableMultipleFiles,
    remoteCall,
    sessionExpired,
    refreshPage,
    error,
  } = window.stirlingPDF;

  // Format Problem Details JSON with consistent key order and pretty-printing
  function formatProblemDetailsJson(input) {
    try {
      const obj = typeof input === 'string' ? JSON.parse(input) : input;
      const preferredOrder = [
        'errorCode',
        'title',
        'status',
        'type',
        'detail',
        'instance',
        'path',
        'timestamp',
        'hints',
        'actionRequired'
      ];

      const out = {};
      // Place preferred keys first if present
      preferredOrder.forEach((k) => {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          out[k] = obj[k];
        }
      });
      // Append remaining keys preserving their original order
      Object.keys(obj).forEach((k) => {
        if (!Object.prototype.hasOwnProperty.call(out, k)) {
          out[k] = obj[k];
        }
      });
      return JSON.stringify(out, null, 2);
    } catch (e) {
      // Fallback: if it's already a string, return as-is; otherwise pretty-print best effort
      if (typeof input === 'string') return input;
      try {
        return JSON.stringify(input, null, 2);
      } catch {
        return String(input);
      }
    }
  }

  function showErrorBanner(message, stackTrace) {
    const errorContainer = document.getElementById('errorContainer');
    if (!errorContainer) {
      console.error('Error container not found');
      return;
    }
    errorContainer.style.display = 'block'; // Display the banner
    const heading = errorContainer.querySelector('.alert-heading');
    const messageEl = errorContainer.querySelector('p');
    const traceEl = document.querySelector('#traceContent');

    if (heading) heading.textContent = error;
    if (messageEl) {
      messageEl.style.whiteSpace = 'pre-wrap';
      messageEl.textContent = message;
    }

    // Format stack trace: if it looks like JSON, pretty-print with consistent key order; otherwise clean it up
    if (traceEl) {
      if (stackTrace) {
        // Check if stackTrace is already JSON formatted
        if (stackTrace.trim().startsWith('{') || stackTrace.trim().startsWith('[')) {
          traceEl.textContent = formatProblemDetailsJson(stackTrace);
        } else {
          // Filter out unhelpful stack traces (internal browser/library paths)
          // Only show if it contains meaningful error info
          const lines = stackTrace.split('\n');
          const meaningfulLines = lines.filter(line =>
            !line.includes('pdfjs-legacy') &&
            !line.includes('pdf.worker') &&
            !line.includes('pdf.mjs') &&
            line.trim().length > 0
          );
          traceEl.textContent = meaningfulLines.length > 0 ? meaningfulLines.join('\n') : 'No additional trace information available';
        }
      } else {
        traceEl.textContent = '';
      }
    }
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

      // Log fileOrder for debugging
      const fileOrderValue = formData.get('fileOrder');
      if (fileOrderValue) {
        console.log('FormData fileOrder:', fileOrderValue);
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
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsPath + 'pdf.worker.mjs';
      const pdf = await pdfjsLib
        .getDocument({
          ...PDFJS_DEFAULT_OPTIONS,
          data: arrayBuffer,
        })
        .promise;
      return pdf.numPages;
    } catch (error) {
      console.error('Error getting PDF page count:', error);
      return null;
    }
  }

  async function checkAndDecryptFiles(url, files) {
    const decryptedFiles = [];
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsPath + 'pdf.worker.mjs';

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
        const loadingTask = pdfjsLib.getDocument({
          ...PDFJS_DEFAULT_OPTIONS,
          data: arrayBuffer,
        });

        console.log(`Attempting to load PDF: ${file.name}`);
        const pdf = await loadingTask.promise;
        console.log(`File is not encrypted: ${file.name}`);
        decryptedFiles.push(file); // If no error, file is not encrypted
      } catch (error) {
        if (error.name === 'PasswordException' && error.code === 1) {
          console.log(`PDF requires password: ${file.name}`, error);
          console.log(`Attempting to remove password from PDF: ${file.name} with password.`);
          const password = prompt(`${window.decrypt.passwordPrompt}`);

          if (!password) {
            console.error(`No password provided for encrypted PDF: ${file.name}`);

            // Create a Problem Detail object matching the server's E004 response using localized strings
            const passwordDetailTemplate =
              window.stirlingPDF?.pdfPasswordDetail ||
              `The PDF file "${file.name}" requires a password to proceed.`;
            const hints = [
              window.stirlingPDF?.pdfPasswordHint1,
              window.stirlingPDF?.pdfPasswordHint2,
              window.stirlingPDF?.pdfPasswordHint3,
              window.stirlingPDF?.pdfPasswordHint4,
              window.stirlingPDF?.pdfPasswordHint5,
              window.stirlingPDF?.pdfPasswordHint6
            ].filter(Boolean);
            const noProblemDetail = {
              errorCode: 'E004',
              title: window.stirlingPDF?.pdfPasswordTitle || 'PDF Password Required',
              detail: passwordDetailTemplate.includes('{0}')
                ? passwordDetailTemplate.replace('{0}', file.name)
                : passwordDetailTemplate,
              hints,
              actionRequired:
                window.stirlingPDF?.pdfPasswordAction ||
                'Provide the owner/permissions password, not just the document open password.'
            };

            const bannerMessage = formatUserFriendlyError(noProblemDetail);
            const debugInfo = formatProblemDetailsJson(noProblemDetail);
            showErrorBanner(bannerMessage, debugInfo);

            const err = new Error(noProblemDetail.detail);
            err.alreadyHandled = true;
            throw err;
          }

          try {
            // Prepare FormData for the decryption request
            const formData = new FormData();
            formData.append('fileInput', file);
            formData.append('password', password);

            // Use handleSingleDownload to send the request
            const decryptionResult = await fetchWithCsrf(removePasswordUrl, {method: 'POST', body: formData});

            // Check if we got an error response (RFC 7807 Problem Details)
            if (!decryptionResult.ok) {
              const contentType = decryptionResult.headers.get('content-type');
              if (contentType && (contentType.includes('application/json') || contentType.includes('application/problem+json'))) {
                // Parse the RFC 7807 error response
                const errorJson = await decryptionResult.json();
                const formattedError = formatUserFriendlyError(errorJson);
                const debugInfo = formatProblemDetailsJson(errorJson);
                const title = errorJson.title || 'Decryption Failed';
                const detail = errorJson.detail || 'Failed to decrypt PDF';
                const bannerMessage = formattedError || `${title}: ${detail}`;
                showErrorBanner(bannerMessage, debugInfo);
                const err = new Error(detail);
                err.alreadyHandled = true; // Mark error as already handled
                throw err;
              } else {
                throw new Error('Decryption failed: Invalid server response');
              }
            }

            if (decryptionResult && decryptionResult.blob) {
              const decryptedBlob = await decryptionResult.blob();
              const decryptedFile = new File([decryptedBlob], file.name, {type: 'application/pdf'});

              decryptedFiles.push(decryptedFile);
              console.log(`Successfully decrypted PDF: ${file.name}`);
            } else {
              throw new Error('Decryption failed: No valid response from server');
            }
          } catch (decryptError) {
            console.error(`Failed to decrypt PDF: ${file.name}`, decryptError);
            // Error banner already shown above with formatted hints/actions
            throw decryptError;
          }
        } else if (error.name === 'InvalidPDFException' ||
                   (error.message && error.message.includes('Invalid PDF structure'))) {
          // Handle corrupted PDF files
          console.log(`Corrupted PDF detected: ${file.name}`, error);
          if (window.stirlingPDF.currentPage !== 'repair') {
            // Create a formatted error message using properties from language files
            const errorMessage = window.stirlingPDF.pdfCorruptedMessage.replace('{0}', file.name);
            const hints = [
              window.stirlingPDF.pdfCorruptedHint1,
              window.stirlingPDF.pdfCorruptedHint2,
              window.stirlingPDF.pdfCorruptedHint3
            ].filter((hint) => typeof hint === 'string' && hint.trim().length > 0);
            const action = window.stirlingPDF.pdfCorruptedAction || window.stirlingPDF.tryRepairMessage;

            const problemDetails = {
              title: window.stirlingPDF.pdfCorruptedTitle || window.stirlingPDF.error || 'Error',
              detail: errorMessage
            };

            if (hints.length > 0) {
              problemDetails.hints = hints;
            }

            if (action) {
              problemDetails.actionRequired = action;
            }

            const bannerMessage = formatUserFriendlyError(problemDetails);
            const debugInfo = formatProblemDetailsJson(problemDetails);

            showErrorBanner(bannerMessage, debugInfo);
            // Mark error as already handled to prevent double display
            error.alreadyHandled = true;
          } else {
            // On repair page, suppress banner; user already knows and is repairing
            console.log('Suppressing corrupted PDF banner on repair page');
          }
          throw error;
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
        // Check for JSON error responses first (including RFC 7807 Problem Details)
        if (contentType && (contentType.includes('application/json') || contentType.includes('application/problem+json'))) {
          console.error('Throwing error banner, response was not okay');
          await handleJsonResponse(response);
          // Return early - error banner already shown by handleJsonResponse
          // Don't throw to avoid double error display
          return null;
        }
        // Only show session expired for 401 without JSON body (actual auth failure)
        if (response.status === 401) {
          showSessionExpiredPrompt();
          return;
        }
        // For non-JSON errors, try to extract error message from response body
        try {
          const errorText = await response.text();
          if (errorText && errorText.trim().length > 0) {
            showErrorBanner(`HTTP ${response.status}`, errorText);
            // Return early - error already shown
            return null;
          }
        } catch (textError) {
          // If we can't read the response body, show generic error
          const errorMsg = `HTTP ${response.status} - ${response.statusText || 'Request failed'}`;
          showErrorBanner('Error', errorMsg);
          return null;
        }
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

      // Increment PDF processing count for survey tracking
      if (success && typeof window.incrementPdfProcessingCount === 'function') {
        window.incrementPdfProcessingCount();
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

  /**
   * Format error details in a user-friendly way
   * Extracts key information and presents hints/actions prominently
   */
  function formatUserFriendlyError(json) {
    if (!json || typeof json !== 'object') {
      return typeof json === 'string' ? json : '';
    }

    const lines = [];
    const title = json.title || json.error || '';
    const detail = json.detail || json.message || '';

    const primaryLine = title && detail
      ? `${title}: ${detail}`
      : title || detail;

    if (primaryLine) {
      lines.push(primaryLine);
    }

    if (json.errorCode) {
      lines.push('');
      lines.push(`Error Code: ${json.errorCode}`);
    }

    const detailAlreadyIncluded = detail && primaryLine && primaryLine.includes(detail);

    if (detail && !detailAlreadyIncluded) {
      lines.push('');
      lines.push(detail);
    }

    if (json.hints && Array.isArray(json.hints) && json.hints.length > 0) {
      lines.push('');
      lines.push('How to fix:');
      json.hints.forEach((hint, index) => {
        lines.push(`  ${index + 1}. ${hint}`);
      });
    }

    if (json.actionRequired) {
      lines.push('');
      lines.push(json.actionRequired);
    }

    if (json.supportId) {
      lines.push('');
      lines.push(`Support ID: ${json.supportId}`);
    }

    return lines
      .filter((line, index, arr) => {
        if (line !== '') return true;
        if (index === 0 || index === arr.length - 1) return false;
        return arr[index - 1] !== '';
      })
      .join('\n');
  }

  async function handleJsonResponse(response) {
    const json = await response.json();

    // Format the full JSON response for display in stack trace with errorCode first
    const formattedJson = formatProblemDetailsJson(json);

    // Check for PDF password errors using RFC 7807 fields
    const isPdfPasswordError =
      json.type === '/errors/pdf-password' ||
      json.errorCode === 'E004' ||
      (json.detail && (
        json.detail.toLowerCase().includes('pdf document is passworded') ||
        json.detail.toLowerCase().includes('password is incorrect') ||
        json.detail.toLowerCase().includes('password was not provided') ||
        json.detail.toLowerCase().includes('pdf contains an encryption dictionary')
      ));

    const fallbackTitle = json.title || json.error || 'Error';
    const fallbackDetail = json.detail || json.message || '';
    const fallbackMessage = fallbackDetail ? `${fallbackTitle}: ${fallbackDetail}` : fallbackTitle;
    const bannerMessage = formatUserFriendlyError(json) || fallbackMessage;

    if (isPdfPasswordError) {
      showErrorBanner(bannerMessage, formattedJson);

      // Show alert only once for user attention
      if (!firstErrorOccurred) {
        firstErrorOccurred = true;
        const detail = json.detail || 'The PDF document requires a password to open.';
        alert(pdfPasswordPrompt + '\n\n' + detail);
      }
    } else {
      // Show user-friendly error, fallback to full JSON for debugging
      showErrorBanner(bannerMessage, formattedJson);
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
    // Skip if error was already handled and displayed
    if (error.alreadyHandled) {
      return;
    }
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
          // If downloadDetails is null, error was already shown, skip processing
          if (downloadDetails) {
            if (zipFiles) {
              jszip.file(downloadDetails.filename, downloadDetails.blob);
            } else {
              //downloadFile(downloadDetails.blob, downloadDetails.filename);
            }
            updateProgressBar(progressBar, Array.from(files).length);
          }
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
    setTimeout(() => {
      progressBar.closest('.progressBarContainer').hide();
      progressBar.css('width', '0%');
      progressBar.attr('aria-valuenow', 0);
    }, 1000);
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
