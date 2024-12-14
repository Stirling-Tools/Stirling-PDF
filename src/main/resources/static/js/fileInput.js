import FileIconFactory from './file-icon-factory.js';
import FileUtils from './file-utils.js';
import UUID from './uuid.js';
import {DecryptFile} from './DecryptFiles.js';
let isScriptExecuted = false;
if (!isScriptExecuted) {
  isScriptExecuted = true;
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.custom-file-chooser').forEach(setupFileInput);
  });
}

function setupFileInput(chooser) {
  const elementId = chooser.getAttribute('data-bs-element-id');
  const filesSelected = chooser.getAttribute('data-bs-files-selected');
  const pdfPrompt = chooser.getAttribute('data-bs-pdf-prompt');
  const inputContainerId = chooser.getAttribute('data-bs-element-container-id');

  let inputContainer = document.getElementById(inputContainerId);

  let allFiles = [];
  let overlay;
  let dragCounter = 0;

  inputContainer.addEventListener('click', (e) => {
    let inputBtn = document.getElementById(elementId);
    inputBtn.click();
  });

  const dragenterListener = function () {
    dragCounter++;
    if (!overlay) {
      // Show overlay by removing display: none from pseudo elements (::before and ::after)
      inputContainer.style.setProperty('--overlay-display', "''");
      overlay = true;
    }
  };

  const dragleaveListener = function () {
    dragCounter--;
    if (dragCounter === 0) {
      hideOverlay();
    }
  };

  function hideOverlay() {
    if (!overlay) return;
    inputContainer.style.setProperty('--overlay-display', 'none');
    overlay = false;
  }

  const dropListener = function (e) {
    e.preventDefault();
    // Drag and Drop shall only affect the target file chooser
    if (e.target !== inputContainer) {
      hideOverlay();
      dragCounter = 0;
      return;
    }

    const dt = e.dataTransfer;
    const files = dt.files;

    const fileInput = document.getElementById(elementId);
    if (fileInput?.hasAttribute('multiple')) {
      pushFileListTo(files, allFiles);
    } else if (fileInput) {
      allFiles = [files[0]];
    }

    const dataTransfer = new DataTransfer();
    allFiles.forEach((file) => dataTransfer.items.add(file));

    fileInput.files = dataTransfer.files;

    hideOverlay();

    dragCounter = 0;

    fileInput.dispatchEvent(new CustomEvent('change', {bubbles: true, detail: {source: 'drag-drop'}}));
  };

  function pushFileListTo(fileList, container) {
    for (let file of fileList) {
      container.push(file);
    }
  }

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  document.body.addEventListener('dragenter', dragenterListener);
  document.body.addEventListener('dragleave', dragleaveListener);
  document.body.addEventListener('drop', dropListener);

  $('#' + elementId).on('change', async function (e) {
    let element = e.target;
    const isDragAndDrop = e.detail?.source == 'drag-drop';

    if (element instanceof HTMLInputElement && element.hasAttribute('multiple')) {
      allFiles = isDragAndDrop ? allFiles : [...allFiles, ...element.files];
    } else {
      allFiles = Array.from(isDragAndDrop ? allFiles : [element.files[0]]);
    }
    allFiles = await Promise.all(
      allFiles.map(async (file) => {
        let decryptedFile = file;
        try {
          const decryptFile = new DecryptFile();
          const {isEncrypted, requiresPassword} = await decryptFile.checkFileEncrypted(file);
          if (file.type === 'application/pdf' && isEncrypted) {
            decryptedFile = await decryptFile.decryptFile(file, requiresPassword);
            if (!decryptedFile) throw new Error('File decryption failed.');
          }
          decryptedFile.uniqueId = UUID.uuidv4();
          return decryptedFile;
        } catch (error) {
          console.error(`Error decrypting file: ${file.name}`, error);
          if (!file.uniqueId) file.uniqueId = UUID.uuidv4();
          return file;
        }
      })
    );
    if (!isDragAndDrop) {
      let dataTransfer = toDataTransfer(allFiles);
      element.files = dataTransfer.files;
    }

    handleFileInputChange(this);
    this.dispatchEvent(new CustomEvent('file-input-change', {bubbles: true, detail: {elementId, allFiles}}));
  });

  function toDataTransfer(files) {
    let dataTransfer = new DataTransfer();
    files.forEach((file) => dataTransfer.items.add(file));
    return dataTransfer;
  }

  function handleFileInputChange(inputElement) {
    const files = allFiles;
    showOrHideSelectedFilesContainer(files);

    const filesInfo = files.map((f) => ({name: f.name, size: f.size, uniqueId: f.uniqueId}));

    const selectedFilesContainer = $(inputContainer).siblings('.selected-files');
    selectedFilesContainer.empty();
    filesInfo.forEach((info) => {
      let fileContainerClasses = 'small-file-container d-flex flex-column justify-content-center align-items-center';

      let fileContainer = document.createElement('div');
      $(fileContainer).addClass(fileContainerClasses);
      $(fileContainer).attr('id', info.uniqueId);

      let fileIconContainer = createFileIconContainer(info);

      let fileInfoContainer = createFileInfoContainer(info);

      let removeBtn = document.createElement('div');
      removeBtn.classList.add('remove-selected-file');

      let removeBtnIconHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#C02223"><path d="m339-288 141-141 141 141 51-51-141-141 141-141-51-51-141 141-141-141-51 51 141 141-141 141 51 51ZM480-96q-79 0-149-30t-122.5-82.5Q156-261 126-331T96-480q0-80 30-149.5t82.5-122Q261-804 331-834t149-30q80 0 149.5 30t122 82.5Q804-699 834-629.5T864-480q0 79-30 149t-82.5 122.5Q699-156 629.5-126T480-96Z"/></svg>`;
      $(removeBtn).append(removeBtnIconHTML);
      $(removeBtn).attr('data-file-id', info.uniqueId).click(removeFileListener);

      $(fileContainer).append(fileIconContainer);
      $(fileContainer).append(fileInfoContainer);
      $(fileContainer).append(removeBtn);

      selectedFilesContainer.append(fileContainer);
    });

    showOrHideSelectedFilesContainer(filesInfo);
  }

  function showOrHideSelectedFilesContainer(files) {
    if (files && files.length > 0) chooser.style.setProperty('--selected-files-display', 'flex');
    else chooser.style.setProperty('--selected-files-display', 'none');
  }

  function removeFileListener(e) {
    const fileId = e.target.getAttribute('data-file-id');

    let inputElement = document.getElementById(elementId);
    removeFileById(fileId, inputElement);

    showOrHideSelectedFilesContainer(allFiles);

    inputElement.dispatchEvent(new CustomEvent('file-input-change', {bubbles: true}));
  }

  function removeFileById(fileId, inputElement) {
    let fileContainer = document.getElementById(fileId);
    fileContainer.remove();

    allFiles = allFiles.filter((v) => v.uniqueId != fileId);
    let dataTransfer = toDataTransfer(allFiles);

    if (inputElement) inputElement.files = dataTransfer.files;
  }

  function createFileIconContainer(info) {
    let fileIconContainer = document.createElement('div');
    fileIconContainer.classList.add('file-icon');

    // Add icon based on the extension
    let fileExtension = FileUtils.extractFileExtension(info.name);
    let fileIcon = FileIconFactory.createFileIcon(fileExtension);

    $(fileIconContainer).append(fileIcon);
    return fileIconContainer;
  }

  function createFileInfoContainer(info) {
    let fileInfoContainer = document.createElement('div');
    let fileInfoContainerClasses = 'file-info d-flex flex-column align-items-center justify-content-center';

    $(fileInfoContainer).addClass(fileInfoContainerClasses);

    $(fileInfoContainer).append(`<div title="${info.name}">${info.name}</div>`);
    let fileSizeWithUnits = FileUtils.transformFileSize(info.size);
    $(fileInfoContainer).append(`<div title="${info.size}">${fileSizeWithUnits}</div>`);
    return fileInfoContainer;
  }

  //Listen for event of file being removed and the filter it out of the allFiles array
  document.addEventListener('fileRemoved', function (e) {
    const fileId = e.detail;
    let inputElement = document.getElementById(elementId);
    removeFileById(fileId, inputElement);
    showOrHideSelectedFilesContainer(allFiles);
  });
}
