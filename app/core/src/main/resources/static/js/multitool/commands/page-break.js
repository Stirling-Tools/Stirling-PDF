import { CommandWithAnchors } from './command.js';

export class PageBreakCommand extends CommandWithAnchors {
  /**
   * @param {HTMLElement[]} elements
   * @param {boolean} isSelectedInWindow
   * @param {number[]} selectedPages - 0-based indices of selected pages
   * @param {Function} pageBreakCallback - async (element, addedSoFar) => HTMLElement[]|HTMLElement|null
   * @param {HTMLElement} pagesContainer
   */
  constructor(elements, isSelectedInWindow, selectedPages, pageBreakCallback, pagesContainer) {
    super();
    this.elements = elements;
    this.isSelectedInWindow = isSelectedInWindow;
    this.selectedPages = selectedPages;
    this.pageBreakCallback = pageBreakCallback;
    this.pagesContainer = pagesContainer;

    /** @type {HTMLElement[]} */
    this.addedElements = [];

    /**
     * Anchors captured on undo to support redo reinsertion.
     * @type {{ el: HTMLElement, nextSibling: ChildNode|null, index: number }[]}
     */
    this._anchors = [];

    // Keep content snapshot if needed for future enhancements
    this.originalStates = Array.from(elements, (element) => ({
      element,
      hasContent: element.innerHTML.trim() !== '',
    }));
  }

  async execute() {
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.disabled = true;

    for (const [index, element] of this.elements.entries()) {
      const withinSelection = !this.isSelectedInWindow || this.selectedPages.includes(index);
      if (!withinSelection) continue;

      if (index !== 0) {
        const result = await this.pageBreakCallback(element, this.addedElements);
        if (!Array.isArray(this.addedElements)) {
          this.addedElements = [];
        }

        if (Array.isArray(result)) {
          this.addedElements.push(...result);
        } else if (result) {
          this.addedElements.push(result);
        }
      }
    }

    // Capture anchors right after insertion so redo does not depend on undo.
    this._anchors = this.addedElements.map((el) => this.captureAnchor(el, this.pagesContainer));

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
      const filenameParagraph = document.getElementById('filename');
      const downloadBtn = document.getElementById('export-button');

      if (filenameInput) {
        filenameInput.disabled = true;
        filenameInput.value = '';
      }
      if (filenameParagraph) {
        filenameParagraph.innerText = '';
      }
      if (downloadBtn) {
        downloadBtn.disabled = true;
      }
    }
  }

  redo() {
    // If elements are already present (no prior undo), do nothing.
    if (!this.addedElements.length) return;
    const alreadyInDom =
      this.addedElements[0].parentNode === this.pagesContainer;
    if (alreadyInDom) return;

    // Use pre-captured anchors (from execute) or fall back to current ones.
    const anchors = (this._anchors && this._anchors.length)
      ? this._anchors
      : this.addedElements.map((el) => this.captureAnchor(el, this.pagesContainer));

    for (const anchor of anchors) {
      this.insertWithAnchor(this.pagesContainer, anchor);
    }
  }
}
