const deleteAllCheckbox = document.querySelector('#deleteAll');
let inputs = document.querySelectorAll('input');
const customMetadataDiv = document.getElementById('customMetadata');
const otherMetadataEntriesDiv = document.getElementById('otherMetadataEntries');

deleteAllCheckbox.addEventListener('change', function (event) {
  inputs.forEach((input) => {
    // If it's the deleteAllCheckbox or any file input, skip
    if (input === deleteAllCheckbox || input.type === 'file') {
      return;
    }
    // Disable or enable based on the checkbox state
    input.disabled = deleteAllCheckbox.checked;
  });
});

const customModeCheckbox = document.getElementById('customModeCheckbox');
const addMetadataBtn = document.getElementById('addMetadataBtn');
const customMetadataFormContainer = document.getElementById('customMetadataEntries');
var count = 1;
const fileInput = document.querySelector('#fileInput-input');
const authorInput = document.querySelector('#author');
const creationDateInput = document.querySelector('#creationDate');
const creatorInput = document.querySelector('#creator');
const keywordsInput = document.querySelector('#keywords');
const modificationDateInput = document.querySelector('#modificationDate');
const producerInput = document.querySelector('#producer');
const subjectInput = document.querySelector('#subject');
const titleInput = document.querySelector('#title');
const trappedInput = document.querySelector('#trapped');
var lastPDFFileMeta = null;
var lastPDFFile = null;

fileInput.addEventListener('change', async function () {
  fileInput.addEventListener('file-input-change', async (e) => {
    const {allFiles} = e.detail;
    if (allFiles && allFiles.length > 0) {
      const file = allFiles[0];
      while (otherMetadataEntriesDiv.firstChild) {
        otherMetadataEntriesDiv.removeChild(otherMetadataEntriesDiv.firstChild);
      }
      while (customMetadataFormContainer.firstChild) {
        customMetadataFormContainer.removeChild(customMetadataFormContainer.firstChild);
      }
      var url = URL.createObjectURL(file);
      pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs-legacy/pdf.worker.mjs';
      const pdf = await pdfjsLib.getDocument(url).promise;
      const pdfMetadata = await pdf.getMetadata();
      lastPDFFile = pdfMetadata?.info;
      console.log(pdfMetadata);
      if (!pdfMetadata?.info?.Custom || pdfMetadata?.info?.Custom.size == 0) {
        customModeCheckbox.disabled = true;
        customModeCheckbox.checked = false;
      } else {
        customModeCheckbox.disabled = false;
      }
      authorInput.value = pdfMetadata?.info?.Author;
      creationDateInput.value = convertDateFormat(pdfMetadata?.info?.CreationDate);
      creatorInput.value = pdfMetadata?.info?.Creator;
      keywordsInput.value = pdfMetadata?.info?.Keywords;
      modificationDateInput.value = convertDateFormat(pdfMetadata?.info?.ModDate);
      producerInput.value = pdfMetadata?.info?.Producer;
      subjectInput.value = pdfMetadata?.info?.Subject;
      titleInput.value = pdfMetadata?.info?.Title;
      console.log(pdfMetadata?.info);
      const trappedValue = pdfMetadata?.info?.Trapped;
      // Get all options in the select element
      const options = trappedInput.options;
      // Loop through all options to find the one with a matching value
      for (let i = 0; i < options.length; i++) {
        if (options[i].value === trappedValue) {
          options[i].selected = true;
          break;
        }
      }
      addExtra();
    }
  });
});

addMetadataBtn.addEventListener('click', () => {
  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.placeholder = 'Key';
  keyInput.className = 'form-control';
  keyInput.name = `allRequestParams[customKey${count}]`;

  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.placeholder = 'Value';
  valueInput.className = 'form-control';
  valueInput.name = `allRequestParams[customValue${count}]`;
  count = count + 1;

  const formGroup = document.createElement('div');
  formGroup.className = 'mb-3';
  formGroup.appendChild(keyInput);
  formGroup.appendChild(valueInput);

  customMetadataFormContainer.appendChild(formGroup);
});
function convertDateFormat(dateTimeString) {
  if (!dateTimeString || dateTimeString.length < 17) {
    return dateTimeString;
  }

  const year = dateTimeString.substring(2, 6);
  const month = dateTimeString.substring(6, 8);
  const day = dateTimeString.substring(8, 10);
  const hour = dateTimeString.substring(10, 12);
  const minute = dateTimeString.substring(12, 14);
  const second = dateTimeString.substring(14, 16);

  return year + '/' + month + '/' + day + ' ' + hour + ':' + minute + ':' + second;
}

function addExtra() {
  const event = document.getElementById('customModeCheckbox');
  if (event.checked && lastPDFFile.Custom != null) {
    customMetadataDiv.style.display = 'block';
    for (const [key, value] of Object.entries(lastPDFFile.Custom)) {
      if (
        key === 'Author' ||
        key === 'CreationDate' ||
        key === 'Creator' ||
        key === 'Keywords' ||
        key === 'ModDate' ||
        key === 'Producer' ||
        key === 'Subject' ||
        key === 'Title' ||
        key === 'Trapped'
      ) {
        continue;
      }
      const entryDiv = document.createElement('div');
      entryDiv.className = 'mb-3';
      entryDiv.innerHTML = `<div class="mb-3"><label class="form-check-label" for="${key}">${key}:</label><input name="${key}" value="${value}" type="text" class="form-control" id="${key}"></div>`;
      otherMetadataEntriesDiv.appendChild(entryDiv);
    }
  } else {
    customMetadataDiv.style.display = 'none';
    while (otherMetadataEntriesDiv.firstChild) {
      otherMetadataEntriesDiv.removeChild(otherMetadataEntriesDiv.firstChild);
    }
  }
}

customModeCheckbox.addEventListener('change', (event) => {
  addExtra();
});
