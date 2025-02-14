window.goToFirstOrLastPage = goToFirstOrLastPage;

document.getElementById('download-pdf').addEventListener('click', async () => {
  const downloadButton = document.getElementById('download-pdf');
  const originalContent = downloadButton.innerHTML;

  downloadButton.disabled = true;
  downloadButton.innerHTML = `
    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
  `;

  try {
    const modifiedPdf = await DraggableUtils.getOverlaidPdfDocument();
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

async function goToFirstOrLastPage(page) {
  if (page) {
    const lastPage = DraggableUtils.pdfDoc.numPages;
    await DraggableUtils.goToPage(lastPage - 1);
  } else {
    await DraggableUtils.goToPage(0);
  }
}

function createForm(config, targetSelector) {
  const formContainer = document.createElement('div');
  config.fields.forEach(field => {
    const label = document.createElement('label');
    label.classList.add('form-check-label');
    label.setAttribute('for', field.id);
    label.textContent = field.label;

    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      input.classList.add('form-control');
      input.setAttribute('name', field.id);
      input.setAttribute('id', field.id);

      field.options.forEach(optionValue => {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue;
        input.appendChild(option);
      });
    } else if (field.type === 'color') {
      input = document.createElement('input');
      input.classList.add('palette');
      input.setAttribute('type', 'color');
      input.setAttribute('id', field.id);
      input.setAttribute('name', field.id);
      input.setAttribute('value', field.value || '#000000');

      const paletteContainer = document.createElement('button');
      paletteContainer.classList.add('colour-picker', 'btn-primary');
      paletteContainer.setAttribute('id', `${field.id}Container`);
      paletteContainer.setAttribute('th:title', '#{redact.colourPicker}');

      const paletteLabel = document.createElement('label');
      paletteLabel.setAttribute('id', `${field.id}Label`);
      paletteLabel.setAttribute('for', field.id);
      paletteLabel.classList.add('material-symbols-rounded', 'palette-color', 'text-center');
      paletteLabel.style.setProperty('--palette-color', field.value || '#000000');
      paletteLabel.textContent = 'palette';

      paletteLabel.appendChild(input);
      paletteContainer.appendChild(paletteLabel);
      formContainer.appendChild(label);
      formContainer.appendChild(paletteContainer);
      return;
    } else {
      input = document.createElement('input');
      input.classList.add('form-control');
      input.setAttribute('type', field.type);
      input.setAttribute('id', field.id);
      input.setAttribute('name', field.id);
      if (field.placeholder) input.setAttribute('placeholder', field.placeholder);
      if (field.value) input.setAttribute('value', field.value);
    }

    formContainer.appendChild(label);
    formContainer.appendChild(input);
  });

  const targetElement = document.querySelector(targetSelector);
  if (targetElement) {
    targetElement.appendChild(formContainer);
    setTimeout(() => attachDynamicListeners(config.fields), 0);
  } else {
    console.error("Target element not found: ", targetSelector);
  }
}

function generateUniqueId(type) {
  let counter = 1;
  let newId = `${type}-${counter}`;
  while (document.getElementById(newId)) {
    counter++;
    newId = `${type}-${counter}`;
  }
  return newId;
}

function validateUniqueId(id) {
  return !document.getElementById(id);
}

const textConfig = {
  type: 'text',
  width: '80px',
  height: '30px',
  fields: [
    { id: 'textId', label: 'Text ID', type: 'text', placeholder: 'Enter ID', value: generateUniqueId('text') },
    { id: 'textValue', label: 'Text Value', type: 'text', placeholder: 'Enter Value' },
    { id: 'textArtPalette', label: 'Text Color', type: 'color', value: '#000000' }
  ]
};
const checkboxConfig = {
  type: 'checkbox',
  width: '20px',
  height: '20px',
  fields: [
    { id: 'checkboxId', label: 'Check box ID', type: 'text', placeholder: 'Enter ID', value: generateUniqueId('checkbox') },
  ]
};
const dropdownConfig = {
  type: 'dropdown',
  width: '80px',
  height: '30px',
  fields: [
    { id: 'dropdownId', label: 'Dropdown ID', type: 'text', placeholder: 'Enter ID', value: generateUniqueId('dropdown') },
    { id: 'dropdownValues', label: 'Dropdown Options', type: 'text', placeholder: 'Comma-separated values' },
    { id: 'font', label: 'Font', type: 'select', options: ['Arial', 'Verdana', 'Times New Roman'] },
    { id: 'fontSize', label: 'Font Size', type: 'number', value: '12' },
    { id: 'backgroundPalette', label: 'Background Color', type: 'color', value: '#ffffff' },
    { id: 'textPalette', label: 'Text Color', type: 'color', value: '#000000' }
  ]
};
const optionListConfig = {
  type: 'optionList',
  width: '80px',
  height: '50px',
  fields: [
    { id: 'optionListId', label: 'Option List ID', type: 'text', placeholder: 'Enter ID', value: generateUniqueId('optionList') },
    { id: 'optionListValues', label: 'Option List Values', type: 'text', placeholder: 'Comma-separated values' },
    { id: 'optionListFontSize', label: 'Font Size', type: 'number', value: '12' },
    { id: 'optionListBackgroundPalette', label: 'Background Color', type: 'color', value: '#ffffff' },
    { id: 'optionListTextPalette', label: 'Text Color', type: 'color', value: '#000000' }
  ]
};

const radioButtonConfig = {
  type: 'radio',
  width: '20px',
  height: '20px',
  fields: [
    { id: 'radioId', label: 'Radio ID', type: 'text', placeholder: 'Enter ID', value: generateUniqueId('radio') },
  ]
};


const textBoxConfig = {
  type: 'textBox',
  width: '80px',
  height: '30px',
  fields: [
    { id: 'textBoxId', label: 'Text Box ID', type: 'text', placeholder: 'Enter ID', value: generateUniqueId('textBox') },
    { id: 'textBoxValue', label: 'Placeholder', type: 'text', placeholder: '' },
    { id: 'textBoxFontSize', label: 'Font Size', type: 'number', value: '12' },
    { id: 'textBoxBackgroundPalette', label: 'Background Color', type: 'color', value: '#ffffff' },
    { id: 'textBoxPalette', label: 'Text Color', type: 'color', value: '#000000' }
  ]
};

createForm(textConfig, '#textOptions');
createForm(checkboxConfig, '#checkBoxOptions');
createForm(dropdownConfig, '#dropdownOptions');
createForm(optionListConfig, '#optionListOptions');
createForm(radioButtonConfig, '#radioOptions');
createForm(textBoxConfig, '#textBoxOptions');


function attachDynamicListeners(fields) {
  fields.forEach(field => {
    document.addEventListener("change", function (event) {
      if (event.target && event.target.id === field.id) {
        if (field.type === 'color') {
          document.getElementById(`${field.id}Label`).style.setProperty('--palette-color', event.target.value);
        }
        if (window.latestId) {
          const targetElement = document.getElementById(window.latestId);
          if (field.type === 'color') {
            if (field.id.toLowerCase().includes('background')) {
              targetElement.style.background = event.target.value;
            } else {
              targetElement.style.color = event.target.value;
            }
          } else if (field.type === 'number') {
            targetElement.style.fontSize = event.target.value + "px";
          }
        }
      }
    });
  });
}

function addDraggableFromForm(config) {
  const id = document.getElementById(config.idField).value.trim();
  if (!id) {
    alert("Please enter a valid ID.");
    return;
  }
  if (!validateUniqueId(id)) {
    alert("ID must be unique. Please enter a different one.");
    return;
  }
  window.latestId = id;

  const element = document.createElement(config.htmlTag);
  element.setAttribute('id', id);
  element.setAttribute('name', id);
  element.setAttribute('type', config.type);
  element.classList.add('form-input')

  if (config.styles) {
    Object.keys(config.styles).forEach(style => {
      element.style[style] = config.styles[style];
    });
  }

  DraggableUtils.addDraggableElement(element, true);
}

const configs = [radioButtonConfig, textBoxConfig, textConfig, optionListConfig, checkboxConfig];
configs.forEach(config => {
  document.getElementById(`save-${config.type}`).addEventListener('click', function () {
    addDraggableFromForm({
      idField: `${config.type}Id`,
      htmlTag: config.type === 'textBox' || config.type === 'text' ? 'input' : config.type === 'radio' || config.type === 'checkbox' ? 'input' : 'div',
      type: config.type,
      styles: {
        width: config.width,
        height: config.height,
        fontSize: document.getElementById(`${config.type}FontSize`)?.value + 'px' || '12px',
        backgroundColor: document.getElementById(`${config.type}BackgroundPalette`)?.value || '#ffffff',
        color: document.getElementById(`${config.type}Palette`)?.value || '#000000'
      },
      options: config.fields.find(field => field.id.includes('Values'))?.value?.split(',').map(v => v.trim()) || []
    });
  });
});
document.getElementById('save-dropdown').addEventListener('click', function () {
  const values = document.getElementById('dropdownValues').value.split(',').map(v => v.trim());
  addDraggableFromForm({
    idField: 'dropdownId',
    htmlTag: 'select',
    styles: {
      width: '80px',
      height: '30px',
      fontSize: document.getElementById('fontSize').value + 'px',
      fontFamily: document.getElementById('font').value,
      backgroundColor: document.getElementById('optionListBackgroundPaletteLabel').style.getPropertyValue('--palette-color'),
      color: document.getElementById('optionListTextPaletteLabel').style.getPropertyValue('--palette-color'),
    },
    type: "dropdown",
    options: values
  });
});

document.getElementById('save-optionList').addEventListener('click', function () {
  const values = document.getElementById('optionListValues').value.split(',').map(v => v.trim());
  addDraggableFromForm({
    idField: 'optionListId',
    htmlTag: 'div',
    styles: {
      width: '80px',
      height: '30px',
      fontSize: document.getElementById('optionListFontSize').value + 'px',
      backgroundColor: document.getElementById('optionListBackgroundPaletteLabel').style.getPropertyValue('--palette-color'),
      color: document.getElementById('optionListTextPaletteLabel').style.getPropertyValue('--palette-color'),
      overflowY: 'scroll'
    },
    type: "optionList",
    options: values
  });
});
