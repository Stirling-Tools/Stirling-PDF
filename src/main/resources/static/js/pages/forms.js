window.goToFirstOrLastPage = goToFirstOrLastPage;


const textConfig = {
  type: 'text',
  width: '80px',
  height: '30px',
  fields: [
    { id: 'id', label: 'Text ID', type: 'text', placeholder: 'Enter ID' },
    { id: 'value', label: 'Text Value', type: 'text', placeholder: 'Enter Value' },
    { id: 'color', label: 'Text Color', type: 'color', value: '#000000' }
  ]
};
const checkboxConfig = {
  type: 'checkbox',
  width: '20px',
  height: '20px',
  fields: [
    { id: 'id', label: 'Check box ID', type: 'text', placeholder: 'Enter ID' },
  ]
};
const dropdownConfig = {
  type: 'dropdown',
  width: '80px',
  height: '30px',
  fields: [
    { id: 'id', label: 'Dropdown ID', type: 'text', placeholder: 'Enter ID' },
    { id: 'dropdownValues', label: 'Dropdown Options', type: 'text', placeholder: 'Comma-separated values' },
    { id: 'font', label: 'Font', type: 'select', options: ['Courier', 'Helvetica', 'TimesRoman'] },
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
    { id: 'id', label: 'Option List ID', type: 'text', placeholder: 'Enter ID' },
    { id: 'optionListValues', label: 'Option List Values', type: 'text', placeholder: 'Comma-separated values' },
    { id: 'fontSize', label: 'Font Size', type: 'number', value: '12' },
    { id: 'backgroundPalette', label: 'Background Color', type: 'color', value: '#ffffff' },
    { id: 'textPalette', label: 'Text Color', type: 'color', value: '#000000' }
  ]
};

const radioButtonConfig = {
  type: 'radio',
  width: '20px',
  height: '20px',
  fields: [
    { id: 'id', label: 'Radio ID', type: 'text', placeholder: 'Enter ID' },
  ]
};
const textBoxConfig = {
  type: 'textBox',
  width: '80px',
  height: '30px',
  fields: [
    { id: 'id', label: 'Text Box ID', type: 'text', placeholder: 'Enter ID' },
    { id: 'value', label: 'Placeholder', type: 'text', placeholder: '' },
    { id: 'fontSize', label: 'Font Size', type: 'number', value: '12' },
    { id: 'backgroundPalette', label: 'Background Color', type: 'color', value: '#ffffff' },
    { id: 'Palette', label: 'Text Color', type: 'color', value: '#000000' }
  ]
};

const configMap = {
  radio: radioButtonConfig,
  textBox: textBoxConfig,
  text: textConfig,
  checkbox: checkboxConfig,
  dropdown: dropdownConfig,
  optionList: optionListConfig
};

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

window.createForm = (configString) => {
  const config = configMap[configString];
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
      // Create label
      const label = document.createElement('label');
      label.classList.add('form-check-label');
      label.setAttribute('for', field.id);
      label.textContent = field.label;

      // Create color input
      const input = document.createElement('input');
      input.classList.add('palette');
      input.setAttribute('type', 'color');
      input.setAttribute('id', field.id);
      input.setAttribute('name', field.id);
      input.setAttribute('value', field.value || '#000000');

      // Create color picker button
      const paletteContainer = document.createElement('button');
      paletteContainer.classList.add('colour-picker', 'btn-primary');
      paletteContainer.setAttribute('id', `${field.id}Container`);
      paletteContainer.setAttribute('th:title', '#{redact.colourPicker}');

      // Create label for color picker
      const paletteLabel = document.createElement('label');
      paletteLabel.setAttribute('id', `${field.id}Label`);
      paletteLabel.setAttribute('for', field.id);
      paletteLabel.classList.add('material-symbols-rounded', 'palette-color', 'text-center');
      paletteLabel.style.setProperty('--palette-color', field.value || '#000000');
      paletteLabel.textContent = 'palette';

      // Append input to label
      paletteLabel.appendChild(input);
      paletteContainer.appendChild(paletteLabel);

      // Find or create the color group flex container
      let colorGroup = formContainer.querySelector('.color-group');
      if (!colorGroup) {
        colorGroup = document.createElement('div');
        colorGroup.classList.add('color-group');
        colorGroup.style.display = 'flex';
        colorGroup.style.gap = '10px'; // Space between color inputs
        colorGroup.style.marginTop = '10px'; // Space above first color input
        formContainer.appendChild(colorGroup);
      }
      colorGroup.appendChild(label);
      colorGroup.appendChild(paletteContainer);

      return;
    }
    else {
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

  const targetElement = document.querySelector('#formOptions');
  if (targetElement) {
    targetElement.appendChild(formContainer);
    setTimeout(() => attachDynamicListeners(config.fields), 0);
  } else {
    console.error("Target element not found: formOptions");
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
              targetElement.setAttribute('backgroundColor', event.target.value)
            } else {
              targetElement.style.color = event.target.value;
              targetElement.setAttribute('textColor', event.target.value)
            }
          } else if (field.id === 'fontSize') {
            targetElement.style.fontSize = event.target.value + "px";
          } else if (field.id === 'font') {
            targetElement.style.fontFamily = event.target.value;
          } else if (field.id === 'value') {
            targetElement.value = event.target.value;
          } else if (field.id === 'id') {
            targetElement.id = event.target.value;
            targetElement.name = event.target.value;
          } else if (field.id === 'dropdownValues') {
            while (targetElement?.firstChild) {
              targetElement.removeChild(targetElement.firstChild);
            }
            const values = event.target.value.split(',').map(v => v.trim());
            values.forEach(value => {
              const option = document.createElement("option");
              option.value = value;
              option.textContent = value;
              targetElement.appendChild(option);
            });
            targetElement.setAttribute("data-value", values)
          }
        }
      }
    });
  });
}

