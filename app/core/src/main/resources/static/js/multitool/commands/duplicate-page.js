import { Command } from './command.js';

/**
 * Represents a command to duplicate a page element.
 * This command supports undo and redo operations.
 */
export class DuplicatePageCommand extends Command {
  /**
   * Creates an instance of DuplicatePageCommand.
   * @param {HTMLElement} element - The page element to duplicate.
   * @param {Function} duplicatePageAction - A function that duplicates the given element and returns the new element.
   * @param {HTMLElement} pagesContainer - The container element holding all page elements.
   */
  constructor(element, duplicatePageAction, pagesContainer) {
    super();
    this.element = element;
    this.duplicatePageAction = duplicatePageAction;
    this.pagesContainer = pagesContainer;

    /** @type {HTMLElement|null} */
    this.newElement = null;

    /** @type {ChildNode|null} */
    this.nextSibling = null;

    /** @type {number|null} */
    this.targetIndex = null; // fallback if nextSibling is no longer available
  }

  /**
   * Executes the duplicate page command.
   * Creates a new duplicate of the specified element.
   */
  execute() {
    this.newElement = this.duplicatePageAction(this.element);
  }

  /**
   * Undoes the duplicate page command.
   * Removes the duplicated element from the container and updates the UI.
   */
  undo() {
    if (!this.newElement) return;

    // Remember sibling and index before removing
    this.nextSibling = this.newElement.nextSibling;
    this.targetIndex = Array.prototype.indexOf.call(
      this.pagesContainer.children,
      this.newElement
    );

    this.pagesContainer.removeChild(this.newElement);

    if (this.pagesContainer.childElementCount === 0) {
      const filenameInput = document.getElementById('filename-input');
      const downloadBtn = document.getElementById('export-button');
      if (filenameInput) {
        filenameInput.disabled = true;
        filenameInput.value = '';
      }
      if (downloadBtn) {
        downloadBtn.disabled = true;
      }
    }

    window.updatePageNumbersAndCheckboxes?.();
  }

  /**
   * Redoes the duplicate page command.
   * Re-inserts the duplicated element into the container and updates the UI.
   */
  redo() {
    if (!this.newElement) {
      this.execute();
      return;
    }

    // Validate stored sibling reference
    const nextSiblingIsValid =
      this.nextSibling && this.nextSibling.parentNode === this.pagesContainer;

    let anchor = null;
    if (nextSiblingIsValid) {
      anchor = this.nextSibling;
    } else if (
      Number.isInteger(this.targetIndex) &&
      this.targetIndex >= 0 &&
      this.targetIndex < this.pagesContainer.children.length
    ) {
      // Fallback: use stored index position
      anchor = this.pagesContainer.children[this.targetIndex] || null;
    } else {
      // Final fallback: use the original element’s sibling
      anchor = this.element.nextSibling;
    }

    this.pagesContainer.insertBefore(this.newElement, anchor || null);
    window.updatePageNumbersAndCheckboxes?.();
  }
}
