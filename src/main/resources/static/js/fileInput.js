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

    for (let i = 0; i < files.length; i++) {
      allFiles.push(files[i]);
    }

    const dataTransfer = new DataTransfer();
    allFiles.forEach((file) => dataTransfer.items.add(file));

    const fileInput = document.getElementById(elementId);
    fileInput.files = dataTransfer.files;

    if (overlay) {
      overlay.remove();
      overlay = null;
    }

    dragCounter = 0;

    fileInput.dispatchEvent(new CustomEvent("change", { bubbles: true, detail: {source: 'drag-drop'} }));
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

  $("#" + elementId).on("change", function (e) {
    let element = e.target;
    const isDragAndDrop = e.detail?.source == 'drag-drop';
    
    if (element instanceof HTMLInputElement && element.hasAttribute("multiple")) {
        allFiles = isDragAndDrop ? allFiles : [...allFiles, ...element.files];
    } else {
        allFiles = isDragAndDrop ? allFiles : [element.files[0]];
    }

    if (!isDragAndDrop) {
        let dataTransfer = new DataTransfer();
        allFiles.forEach(file => dataTransfer.items.add(file));
        element.files = dataTransfer.files;
    }

    handleFileInputChange(this);
    this.dispatchEvent(new CustomEvent("file-input-change", { bubbles: true }));
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
  //Listen for event of file being removed and the filter it out of the allFiles array
  document.addEventListener("fileRemoved", function (e) {
    const fileName = e.detail;
    allFiles = allFiles.filter(file => file.name !== fileName);
  });
}
