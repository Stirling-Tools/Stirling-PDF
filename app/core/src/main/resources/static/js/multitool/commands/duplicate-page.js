import { CommandWithAnchors } from './command.js';

export class DuplicatePageCommand extends CommandWithAnchors {
  /**
   * @param {HTMLElement} element - The page element to duplicate.
   * @param {Function} duplicatePageAction - (element) => HTMLElement (new clone already inserted)
   * @param {HTMLElement} pagesContainer
   */
  constructor(element, duplicatePageAction, pagesContainer) {
    super();
    this.element = element;
    this.duplicatePageAction = duplicatePageAction;
    this.pagesContainer = pagesContainer;

    /** @type {HTMLElement|null} */
    this.newElement = null;

    /** @type {{ el: HTMLElement, nextSibling: ChildNode|null, index: number }|null} */
    this._anchor = null;
  }

  execute() {
    // Create and insert a duplicate next to the original
    this.newElement = this.duplicatePageAction(this.element);
  }

  undo() {
    if (!this.newElement) return;

    // Capture anchor before removal so redo can reinsert at the same position
    this._anchor = this.captureAnchor(this.newElement, this.pagesContainer);

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

  redo() {
    if (!this.newElement) {
      this.execute();
      return;
    }
    if (this._anchor) {
      this.insertWithAnchor(this.pagesContainer, this._anchor);
    } else {
      // Fallback: insert relative to the original element
      this.pagesContainer.insertBefore(this.newElement, this.element.nextSibling || null);
    }
    window.updatePageNumbersAndCheckboxes?.();
  }
}
