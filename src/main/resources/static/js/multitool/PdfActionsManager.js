import { DeletePageCommand } from "./commands/delete-page.js";
import { SelectPageCommand } from "./commands/select.js";
import { SplitFileCommand } from "./commands/split.js";
import { UndoManager } from "./UndoManager.js";

class PdfActionsManager {
  pageDirection;
  pagesContainer;
  static selectedPages = []; // Static property shared across all instances
  undoManager;

  constructor(id, undoManager) {
    this.pagesContainer = document.getElementById(id);
    this.pageDirection = document.documentElement.getAttribute("dir");

    this.undoManager = undoManager || new UndoManager();

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
      let movePageCommand = this.movePageTo(imgContainer, sibling, true, true);
      this._pushUndoClearRedo(movePageCommand);
    }
  }

  moveDownButtonCallback(e) {
    var imgContainer = this.getPageContainer(e.target);
    const sibling = imgContainer.nextSibling;
    if (sibling) {
      let movePageCommand = this.movePageTo(
        imgContainer,
        sibling.nextSibling,
        true
      );
      this._pushUndoClearRedo(movePageCommand);
    }
  }

  rotateCCWButtonCallback(e) {
    var imgContainer = this.getPageContainer(e.target);
    const img = imgContainer.querySelector("img");

    let rotateCommand = this.rotateElement(img, -90);
    this._pushUndoClearRedo(rotateCommand);
  }

  rotateCWButtonCallback(e) {
    var imgContainer = this.getPageContainer(e.target);
    const img = imgContainer.querySelector("img");

    let rotateCommand = this.rotateElement(img, 90);
    this._pushUndoClearRedo(rotateCommand);
  }

  deletePageButtonCallback(e) {
    let imgContainer = this.getPageContainer(e.target);
    let deletePageCommand = new DeletePageCommand(
      imgContainer,
      this.pagesContainer
    );
    deletePageCommand.execute();

    this._pushUndoClearRedo(deletePageCommand);
  }

  insertFileButtonCallback(e) {
    var imgContainer = this.getPageContainer(e.target);
    this.addFiles(imgContainer);
  }

  insertFileBlankButtonCallback(e) {
    var imgContainer = this.getPageContainer(e.target);
    this.addFiles(imgContainer, true);
  }

  splitFileButtonCallback(e) {
    var imgContainer = this.getPageContainer(e.target);

    let splitFileCommand = new SplitFileCommand(imgContainer, "split-before");
    splitFileCommand.execute();

    this._pushUndoClearRedo(splitFileCommand);
  }

  _pushUndoClearRedo(command) {
    this.undoManager.pushUndoClearRedo(command);
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
    this.insertFileBlankButtonCallback = this.insertFileBlankButtonCallback.bind(this);
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
    moveUp.innerHTML = `<span class="material-symbols-rounded">arrow_${leftDirection}_alt</span><span class="btn-tooltip">${window.translations.moveLeft}</span>`;
    moveUp.onclick = this.moveUpButtonCallback;
    buttonContainer.appendChild(moveUp);

    const moveDown = document.createElement("button");
    moveDown.classList.add("pdf-actions_move-right-button", "btn", "btn-secondary");
    moveDown.innerHTML = `<span class="material-symbols-rounded">arrow_${rightDirection}_alt</span><span class="btn-tooltip">${window.translations.moveRight}</span>`;
    moveDown.onclick = this.moveDownButtonCallback;
    buttonContainer.appendChild(moveDown);


    const rotateCCW = document.createElement("button");
    rotateCCW.classList.add("btn", "btn-secondary");
    rotateCCW.innerHTML = `<span class="material-symbols-rounded">rotate_left</span><span class="btn-tooltip">${window.translations.rotateLeft}</span>`;
    rotateCCW.onclick = this.rotateCCWButtonCallback;
    buttonContainer.appendChild(rotateCCW);

    const rotateCW = document.createElement("button");
    rotateCW.classList.add("btn", "btn-secondary");
    rotateCW.innerHTML = `<span class="material-symbols-rounded">rotate_right</span><span class="btn-tooltip">${window.translations.rotateRight}</span>`;
    rotateCW.onclick = this.rotateCWButtonCallback;
    buttonContainer.appendChild(rotateCW);

    const deletePage = document.createElement("button");
    deletePage.classList.add("btn", "btn-danger");
    deletePage.innerHTML = `<span class="material-symbols-rounded">delete</span><span class="btn-tooltip"></span><span class="btn-tooltip">${window.translations.delete}</span>`;
    deletePage.onclick = this.deletePageButtonCallback;
    buttonContainer.appendChild(deletePage);

    div.appendChild(buttonContainer);

    //enerate checkbox to select individual pages
    const selectCheckbox = document.createElement("input");
    selectCheckbox.type = "checkbox";
    selectCheckbox.classList.add("pdf-actions_checkbox", "form-check-input");
    selectCheckbox.id = `selectPageCheckbox`;
    selectCheckbox.checked = window.selectAll;

    div.appendChild(selectCheckbox);

    //only show whenpage select mode is active
    if (!window.selectPage) {
      selectCheckbox.classList.add("hidden");
    } else {
      selectCheckbox.classList.remove("hidden");
    }

    selectCheckbox.onchange = () => {
      const pageNumber = Array.from(div.parentNode.children).indexOf(div) + 1;
      let selectPageCommand = new SelectPageCommand(pageNumber, selectCheckbox);
      selectPageCommand.execute();

      this._pushUndoClearRedo(selectPageCommand);
    };

    const insertFileButtonContainer = document.createElement("div");

    insertFileButtonContainer.classList.add(
      "pdf-actions_insert-file-button-container",
      leftDirection,
      `align-center-${leftDirection}`,
    );

    const insertFileButton = document.createElement("button");
    insertFileButton.classList.add("btn", "btn-primary", "pdf-actions_insert-file-button");
    insertFileButton.innerHTML = `<span class="material-symbols-rounded">add</span></span><span class="btn-tooltip">${window.translations.addFile}</span>`;
    insertFileButton.onclick = this.insertFileButtonCallback;
    insertFileButtonContainer.appendChild(insertFileButton);

    const splitFileButton = document.createElement("button");
    splitFileButton.classList.add("btn", "btn-primary", "pdf-actions_split-file-button");
    splitFileButton.innerHTML = `<span class="material-symbols-rounded">cut</span></span><span class="btn-tooltip">${window.translations.split}</span>`;
    splitFileButton.onclick = this.splitFileButtonCallback;
    insertFileButtonContainer.appendChild(splitFileButton);

    const insertFileBlankButton = document.createElement("button");
    insertFileBlankButton.classList.add("btn", "btn-primary", "pdf-actions_insert-file-blank-button");
    insertFileBlankButton.innerHTML = `<span class="material-symbols-rounded">insert_page_break</span></span><span class="btn-tooltip">${window.translations.insertPageBreak}</span>`;
    insertFileBlankButton.onclick = this.insertFileBlankButtonCallback;
    insertFileButtonContainer.appendChild(insertFileBlankButton);

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
      window.updatePageNumbersAndCheckboxes();
      const pageNumber = Array.from(div.parentNode.children).indexOf(div) + 1;
      adaptPageNumber(pageNumber, div);
      const checkbox = document.getElementById(`selectPageCheckbox-${pageNumber}`);
      if (checkbox && !window.selectPage) {
        checkbox.classList.remove("hidden");
      }
    });

    div.addEventListener("mouseleave", () => {
      const pageNumber = Array.from(div.parentNode.children).indexOf(div) + 1;
      const pageNumberElement = div.querySelector(".page-number");
      if (pageNumberElement) {
        div.removeChild(pageNumberElement);
      }
      const checkbox = document.getElementById(`selectPageCheckbox-${pageNumber}`);
      if (checkbox && !window.selectPage) {
        checkbox.classList.add("hidden");
      }
    });

    document.addEventListener("selectedPagesUpdated", () => {
      window.updateSelectedPagesDisplay();
    });

    return div;
  }

}

export default PdfActionsManager;
