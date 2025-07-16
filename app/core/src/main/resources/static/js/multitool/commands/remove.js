import { Command } from "./command.js";

export class RemoveSelectedCommand extends Command {
  constructor(pagesContainer, selectedPages, updatePageNumbersAndCheckboxes) {
    super();
    this.pagesContainer = pagesContainer;
    this.selectedPages = selectedPages;

    this.deletedChildren = [];

    if (updatePageNumbersAndCheckboxes) {
      this.updatePageNumbersAndCheckboxes = updatePageNumbersAndCheckboxes;
    } else {
      const pageDivs = document.querySelectorAll(".pdf-actions_container");

      pageDivs.forEach((div, index) => {
        const pageNumber = index + 1;
        const checkbox = div.querySelector(".pdf-actions_checkbox");
        checkbox.id = `selectPageCheckbox-${pageNumber}`;
        checkbox.setAttribute("data-page-number", pageNumber);
        checkbox.checked = window.selectedPages.includes(pageNumber);
      });
    }

    const filenameInput = document.getElementById("filename-input");
    const filenameParagraph = document.getElementById("filename");

    this.originalFilenameInputValue = filenameInput ? filenameInput.value : "";
    if (filenameParagraph)
      this.originalFilenameParagraphText = filenameParagraph.innerText;
  }

  execute() {
    let deletions = 0;

    this.selectedPages.forEach((pageIndex) => {
      const adjustedIndex = pageIndex - 1 - deletions;
      const child = this.pagesContainer.children[adjustedIndex];
      if (child) {
        this.pagesContainer.removeChild(child);
        deletions++;

        this.deletedChildren.push({
          idx: adjustedIndex,
          childNode: child,
        });
      }
    });

    if (this.pagesContainer.childElementCount === 0) {
      const filenameInput = document.getElementById("filename-input");
      const filenameParagraph = document.getElementById("filename");
      const downloadBtn = document.getElementById("export-button");

      if (filenameInput) filenameInput.disabled = true;
      filenameInput.value = "";
      if (filenameParagraph) filenameParagraph.innerText = "";

      downloadBtn.disabled = true;
    }

    window.selectedPages = [];
    this.updatePageNumbersAndCheckboxes();
    document.dispatchEvent(new Event("selectedPagesUpdated"));
  }

  undo() {
    while (this.deletedChildren.length > 0) {
      let deletedChild = this.deletedChildren.pop();
      if (this.pagesContainer.children.length <= deletedChild.idx)
        this.pagesContainer.appendChild(deletedChild.childNode);
      else {
        this.pagesContainer.insertBefore(
          deletedChild.childNode,
          this.pagesContainer.children[deletedChild.idx]
        );
      }
    }

    if (this.pagesContainer.childElementCount > 0) {
      const filenameInput = document.getElementById("filename-input");
      const filenameParagraph = document.getElementById("filename");
      const downloadBtn = document.getElementById("export-button");

      if (filenameInput) filenameInput.disabled = false;
      filenameInput.value = this.originalFilenameInputValue;
      if (filenameParagraph)
        filenameParagraph.innerText = this.originalFilenameParagraphText;

      downloadBtn.disabled = false;
    }

    window.selectedPages = this.selectedPages;
    this.updatePageNumbersAndCheckboxes();
    document.dispatchEvent(new Event("selectedPagesUpdated"));
  }

  redo() {
    this.execute();
  }
}
