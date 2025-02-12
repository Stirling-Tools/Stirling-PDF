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
    const blob = new Blob([modifiedPdfBytes], {type: 'application/pdf'});
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
    const {allFiles} = e.detail;
    if (allFiles && allFiles.length > 0) {
      const file = allFiles[0];
      originalFileName = file.name.replace(/\.[^/.]+$/, '');
      const pdfData = await file.arrayBuffer();
      pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs-legacy/pdf.worker.mjs';
      const pdfDoc = await pdfjsLib.getDocument({data: pdfData}).promise;
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
  addCustomSelect();
});

function addCustomSelect() {
  let customSelectContainers = document.querySelectorAll('#signFontSelection');

  customSelectContainers.forEach((customSelectElementContainer) => {
    let originalSelectElement = customSelectElementContainer.querySelector('select');
    let optionsCount = originalSelectElement.length;

    let selectedItem = createAndStyleSelectedItem(originalSelectElement);
    customSelectElementContainer.appendChild(selectedItem);

    let customSelectionsOptionsContainer = createCustomOptionsContainer();
    createAndAddCustomOptions(originalSelectElement, customSelectionsOptionsContainer, selectedItem);
    customSelectElementContainer.appendChild(customSelectionsOptionsContainer);

    selectedItem.addEventListener('click', function (e) {
      e.stopPropagation();
      closeAllSelect(this);
      this.nextSibling.classList.toggle('select-hide');
      this.classList.toggle('select-arrow-active');
    });

    function createAndAddCustomOptions(originalSelectElement, container, selectedItem) {
      for (let j = 0; j < optionsCount; j++) {
        let customOptionItem = createAndStyleCustomOption(originalSelectElement, j);

        customOptionItem.addEventListener('click', function () {
          onCustomOptionClick(originalSelectElement, selectedItem, container, this);
        });

        container.appendChild(customOptionItem);
      }
    }
  });

  function createCustomOptionsContainer() {
    let customSelectionsOptionsContainer = document.createElement('DIV');
    customSelectionsOptionsContainer.setAttribute('class', 'select-items select-hide');
    return customSelectionsOptionsContainer;
  }

  function createAndStyleSelectedItem(originalSelectElement) {
    let selectedItem = document.createElement('DIV');
    selectedItem.setAttribute('class', 'select-selected');
    selectedItem.innerHTML = originalSelectElement.options[originalSelectElement.selectedIndex].innerHTML;
    selectedItem.style.fontFamily = window.getComputedStyle(
      originalSelectElement.options[originalSelectElement.selectedIndex]
    ).fontFamily;
    return selectedItem;
  }

  function onCustomOptionClick(originalSelectElement, selectedItem, container, clickedOption) {
    let optionsCount = originalSelectElement.length;
    for (let i = 0; i < optionsCount; i++) {
      if (originalSelectElement.options[i].innerHTML == clickedOption.innerHTML) {
        originalSelectElement.selectedIndex = i;
        selectedItem.innerHTML = clickedOption.innerHTML;
        selectedItem.style.fontFamily = clickedOption.style.fontFamily;

        let previouslySelectedOption = container.getElementsByClassName('same-as-selected');
        if (previouslySelectedOption.length > 0) {
          previouslySelectedOption[0].classList.remove('same-as-selected');
        }

        clickedOption.classList.add('same-as-selected');
        break;
      }
    }
    selectedItem.click();
  }

  function createAndStyleCustomOption(originalSelectElement, index) {
    let customOptionItem = document.createElement('DIV');
    customOptionItem.innerHTML = originalSelectElement.options[index].innerHTML;
    customOptionItem.classList.add(originalSelectElement.options[index].className);
    customOptionItem.style.fontFamily = window.getComputedStyle(originalSelectElement.options[index]).fontFamily;

    if (index == originalSelectElement.selectedIndex) customOptionItem.classList.add('same-as-selected');
    return customOptionItem;
  }

  function closeAllSelect(element) {
    let allSelectedOptions = document.getElementsByClassName('select-selected');
    let allOptionsContainers = document.getElementsByClassName('select-items');

    for (let i = 0; i < allSelectedOptions.length; i++) {
      if (element !== allSelectedOptions[i]) {
        allSelectedOptions[i].classList.remove('select-arrow-active');
        allOptionsContainers[i].classList.add('select-hide');
      }
    }
  }

  document.addEventListener('click', closeAllSelect);
}

async function goToFirstOrLastPage(page) {
  if (page) {
    const lastPage = DraggableUtils.pdfDoc.numPages;
    await DraggableUtils.goToPage(lastPage - 1);
  } else {
    await DraggableUtils.goToPage(0);
  }
}
