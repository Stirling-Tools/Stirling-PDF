import { Command } from './command.js';

export class DuplicatePageCommand extends Command {
  constructor(element, duplicatePageAction, pagesContainer) {
    super();
    this.element = element;
    this.duplicatePageAction = duplicatePageAction;
    this.pagesContainer = pagesContainer;
    this.newElement = null;
  }

  execute() {
    this.newElement = this.duplicatePageAction(this.element);
  }

  undo() {
    if (this.newElement) {
      const nextSibling = this.newElement.nextSibling;
      this.pagesContainer.removeChild(this.newElement);
      if (this.pagesContainer.childElementCount === 0) {
        const filenameInput = document.getElementById('filename-input');
        const downloadBtn = document.getElementById('export-button');
        filenameInput.disabled = true;
        filenameInput.value = '';
        downloadBtn.disabled = true;
      }
      this.newElement._nextSibling = nextSibling;
      window.updatePageNumbersAndCheckboxes?.();
    }
  }

  redo() {
    if (this.newElement) {
      const nextSibling = this.newElement._nextSibling || this.element.nextSibling;
      this.pagesContainer.insertBefore(this.newElement, nextSibling);
      window.updatePageNumbersAndCheckboxes?.();
    } else {
      this.execute();
    }
  }
}
