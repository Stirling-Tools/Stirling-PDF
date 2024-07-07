document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".custom-file-chooser").forEach(setupFileInput);
});

function setupFileInput(chooser) {
  const elementId = chooser.getAttribute("data-bs-element-id");
  const filesSelected = chooser.getAttribute("data-bs-files-selected");
  const pdfPrompt = chooser.getAttribute("data-bs-pdf-prompt");
  const button = document.querySelector('.file-chooser-button');
  const addFilesText = button.getAttribute('data-add-files-text'); // Thymeleaf property for "Add Files" text
  const noFileText = button.getAttribute('data-no-file-text'); // Thymeleaf property for "No File Selected" text

  if (button) {
    button.innerHTML = `<span class="button-label">${addFilesText}</span><span class="file-name-right">${noFileText}</span>`;
  }

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

  $("#" + elementId).on("change", function (e) {
    allFiles = Array.from(e.target.files);
    handleFileInputChange(this);
  });

  function handleFileInputChange(inputElement) {
    const files = allFiles;
    const fileNames = files.map((f) => f.name);
    const selectedFilesContainer = $(inputElement).siblings(".selected-files");
    selectedFilesContainer.empty();
    fileNames.forEach((fileName) => {
      selectedFilesContainer.append("<div>" + fileName + "</div>");
    });
    // Retrieve the button and its data attributes for dynamic texts
    const button = document.querySelector('.file-chooser-button');
    const addFilesText = button.getAttribute('data-add-files-text'); // Thymeleaf property for "Add Files" text
    const noFileText = button.getAttribute('data-no-file-text'); // Thymeleaf property for "No File Selected" text

    // Update the button's inner HTML based on file selection
    if (files.length > 0) {
      button.innerHTML = `<span class="button-label">${addFilesText}</span><span class="file-name-right">${fileNames.join(', ')}</span>`;
    } else {
      button.innerHTML = `<span class="button-label" >${addFilesText}</span><span class="file-name-right">${noFileText}</span>`;
    }
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
