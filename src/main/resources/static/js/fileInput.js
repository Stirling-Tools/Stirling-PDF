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
let hasDroppedImage = false;

function setupFileInput(chooser) {
  const elementId = chooser.getAttribute('data-bs-element-id');
  const filesSelected = chooser.getAttribute('data-bs-files-selected');
  const pdfPrompt = chooser.getAttribute('data-bs-pdf-prompt');
  const inputContainerId = chooser.getAttribute('data-bs-element-container-id');

  let inputContainer = document.getElementById(inputContainerId);

  if (inputContainer.id === 'pdf-upload-input-container') {
    inputContainer.querySelector('#dragAndDrop').innerHTML = window.fileInput.dragAndDropPDF;
  } else if (inputContainer.id === 'image-upload-input-container') {
    inputContainer.querySelector('#dragAndDrop').innerHTML = window.fileInput.dragAndDropImage;
  }
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

    const filesInfo = files.map((f) => ({
      name: f.name,
      size: f.size,
      uniqueId: f.uniqueId,
      type: f.type,
      url: URL.createObjectURL(f),
    }));

    const selectedFilesContainer = $(inputContainer).siblings('.selected-files');
    selectedFilesContainer.empty();
    filesInfo.forEach((info) => {
      let fileContainerClasses = 'small-file-container d-flex flex-column justify-content-center align-items-center';

      let fileContainer = document.createElement('div');
      $(fileContainer).addClass(fileContainerClasses);
      $(fileContainer).attr('id', info.uniqueId);

      let fileIconContainer = document.createElement('div');
      const isDragAndDropEnabled =
        window.location.pathname.includes('add-image') || window.location.pathname.includes('sign');
      if (info.type.startsWith('image/')) {
        let imgPreview = document.createElement('img');
        imgPreview.src = info.url;
        imgPreview.alt = 'Preview';
        imgPreview.style.width = '50px';
        imgPreview.style.height = '50px';
        imgPreview.style.objectFit = 'cover';
        $(fileIconContainer).append(imgPreview);

        if (isDragAndDropEnabled) {
          let dragIcon = document.createElement('div');
          dragIcon.classList.add('drag-icon');
          dragIcon.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e8eaed"><path d="M360-160q-33 0-56.5-23.5T280-240q0-33 23.5-56.5T360-320q33 0 56.5 23.5T440-240q0 33-23.5 56.5T360-160Zm240 0q-33 0-56.5-23.5T520-240q0-33 23.5-56.5T600-320q33 0 56.5 23.5T680-240q0 33-23.5 56.5T600-160ZM360-400q-33 0-56.5-23.5T280-480q0-33 23.5-56.5T360-560q33 0 56.5 23.5T440-480q0 33-23.5 56.5T360-400Zm240 0q-33 0-56.5-23.5T520-480q0-33 23.5-56.5T600-560q33 0 56.5 23.5T680-480q0 33-23.5 56.5T600-400ZM360-640q-33 0-56.5-23.5T280-720q0-33 23.5-56.5T360-800q33 0 56.5 23.5T440-720q0 33-23.5 56.5T360-640Zm240 0q-33 0-56.5-23.5T520-720q0-33 23.5-56.5T600-800q33 0 56.5 23.5T680-720q0 33-23.5 56.5T600-640Z"/></svg>';
          fileContainer.appendChild(dragIcon);

          $(fileContainer).attr('draggable', 'true');
          $(fileContainer).on('dragstart', (e) => {
            e.originalEvent.dataTransfer.setData('fileUrl', info.url);
            e.originalEvent.dataTransfer.setData('uniqueId', info.uniqueId);
            e.originalEvent.dataTransfer.setDragImage(imgPreview, imgPreview.width / 2, imgPreview.height / 2);
          });
          enableImagePreviewOnClick(fileIconContainer);
        } else {
          $(fileContainer).removeAttr('draggable');
        }
      } else {
        fileIconContainer = createFileIconContainer(info);
      }

      let fileInfoContainer = createFileInfoContainer(info);

      if (!isDragAndDropEnabled) {
        let removeBtn = document.createElement('div');
        removeBtn.classList.add('remove-selected-file');

        let removeBtnIconHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#C02223"><path d="m339-288 141-141 141 141 51-51-141-141 141-141-51-51-141 141-141-141-51 51 141 141-141 141 51 51ZM480-96q-79 0-149-30t-122.5-82.5Q156-261 126-331T96-480q0-80 30-149.5t82.5-122Q261-804 331-834t149-30q80 0 149.5 30t122 82.5Q804-699 834-629.5T864-480q0 79-30 149t-82.5 122.5Q699-156 629.5-126T480-96Z"/></svg>`;
        $(removeBtn).append(removeBtnIconHTML);
        $(removeBtn).attr('data-file-id', info.uniqueId).click(removeFileListener);
        $(fileContainer).append(removeBtn);
      }
      $(fileContainer).append(fileIconContainer, fileInfoContainer);

      selectedFilesContainer.append(fileContainer);
    });
    const pageContainers = $('#box-drag-container');
    pageContainers.off('dragover').on('dragover', (e) => {
      e.preventDefault();
    });

    pageContainers.off('drop').on('drop', (e) => {
      e.preventDefault();
      const fileUrl = e.originalEvent.dataTransfer.getData('fileUrl');

      if (fileUrl) {
        const existingImages = $(e.target).find(`img[src="${fileUrl}"]`);
        if (existingImages.length === 0) {
          DraggableUtils.createDraggableCanvasFromUrl(fileUrl);
        }
      }
      const overlayElement = chooser.querySelector('.drag-drop-overlay');
      if (overlayElement) {
        overlayElement.style.display = 'none';
      }
      hasDroppedImage = true;
    });

    showOrHideSelectedFilesContainer(files);
  }

  function showOrHideSelectedFilesContainer(files) {
    if (files && files.length > 0) {
      chooser.style.setProperty('--selected-files-display', 'flex');
    } else {
      chooser.style.setProperty('--selected-files-display', 'none');
    }
    const isDragAndDropEnabled =
      (window.location.pathname.includes('add-image') || window.location.pathname.includes('sign')) &&
      files.some((file) => file.type.startsWith('image/'));

    if (!isDragAndDropEnabled) return;

    const selectedFilesContainer = chooser.querySelector('.selected-files');

    let overlayElement = chooser.querySelector('.drag-drop-overlay');
    if (!overlayElement) {
      selectedFilesContainer.style.position = 'relative';
      overlayElement = document.createElement('div');
      overlayElement.classList.add('draggable-image-overlay');

      overlayElement.innerHTML = 'Drag images to add them to the page';
      selectedFilesContainer.appendChild(overlayElement);
    }
    if (hasDroppedImage) overlayElement.style.display = files && files.length > 0 ? 'flex' : 'none';

    selectedFilesContainer.addEventListener('mouseenter', () => {
      overlayElement.style.display = 'none';
    });

    selectedFilesContainer.addEventListener('mouseleave', () => {
      if (!hasDroppedImage) overlayElement.style.display = files && files.length > 0 ? 'flex' : 'none';
    });
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
  function enableImagePreviewOnClick(container) {
    const imagePreviewModal = document.getElementById('imagePreviewModal') || createImagePreviewModal();

    container.querySelectorAll('img').forEach((img) => {
      if (!img.hasPreviewListener) {
        img.addEventListener('mouseup', function () {
          const imgElement = imagePreviewModal.querySelector('img');
          imgElement.src = this.src;
          imagePreviewModal.style.display = 'flex';
        });
        img.hasPreviewListener = true;
      }
    });

    function createImagePreviewModal() {
      const modal = document.createElement('div');
      modal.id = 'imagePreviewModal';
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100vw';
      modal.style.height = '100vh';
      modal.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      modal.style.display = 'none';
      modal.style.justifyContent = 'center';
      modal.style.alignItems = 'center';
      modal.style.zIndex = '2000';

      const imgElement = document.createElement('img');
      imgElement.style.maxWidth = '90%';
      imgElement.style.maxHeight = '90%';

      modal.appendChild(imgElement);
      document.body.appendChild(modal);

      modal.addEventListener('click', () => {
        modal.style.display = 'none';
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
          modal.style.display = 'none';
        }
      });

      return modal;
    }
  }
}
