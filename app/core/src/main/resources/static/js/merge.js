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

document.getElementById("sortByNameBtn").addEventListener("click", async function () {
  if (currentSort.field === "name" && !currentSort.descending) {
    currentSort.descending = true;
    await sortFiles((a, b) => b.name.localeCompare(a.name));
  } else {
    currentSort.field = "name";
    currentSort.descending = false;
    await sortFiles((a, b) => a.name.localeCompare(b.name));
  }
});

document.getElementById("sortByDateBtn").addEventListener("click", async function () {
  if (currentSort.field === "lastModified" && !currentSort.descending) {
    currentSort.descending = true;
    await sortFiles((a, b) => b.lastModified - a.lastModified);
  } else {
    currentSort.field = "lastModified";
    currentSort.descending = false;
    await sortFiles((a, b) => a.lastModified - b.lastModified);
  }
});

async function sortFiles(comparator) {
  // Convert FileList to array and sort
  const sortedFilesArray = Array.from(document.getElementById("fileInput-input").files).sort(comparator);

  // Refresh displayed list (wait for it to complete since it's async)
  await displayFiles(sortedFilesArray);

  // Update the file input and fileOrder based on the current display order
  // This ensures consistency between display and file input
  updateFiles();
}

function updateFiles() {
  var dataTransfer = new DataTransfer();
  var liElements = document.querySelectorAll("#selectedFiles li");
  const files = document.getElementById("fileInput-input").files;

  console.log("updateFiles: found", liElements.length, "LI elements and", files.length, "files");

  for (var i = 0; i < liElements.length; i++) {
    var fileNameFromList = liElements[i].querySelector(".filename").innerText;
    var found = false;
    for (var j = 0; j < files.length; j++) {
      var file = files[j];
      if (file.name === fileNameFromList) {
        dataTransfer.items.add(file);
        found = true;
        break;
      }
    }
    if (!found) {
      console.warn("updateFiles: Could not find file:", fileNameFromList);
    }
  }

  document.getElementById("fileInput-input").files = dataTransfer.files;
  console.log("updateFiles: Updated file input with", dataTransfer.files.length, "files");

  // Also populate hidden fileOrder to preserve visible order
  const order = Array.from(liElements)
    .map((li) => li.querySelector(".filename").innerText)
    .join("\n");
  const orderInput = document.getElementById("fileOrder");
  if (orderInput) {
    orderInput.value = order;
    console.log("Updated fileOrder:", order);
  }
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
