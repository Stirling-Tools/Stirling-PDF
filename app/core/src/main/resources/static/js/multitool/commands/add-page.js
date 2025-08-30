import { CommandWithAnchors } from './command.js';

export class AddFilesCommand extends CommandWithAnchors {
  /**
   * @param {HTMLElement|null} element - Anchor element (optional, forwarded to addFilesAction)
   * @param {number[]} selectedPages
   * @param {Function} addFilesAction - async (nextSiblingElement|false) => HTMLElement[]|HTMLElement|null
   * @param {HTMLElement} pagesContainer
   */
  constructor(element, selectedPages, addFilesAction, pagesContainer) {
    super();
    this.element = element;
    this.selectedPages = selectedPages;
    this.addFilesAction = addFilesAction;
    this.pagesContainer = pagesContainer;

    /** @type {HTMLElement[]} */
    this.addedElements = [];

    /**
     * Anchors captured on undo to support redo reinsertion.
     * @type {{ el: HTMLElement, nextSibling: ChildNode|null, index: number }[]}
     */
    this._anchors = [];
  }

  async execute() {
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.disabled = true;

    const result = await this.addFilesAction(this.element || false);
    if (Array.isArray(result)) {
      this.addedElements = result;
    } else if (result) {
      this.addedElements = [result];
    } else {
      this.addedElements = [];
    }

    if (undoBtn) undoBtn.disabled = false;
  }

  undo() {
    this._anchors = [];

    for (const el of this.addedElements) {
      this._anchors.push(this.captureAnchor(el, this.pagesContainer));
      this.pagesContainer.removeChild(el);
    }

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
  }

  redo() {
    if (!this.addedElements.length) return;

    for (const anchor of this._anchors) {
      this.insertWithAnchor(this.pagesContainer, anchor);
    }
  }
}
