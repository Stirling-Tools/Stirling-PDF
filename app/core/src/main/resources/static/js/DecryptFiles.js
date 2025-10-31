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

    const ordered = {};
    preferredOrder.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        ordered[key] = obj[key];
      }
    });

    Object.keys(obj).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(ordered, key)) {
        ordered[key] = obj[key];
      }
    });

    return JSON.stringify(ordered, null, 2);
  } catch (err) {
    if (typeof input === 'string') return input;
    try {
      return JSON.stringify(input, null, 2);
    } catch (jsonErr) {
      return String(input);
    }
  }
}

function formatUserFriendlyError(json) {
  if (!json || typeof json !== 'object') {
    return typeof json === 'string' ? json : '';
  }

  const lines = [];
  const title = json.title || json.error || '';
  const detail = json.detail || json.message || '';

  const primaryLine = title && detail ? `${title}: ${detail}` : title || detail;

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

function buildPdfPasswordProblemDetail(fileName) {
  const stirling = window.stirlingPDF || {};
  const detailTemplate = stirling.pdfPasswordDetail || 'The PDF Document is passworded and either the password was not provided or was incorrect';
  const title = stirling.pdfPasswordTitle || 'PDF Password Required';
  const hints = [
    stirling.pdfPasswordHint1,
    stirling.pdfPasswordHint2,
    stirling.pdfPasswordHint3,
    stirling.pdfPasswordHint4,
    stirling.pdfPasswordHint5,
    stirling.pdfPasswordHint6
  ].filter((hint) => typeof hint === 'string' && hint.trim().length > 0);
  const actionRequired = stirling.pdfPasswordAction || 'Provide the owner/permissions password, not just the document open password.';

  return {
    errorCode: 'E004',
    title,
    detail: detailTemplate.replace('{0}', fileName),
    type: '/errors/pdf-password',
    path: '/api/v1/security/remove-password',
    hints,
    actionRequired
  };
}

function buildCorruptedPdfProblemDetail(fileName) {
  const stirling = window.stirlingPDF || {};
  const detailTemplate = stirling.pdfCorruptedMessage || 'The PDF file "{0}" appears to be corrupted or has an invalid structure.';
  const hints = [
    stirling.pdfCorruptedHint1,
    stirling.pdfCorruptedHint2,
    stirling.pdfCorruptedHint3
  ].filter((hint) => typeof hint === 'string' && hint.trim().length > 0);
  const actionRequired = stirling.pdfCorruptedAction || stirling.tryRepairMessage || '';

  return {
    errorCode: 'E001',
    title: stirling.pdfCorruptedTitle || 'PDF File Corrupted',
    detail: detailTemplate.replace('{0}', fileName),
    type: '/errors/pdf-corrupted',
    hints,
    actionRequired
  };
}

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
          const problemDetail = buildPdfPasswordProblemDetail(file.name);
          this.showProblemDetail(problemDetail);
          return null; // No file to return
        }

        formData.append('password', password);
      }
      // Send decryption request
      const response = await fetchWithCsrf('/api/v1/security/remove-password', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
          const errorJson = await response.json();
          this.showProblemDetail(errorJson);
        } else {
          const errorText = await response.text();
          console.error(`${window.decrypt.invalidPassword} ${errorText}`);
          const fallbackProblem = buildPdfPasswordProblemDetail(file.name);
          if (errorText && errorText.trim().length > 0) {
            fallbackProblem.detail = errorText.trim();
          }
          this.showProblemDetail(fallbackProblem);
        }
        return null; // No file to return
      }

      this.removeErrorBanner();
      const decryptedBlob = await response.blob();
      return new File([decryptedBlob], file.name, {
        type: 'application/pdf',
      });
    } catch (error) {
      // Handle network or unexpected errors
      console.error(`Failed to decrypt PDF: ${file.name}`, error);
      const fallbackDetail =
        (error && error.message) ||
        window.decrypt.unexpectedError ||
        'There was an error processing the file. Please try again.';

      const unexpectedProblem = {
        title: (window.stirlingPDF && window.stirlingPDF.errorUnexpectedTitle) || 'Unexpected Error',
        detail: fallbackDetail,
      };

      if (window.decrypt.serverError) {
        unexpectedProblem.hints = [
          window.decrypt.serverError.replace('{0}', file.name),
        ];
      }

      this.showProblemDetail(unexpectedProblem);
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
      } else if (error.name === 'InvalidPDFException' ||
                 (error.message && error.message.includes('Invalid PDF structure'))) {
        // Handle corrupted PDF files
        console.error('Corrupted PDF detected:', error);
        if (window.stirlingPDF.currentPage !== 'repair') {
          const corruptedProblem = buildCorruptedPdfProblemDetail(file.name);
          this.showProblemDetail(corruptedProblem);
        } else {
          console.log('Suppressing corrupted PDF warning banner on repair page');
        }
        throw new Error('PDF file is corrupted.');
      }

      console.error('Error checking encryption:', error);
      throw new Error('Failed to determine if the file is encrypted.');
    }
  }

  showProblemDetail(problemDetail) {
    const errorContainer = document.getElementById('errorContainer');
    if (!errorContainer) {
      console.error('Error container not found');
      return;
    }

    errorContainer.style.display = 'block';

    const heading = errorContainer.querySelector('.alert-heading');
    const messageEl = errorContainer.querySelector('p');
    const traceEl = document.querySelector('#traceContent');

    const fallbackHeading = (window.stirlingPDF && window.stirlingPDF.error) || 'Error';

    if (heading) {
      heading.textContent =
        (problemDetail && typeof problemDetail === 'object' && problemDetail.title) ||
        fallbackHeading;
    }

    if (messageEl) {
      messageEl.style.whiteSpace = 'pre-wrap';
      messageEl.textContent =
        typeof problemDetail === 'object'
          ? formatUserFriendlyError(problemDetail)
          : String(problemDetail || '');
    }

    if (traceEl) {
      traceEl.textContent =
        typeof problemDetail === 'object' ? formatProblemDetailsJson(problemDetail) : '';
    }
  }

  removeErrorBanner() {
    const errorContainer = document.getElementById('errorContainer');
    if (!errorContainer) {
      return;
    }

    errorContainer.style.display = 'none';

    const heading = errorContainer.querySelector('.alert-heading');
    if (heading) {
      heading.textContent = (window.stirlingPDF && window.stirlingPDF.error) || 'Error';
    }

    const messageEl = errorContainer.querySelector('p');
    if (messageEl) {
      messageEl.textContent = '';
    }

    const traceEl = document.querySelector('#traceContent');
    if (traceEl) {
      traceEl.textContent = '';
    }
  }
}
