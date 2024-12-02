let currentSort = {
  field: null,
  descending: false,
};

document.getElementById("fileInput-input").addEventListener("file-input-change", function () {
  var files = this.files;
  displayFiles(files);
});

/**
 * @param {FileList} files
 */
async function displayFiles(files) {
  const list = document.getElementById("selectedFiles");

  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }

  for (let i = 0; i < files.length; i++) {
    const pageCount = await getPDFPageCount(files[i]);
    const pageLabel = pageCount === 1 ? pageTranslation : pagesTranslation;

    // Create list item
    const item = document.createElement("li");
    item.className = "list-group-item";

    // Create filename div and set textContent to sanitize
    const fileNameDiv = document.createElement("div");
    fileNameDiv.className = "filename";
    fileNameDiv.setAttribute("data-file-id", files[i].uniqueId);
    fileNameDiv.textContent = files[i].name;

    // Create page info div and set textContent to sanitize
    const pageInfoDiv = document.createElement("div");
    pageInfoDiv.className = "page-info";
    const pageCountSpan = document.createElement("span");
    pageCountSpan.className = "page-count";
    pageCountSpan.textContent = `${pageCount} ${pageLabel}`;
    pageInfoDiv.appendChild(pageCountSpan);

    // Create arrows div with buttons
    const arrowsDiv = document.createElement("div");
    arrowsDiv.className = "arrows d-flex";

    const moveUpButton = document.createElement("button");
    moveUpButton.className = "btn btn-secondary move-up";
    moveUpButton.innerHTML = "<span>&uarr;</span>";

    const moveDownButton = document.createElement("button");
    moveDownButton.className = "btn btn-secondary move-down";
    moveDownButton.innerHTML = "<span>&darr;</span>";

    const removeButton = document.createElement("button");
    removeButton.className = "btn btn-danger remove-file";
    removeButton.innerHTML = "<span>&times;</span>";

    arrowsDiv.append(moveUpButton, moveDownButton, removeButton);

    // Append elements to item and then to list
    const itemContainer = document.createElement("div");
    itemContainer.className = "d-flex justify-content-between align-items-center w-100";
    itemContainer.append(fileNameDiv, pageInfoDiv, arrowsDiv);

    item.appendChild(itemContainer);
    list.appendChild(item);
  }

  attachMoveButtons();
}


async function getPDFPageCount(file) {
  const blobUrl = URL.createObjectURL(file);
  const pdf = await pdfjsLib.getDocument(blobUrl).promise;
  URL.revokeObjectURL(blobUrl);
  return pdf.numPages;
}

function attachMoveButtons() {
  var moveUpButtons = document.querySelectorAll(".move-up");
  for (var i = 0; i < moveUpButtons.length; i++) {
    moveUpButtons[i].addEventListener("click", function (event) {
      event.preventDefault();
      var parent = this.closest(".list-group-item");
      var grandParent = parent.parentNode;
      if (parent.previousElementSibling) {
        grandParent.insertBefore(parent, parent.previousElementSibling);
        updateFiles();
      }
    });
  }

  var moveDownButtons = document.querySelectorAll(".move-down");
  for (var i = 0; i < moveDownButtons.length; i++) {
    moveDownButtons[i].addEventListener("click", function (event) {
      event.preventDefault();
      var parent = this.closest(".list-group-item");
      var grandParent = parent.parentNode;
      if (parent.nextElementSibling) {
        grandParent.insertBefore(parent.nextElementSibling, parent);
        updateFiles();
      }
    });
  }

  var removeButtons = document.querySelectorAll(".remove-file");
  for (var i = 0; i < removeButtons.length; i++) {
    removeButtons[i].addEventListener("click", function (event) {
      event.preventDefault();
      var parent = this.closest(".list-group-item");
      //Get name of removed file
      let filenameNode = parent.querySelector(".filename");
      var fileName = filenameNode.innerText;
      const fileId = filenameNode.getAttribute("data-file-id");
      parent.remove();
      updateFiles();
      //Dispatch a custom event with the name of the removed file
      var event = new CustomEvent("fileRemoved", { detail: fileId });
      document.dispatchEvent(event);
    });
  }
}

document.getElementById("sortByNameBtn").addEventListener("click", function () {
  if (currentSort.field === "name" && !currentSort.descending) {
    currentSort.descending = true;
    sortFiles((a, b) => b.name.localeCompare(a.name));
  } else {
    currentSort.field = "name";
    currentSort.descending = false;
    sortFiles((a, b) => a.name.localeCompare(b.name));
  }
});

document.getElementById("sortByDateBtn").addEventListener("click", function () {
  if (currentSort.field === "lastModified" && !currentSort.descending) {
    currentSort.descending = true;
    sortFiles((a, b) => b.lastModified - a.lastModified);
  } else {
    currentSort.field = "lastModified";
    currentSort.descending = false;
    sortFiles((a, b) => a.lastModified - b.lastModified);
  }
});

function sortFiles(comparator) {
  // Convert FileList to array and sort
  const sortedFilesArray = Array.from(document.getElementById("fileInput-input").files).sort(comparator);

  // Refresh displayed list
  displayFiles(sortedFilesArray);

  // Update the files property
  const dataTransfer = new DataTransfer();
  sortedFilesArray.forEach((file) => dataTransfer.items.add(file));
  document.getElementById("fileInput-input").files = dataTransfer.files;
}

function updateFiles() {
  var dataTransfer = new DataTransfer();
  var liElements = document.querySelectorAll("#selectedFiles li");
  const files = document.getElementById("fileInput-input").files;

  for (var i = 0; i < liElements.length; i++) {
    var fileNameFromList = liElements[i].querySelector(".filename").innerText;
    var fileFromFiles;
    for (var j = 0; j < files.length; j++) {
      var file = files[j];
      if (file.name === fileNameFromList) {
        dataTransfer.items.add(file);
        break;
      }
    }
  }
  document.getElementById("fileInput-input").files = dataTransfer.files;
}

document.querySelector("#resetFileInputBtn").addEventListener("click", ()=>{
  let formElement = document.querySelector("#fileInput-input");
    formElement.value = '';
    clearLiElements();
    updateFiles();

});

function clearLiElements(){
  let listGroupItemNodeList = document.querySelectorAll(".list-group-item");
  for (let i = 0; i < listGroupItemNodeList.length; i++) {
    listGroupItemNodeList[i].remove();
    };
  }
