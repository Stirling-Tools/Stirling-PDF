import { Command } from "./command.js";

/**
 * Removes a page from the container and restores it on undo.
 */
export class DeletePageCommand extends Command {
  /**
   * @param {HTMLElement} element - Page container to delete.
   * @param {HTMLElement} pagesContainer - Parent container holding all pages.
   */
  constructor(element, pagesContainer) {
    super();

    this.element = element;
    this.pagesContainer = pagesContainer;

    /** @type {ChildNode|null} */
    this.nextSibling = null;

    const filenameInput = document.getElementById("filename-input");
    /** @type {string} */
    this.filenameInputValue = filenameInput ? filenameInput.value : "";

    const filenameParagraph = document.getElementById("filename");
    /** @type {string} */
    this.filenameParagraphText = filenameParagraph ? filenameParagraph.innerText : "";
  }

  /** Execute: remove the page and update empty-state UI if needed. */
  execute() {
    this.nextSibling = this.element.nextSibling;

    this.pagesContainer.removeChild(this.element);
    if (this.pagesContainer.childElementCount === 0) {
      const filenameInput = document.getElementById("filename-input");
      const downloadBtn = document.getElementById("export-button");

      if (filenameInput) {
        filenameInput.disabled = true;
        filenameInput.value = "";
      }
      if (downloadBtn) {
        downloadBtn.disabled = true;
      }
    }
  }

  /** Undo: reinsert the page at its original position. */
  undo() {
    const node = /** @type {ChildNode|null} */ (this.nextSibling);
    if (node) this.pagesContainer.insertBefore(this.element, node);
    else this.pagesContainer.appendChild(this.element);

    const pageNumberElement = this.element.querySelector(".page-number");
    if (pageNumberElement) {
      this.element.removeChild(pageNumberElement);
    }

    const filenameInput = document.getElementById("filename-input");
    const downloadBtn = document.getElementById("export-button");

    if (filenameInput) {
      filenameInput.disabled = false;
      filenameInput.value = this.filenameInputValue;
    }
    if (downloadBtn) {
      downloadBtn.disabled = false;
    }
  }

  /** Redo: remove again and maintain empty-state UI. */
  redo() {
    const pageNumberElement = this.element.querySelector(".page-number");
    if (pageNumberElement) {
      this.element.removeChild(pageNumberElement);
    }

    this.pagesContainer.removeChild(this.element);
    if (this.pagesContainer.childElementCount === 0) {
      const filenameInput = document.getElementById("filename-input");
      const downloadBtn = document.getElementById("export-button");

      if (filenameInput) {
        filenameInput.disabled = true;
        filenameInput.value = "";
      }
      if (downloadBtn) {
        downloadBtn.disabled = true;
      }
    }
  }
}
