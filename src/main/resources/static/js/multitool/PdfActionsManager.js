class PdfActionsManager {
  pageDirection;
  pagesContainer;

  constructor(id) {
    this.pagesContainer = document.getElementById(id);
    this.pageDirection = document.documentElement.getAttribute("dir");

    var styleElement = document.createElement("link");
    styleElement.rel = "stylesheet";
    styleElement.href = "css/pdfActions.css";

    document.head.appendChild(styleElement);
  }

  getPageContainer(element) {
    var container = element;
    while (!container.classList.contains("page-container")) {
      container = container.parentNode;
    }
    return container;
  }

  moveUpButtonCallback(e) {
    var imgContainer = this.getPageContainer(e.target);

    const sibling = imgContainer.previousSibling;
    if (sibling) {
      this.movePageTo(imgContainer, sibling, true);
    }
  }

  moveDownButtonCallback(e) {
    var imgContainer = this.getPageContainer(e.target);
    const sibling = imgContainer.nextSibling;
    if (sibling) {
      this.movePageTo(imgContainer, sibling.nextSibling, true);
    }
  }

  rotateCCWButtonCallback(e) {
    var imgContainer = this.getPageContainer(e.target);
    const img = imgContainer.querySelector("img");

    this.rotateElement(img, -90);
  }

  rotateCWButtonCallback(e) {
    var imgContainer = this.getPageContainer(e.target);
    const img = imgContainer.querySelector("img");

    this.rotateElement(img, 90);
  }

  deletePageButtonCallback(e) {
    var imgContainer = this.getPageContainer(e.target);
    this.pagesContainer.removeChild(imgContainer);
    if (this.pagesContainer.childElementCount === 0) {
      const filenameInput = document.getElementById("filename-input");
      const filenameParagraph = document.getElementById("filename");
      const downloadBtn = document.getElementById("export-button");

      filenameInput.disabled = true;
      filenameInput.value = "";
      filenameParagraph.innerText = "";

      downloadBtn.disabled = true;
    }
  }

  insertFileButtonCallback(e) {
    var imgContainer = this.getPageContainer(e.target);
    this.addFiles(imgContainer);
  }

  splitFileButtonCallback(e) {
    var imgContainer = this.getPageContainer(e.target);
    imgContainer.classList.toggle("split-before");
  }

  setActions({ movePageTo, addFiles, rotateElement }) {
    this.movePageTo = movePageTo;
    this.addFiles = addFiles;
    this.rotateElement = rotateElement;

    this.moveUpButtonCallback = this.moveUpButtonCallback.bind(this);
    this.moveDownButtonCallback = this.moveDownButtonCallback.bind(this);
    this.rotateCCWButtonCallback = this.rotateCCWButtonCallback.bind(this);
    this.rotateCWButtonCallback = this.rotateCWButtonCallback.bind(this);
    this.deletePageButtonCallback = this.deletePageButtonCallback.bind(this);
    this.insertFileButtonCallback = this.insertFileButtonCallback.bind(this);
    this.splitFileButtonCallback = this.splitFileButtonCallback.bind(this);
  }

  adapt(div) {
    div.classList.add("pdf-actions_container");
    const leftDirection = this.pageDirection === "rtl" ? "right" : "left";
    const rightDirection = this.pageDirection === "rtl" ? "left" : "right";
    const buttonContainer = document.createElement("div");

    buttonContainer.classList.add("btn-group", "pdf-actions_button-container", "hide-on-drag");

    const moveUp = document.createElement("button");
    moveUp.classList.add("pdf-actions_move-left-button", "btn", "btn-secondary");
    moveUp.innerHTML = `<span class="material-symbols-rounded">arrow_${leftDirection}_alt</span>`;
    moveUp.onclick = this.moveUpButtonCallback;
    buttonContainer.appendChild(moveUp);

    const moveDown = document.createElement("button");
    moveDown.classList.add("pdf-actions_move-right-button", "btn", "btn-secondary");
    moveDown.innerHTML = `<span class="material-symbols-rounded">arrow_${rightDirection}_alt</span>`;
    moveDown.onclick = this.moveDownButtonCallback;
    buttonContainer.appendChild(moveDown);

    const rotateCCW = document.createElement("button");
    rotateCCW.classList.add("btn", "btn-secondary");
    rotateCCW.innerHTML = `<span class="material-symbols-rounded">rotate_left</span>`;
    rotateCCW.onclick = this.rotateCCWButtonCallback;
    buttonContainer.appendChild(rotateCCW);

    const rotateCW = document.createElement("button");
    rotateCW.classList.add("btn", "btn-secondary");
    rotateCW.innerHTML = `<span class="material-symbols-rounded">rotate_right</span>`;
    rotateCW.onclick = this.rotateCWButtonCallback;
    buttonContainer.appendChild(rotateCW);

    const deletePage = document.createElement("button");
    deletePage.classList.add("btn", "btn-danger");
    deletePage.innerHTML = `<span class="material-symbols-rounded">delete</span>`;
    deletePage.onclick = this.deletePageButtonCallback;
    buttonContainer.appendChild(deletePage);

    div.appendChild(buttonContainer);

    const insertFileButtonContainer = document.createElement("div");

    insertFileButtonContainer.classList.add(
      "pdf-actions_insert-file-button-container",
      leftDirection,
      `align-center-${leftDirection}`,
    );

    const insertFileButton = document.createElement("button");
    insertFileButton.classList.add("btn", "btn-primary", "pdf-actions_insert-file-button");
    insertFileButton.innerHTML = `<span class="material-symbols-rounded">add</span>`;
    insertFileButton.onclick = this.insertFileButtonCallback;
    insertFileButtonContainer.appendChild(insertFileButton);

    const splitFileButton = document.createElement("button");
    splitFileButton.classList.add("btn", "btn-primary", "pdf-actions_split-file-button");
    splitFileButton.innerHTML = `<span class="material-symbols-rounded">cut</span>`;
    splitFileButton.onclick = this.splitFileButtonCallback;
    insertFileButtonContainer.appendChild(splitFileButton);

    div.appendChild(insertFileButtonContainer);

    // add this button to every element, but only show it on the last one :D
    const insertFileButtonRightContainer = document.createElement("div");
    insertFileButtonRightContainer.classList.add(
      "pdf-actions_insert-file-button-container",
      rightDirection,
      `align-center-${rightDirection}`,
    );

    const insertFileButtonRight = document.createElement("button");
    insertFileButtonRight.classList.add("btn", "btn-primary", "pdf-actions_insert-file-button");
    insertFileButtonRight.innerHTML = `<span class="material-symbols-rounded">add</span>`;
    insertFileButtonRight.onclick = () => addFiles();
    insertFileButtonRightContainer.appendChild(insertFileButtonRight);

    div.appendChild(insertFileButtonRightContainer);

    const adaptPageNumber = (pageNumber, div) => {
      const pageNumberElement = document.createElement("span");
      pageNumberElement.classList.add("page-number");
      pageNumberElement.textContent = pageNumber;

      div.insertBefore(pageNumberElement, div.firstChild);
    };

    div.addEventListener("mouseenter", () => {
      const pageNumber = Array.from(div.parentNode.children).indexOf(div) + 1;
      adaptPageNumber(pageNumber, div);
    });

    div.addEventListener("mouseleave", () => {
      const pageNumberElement = div.querySelector(".page-number");
      if (pageNumberElement) {
        div.removeChild(pageNumberElement);
      }
    });

    return div;
  }
}

export default PdfActionsManager;
