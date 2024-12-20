document.addEventListener("DOMContentLoaded", () => {
  const elementsContainer = document.getElementById("elementsContainer");
  const slidersContainer = document.getElementById("sliders-container");
  const infoContainer = document.getElementById("infoContainer");
  const signaturesResults = document.getElementById("signatures-results");
  const signaturesList = document.getElementById("signatures-list");
  const canvasesContainer = document.getElementById("canvasesContainer");

  const selectedFiles = document.getElementsByClassName("selected-files");
  const fileInput = document.getElementById("fileInput-input");

  if (!fileInput || !elementsContainer || selectedFiles.length === 0) return;

  function toggleVisibility(element, show) {
    if (element) {
      element.style.display = show ? "block" : "none";
    }
  }

  const observer = new MutationObserver((mutationsList) => {
    mutationsList.forEach((mutation) => {
      if (mutation.type === "childList") {
        const hasChildren = selectedFiles[0]?.childNodes.length > 0;

        toggleVisibility(elementsContainer, hasChildren);
        toggleVisibility(slidersContainer, hasChildren);
        toggleVisibility(infoContainer, hasChildren);
        toggleVisibility(canvasesContainer, hasChildren);

        if (!hasChildren) {
          toggleVisibility(signaturesResults, false);
          if (signaturesList) {
            signaturesList.textContent = "";
          }
        }
      }
    });
  });

  observer.observe(selectedFiles[0], { childList: true });
});
