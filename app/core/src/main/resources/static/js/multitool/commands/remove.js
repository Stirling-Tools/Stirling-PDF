import { Command } from "./command.js";

/**
 * Deletes a set of selected pages and restores them on undo.
 */
export class RemoveSelectedCommand extends Command {
  /**
   * @param {HTMLElement} pagesContainer - Parent container.
   * @param {number[]} selectedPages - 1-based page numbers to remove.
   * @param {Function} updatePageNumbersAndCheckboxes - Callback to refresh UI state.
   */
  constructor(pagesContainer, selectedPages, updatePageNumbersAndCheckboxes) {
    super();
    this.pagesContainer = pagesContainer;
    this.selectedPages = selectedPages;

    /** @type {{idx:number, childNode:HTMLElement}[]} */
    this.deletedChildren = [];

    this.updatePageNumbersAndCheckboxes = updatePageNumbersAndCheckboxes || (() => {
      const pageDivs = document.querySelectorAll(".pdf-actions_container");
      pageDivs.forEach((div, index) => {
        const pageNumber = index + 1;
        const checkbox = div.querySelector(".pdf-actions_checkbox");
        if (checkbox) {
          checkbox.id = `selectPageCheckbox-${pageNumber}`;
          checkbox.setAttribute("data-page-number", pageNumber);
          checkbox.checked = window.selectedPages.includes(pageNumber);
        }
      });
    });

    const filenameInput = document.getElementById("filename-input");
    const filenameParagraph = document.getElementById("filename");

    /** @type {string} */
    this.originalFilenameInputValue = filenameInput ? filenameInput.value : "";
    /** @type {string|undefined} */
    this.originalFilenameParagraphText = filenameParagraph?.innerText;
  }

  /** Execute: remove selected pages and update empty state. */
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
      if (filenameInput) filenameInput.value = "";
      if (filenameParagraph) filenameParagraph.innerText = "";
      if (downloadBtn) downloadBtn.disabled = true;
    }

    window.selectedPages = [];
    this.updatePageNumbersAndCheckboxes();
    document.dispatchEvent(new Event("selectedPagesUpdated"));
  }

  /** Undo: restore all removed nodes at their original indices. */
  undo() {
    while (this.deletedChildren.length > 0) {
      const deletedChild = this.deletedChildren.pop();
      if (this.pagesContainer.children.length <= deletedChild.idx) {
        this.pagesContainer.appendChild(deletedChild.childNode);
      } else {
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
      if (filenameInput) filenameInput.value = this.originalFilenameInputValue;
      if (filenameParagraph && this.originalFilenameParagraphText !== undefined) {
        filenameParagraph.innerText = this.originalFilenameParagraphText;
      }
      if (downloadBtn) downloadBtn.disabled = false;
    }

    window.selectedPages = this.selectedPages;
    this.updatePageNumbersAndCheckboxes();
    document.dispatchEvent(new Event("selectedPagesUpdated"));
  }

  /** Redo mirrors execute. */
  redo() {
    this.execute();
  }
}
