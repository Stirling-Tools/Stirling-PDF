document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".custom-file-chooser").forEach(setupFileInput);
});

function setupFileInput(chooser) {
  const elementId = chooser.getAttribute("data-bs-element-id");
  const filesSelected = chooser.getAttribute("data-bs-files-selected");
  const pdfPrompt = chooser.getAttribute("data-bs-pdf-prompt");

  let allFiles = [];
  let overlay;
  let dragCounter = 0;

  const dragenterListener = function () {
    dragCounter++;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.top = 0;
      overlay.style.left = 0;
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.background = "rgba(0, 0, 0, 0.5)";
      overlay.style.color = "#fff";
      overlay.style.zIndex = "1000";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.pointerEvents = "none";
      overlay.innerHTML = "<p>Drop files anywhere to upload</p>";
      document.getElementById("content-wrap").appendChild(overlay);
    }
  };

  const dragleaveListener = function () {
    dragCounter--;
    if (dragCounter === 0) {
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
    }
  };

  const dropListener = function (e) {
    e.preventDefault();
    const dt = e.dataTransfer;
    const files = dt.files;

    //Do not Update allFiles array here to prevent duplication, the change event listener will take care of that
    const dataTransfer = new DataTransfer();
    for (let i = 0; i < files.length; i++) {
      dataTransfer.items.add(files[i]);
    }

    const fileInput = document.getElementById(elementId);
    fileInput.files = dataTransfer.files;

    if (overlay) {
      overlay.remove();
      overlay = null;
    }

    dragCounter = 0;

    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  };

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  document.body.addEventListener("dragenter", dragenterListener);
  document.body.addEventListener("dragleave", dragleaveListener);
  document.body.addEventListener("drop", dropListener);

  // When adding files
  $("#" + elementId).on("change", function (e) {
    // Get newly Added Files
    const newFiles = Array.from(e.target.files).map(file => {
      return {
        file: file,
        uniqueId: file.name + Date.now()// Assign a unique identifier to each file
      };
    });

    // Add new files to existing files
    allFiles = [...allFiles, ...newFiles];

    // Update the file input's files property
    const dataTransfer = new DataTransfer();
    allFiles.forEach((fileObj) => dataTransfer.items.add(fileObj.file));
    e.target.files = dataTransfer.files;

    handleFileInputChange(this);

    // Call the displayFiles function with the allFiles array
    displayFiles(allFiles)
    // Dispatch a custom event with the allFiles array
    var filesUpdated = new CustomEvent("filesUpdated", { detail: allFiles });
    document.dispatchEvent(filesUpdated);
  });

// Listen for event of file being removed and then filter it out of the allFiles array
  document.addEventListener("fileRemoved", function (e) {
    const fileId = e.detail;
    allFiles = allFiles.filter(fileObj => fileObj.uniqueId !== fileId); // Remove the file from the allFiles array using the unique identifier
    // Dispatch a custom event with the allFiles array
    var filesUpdated = new CustomEvent("filesUpdated", { detail: allFiles });
    document.dispatchEvent(filesUpdated);
  });

  function handleFileInputChange(inputElement) {
    const files = allFiles;
    const fileNames = files.map((f) => f.name);
    const selectedFilesContainer = $(inputElement).siblings(".selected-files");
    selectedFilesContainer.empty();
    fileNames.forEach((fileName) => {
      selectedFilesContainer.append("<div>" + fileName + "</div>");
    });
    if (fileNames.length === 1) {
      $(inputElement).siblings(".custom-file-label").addClass("selected").html(fileNames[0]);
    } else if (fileNames.length > 1) {
      $(inputElement)
        .siblings(".custom-file-label")
        .addClass("selected")
        .html(fileNames.length + " " + filesSelected);
    } else {
      $(inputElement).siblings(".custom-file-label").addClass("selected").html(pdfPrompt);
    }
  }
}
