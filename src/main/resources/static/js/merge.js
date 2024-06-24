let currentSort = {
  field: null,
  descending: false,
};
//New Array to keep track of unique id
let filesWithUniqueId = [];
let processedFiles = [];

document.getElementById("fileInput-input").addEventListener("change", function () {
  var files = Array.from(this.files).map(file => {
    return {
      file: file,
      uniqueId: file.name + Date.now()
    };
  });
  filesWithUniqueId = files;
  displayFiles(files);
});
//Get Files Updated Event from FileInput
document.addEventListener("filesUpdated", function (e) {
  filesWithUniqueId = e.detail;
  displayFiles(filesWithUniqueId);
});


function displayFiles(files) {
  const list = document.getElementById("selectedFiles");

  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }

  // Clear the processedFiles array
  processedFiles = [];

  for (let i = 0; i < files.length; i++) {
    const item = document.createElement("li");
    item.className = "list-group-item";
    item.dataset.id = files[i].uniqueId; // Assign the uniqueId to the list item
    const fileNameDiv = document.createElement("div");
    fileNameDiv.className = "filename";
    fileNameDiv.textContent = files[i].file.name;

    // Check for duplicates and add a warning if necessary
    const duplicateFiles = files.filter(file => file.file.name === files[i].file.name);
    if (duplicateFiles.length > 1) {
      const warning = document.createElement("span");
      warning.className = "duplicate-warning";
      // Retrieve the translated message from the data attribute
      warning.textContent =  " "+document.getElementById("duplicateWarningMessage").dataset.duplicateWarning;
      fileNameDiv.appendChild(warning);
    }


    item.innerHTML = `
            <div class="d-flex justify-content-between align-items-center w-100">
                ${fileNameDiv.outerHTML}
                <div class="arrows d-flex">
                    <button class="btn btn-secondary move-up"><span>&uarr;</span></button>
                    <button class="btn btn-secondary move-down"><span>&darr;</span></button>
                    <button class="btn btn-danger remove-file"><span>&times;</span></button>
                </div>
            </div>
        `;
    list.appendChild(item);
  }
  attachMoveButtons();
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
    // When the delete button is clicked
    removeButtons[i].addEventListener("click", function (event) {
      event.preventDefault();
      var parent = this.closest(".list-group-item");
      var fileId = parent.dataset.id; // Get the unique identifier of the file to be deleted
      parent.remove();
      // Remove the file from the filesWithUniqueId array
      filesWithUniqueId = filesWithUniqueId.filter(fileObj => fileObj.uniqueId !== fileId);
      updateFiles();
      // Dispatch a custom event with the unique identifier of the file to be deleted
      var fileRemoved = new CustomEvent("fileRemoved", { detail: fileId });
      document.dispatchEvent(fileRemoved);
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
  // Sort the filesWithUniqueId array
  const sortedFilesArray = filesWithUniqueId.sort((a, b) => comparator(a.file, b.file));

  // Refresh displayed list
  displayFiles(sortedFilesArray);

  // Update the files property
  const dataTransfer = new DataTransfer();
  sortedFilesArray.forEach((fileObj) => dataTransfer.items.add(fileObj.file));
  document.getElementById("fileInput-input").files = dataTransfer.files;
}


function updateFiles() {
  var dataTransfer = new DataTransfer();
  var liElements = document.querySelectorAll("#selectedFiles li");

  for (var i = 0; i < liElements.length; i++) {
    var fileIdFromList = liElements[i].dataset.id; // Get the unique identifier from the list item
    for (var j = 0; j < filesWithUniqueId.length; j++) {
      var fileObj = filesWithUniqueId[j];
      if (fileObj.uniqueId === fileIdFromList) {
        dataTransfer.items.add(fileObj.file);
        break;
      }
    }
  }
  document.getElementById("fileInput-input").files = dataTransfer.files;
}