function addDraggableFromForm(config) {
  const id = document.getElementById(config.idField)?.value.trim() || generateUniqueId(config.type);
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
  element.style.fontFamily = 'Helvetica'
  element.style.fontSize = '12';
  element.classList.add('form-input')

  if (config.styles) {
    Object.keys(config.styles).forEach(style => {
      element.style[style] = config.styles[style];
    });
  }

  DraggableUtils.addDraggableElement(element, true);
}

document.getElementById('save').addEventListener('click', function () {
  const formType = document.getElementById('formTypeSelector')?.value;
  if (!formType || !configMap[formType]) {
    alert("Please select a valid form type.");
    return;
  }

  const config = configMap[formType];
  const idField = `${config.type}Id`;
  const id = document.getElementById(idField)?.value.trim() || generateUniqueId(formType);

  if (!id) {
    alert("Please enter a valid ID.");
    return;
  }

  const styles = {
    width: config.width || '80px',
    height: config.height || '30px',
    fontSize: document.getElementById(`${config.type}FontSize`)?.value + 'px' || '12px',
    backgroundColor: document.getElementById(`${config.type}BackgroundPalette`)?.value || '#ffffff',
    color: document.getElementById(`${config.type}Palette`)?.value || '#000000'
  };

  let options = [];
  const valuesField = document.getElementById(`${config.type}Values`);
  if (valuesField) {
    options = valuesField.value.split(',').map(v => v.trim());
  }

  addDraggableFromForm({
    idField,
    htmlTag: config.type === 'textBox' || config.type === 'text' ? 'input' :
      config.type === 'radio' || config.type === 'checkbox' ? 'input' :
        config.type === 'dropdown' ? 'select' : 'div',
    type: config.type,
    styles,
    options
  });
});


document.addEventListener("DOMContentLoaded", function () {
  const addNewFormContainer = document.getElementById("addNewForm");
  const formOptionsContainer = document.getElementById("formOptions");
  function createDropdown() {
    const dropdown = document.createElement("select");
    dropdown.classList.add("form-control");
    dropdown.id = "formTypeSelector";
    const defaultOption = document.createElement("option");
    defaultOption.textContent = "Select Form Type";
    defaultOption.value = "";
    dropdown.appendChild(defaultOption);

    Object.keys(configMap).forEach(type => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
      dropdown.appendChild(option);
    });

    addNewFormContainer.prepend(dropdown);
    dropdown.addEventListener('change', async (event) => {
      // populateEditForm(event.target.value, { id: generateUniqueId(event.target.value) });
    })
  }

  window.populateEditForm = (type, existingValues) => {
    formOptionsContainer.innerHTML = "";
    createForm(type, "#formOptions");

    Object.keys(existingValues).forEach(key => {
      const input = document.getElementById(key);
      if (input) {
        input.value = existingValues[key];
        if (input.type === "color") {
          document.getElementById(`${input.id}Label`).style.setProperty('--palette-color', existingValues[key]);
        }
      }

    });

  }

  createDropdown();
});
