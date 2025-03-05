import {Command} from './command.js';

export class AddFilesCommand extends Command {
  constructor(element, selectedPages, addFilesAction, pagesContainer) {
    super();
    this.element = element;
    this.selectedPages = selectedPages;
    this.addFilesAction = addFilesAction;
    this.pagesContainer = pagesContainer;
    this.addedElements = [];
  }

  async execute() {
    const undoBtn = document.getElementById('undo-btn');
    undoBtn.disabled = true;
    if (this.element) {
      const newElement = await this.addFilesAction(this.element);
      if (newElement) {
        this.addedElements = newElement;
      }
    } else {
      const newElement = await this.addFilesAction(false);
      if (newElement) {
        this.addedElements = newElement;
      }
    }
    undoBtn.disabled = false;
  }

  undo() {
    this.addedElements.forEach((element) => {
      const nextSibling = element.nextSibling;
      this.pagesContainer.removeChild(element);

      if (this.pagesContainer.childElementCount === 0) {
        const filenameInput = document.getElementById('filename-input');
        const downloadBtn = document.getElementById('export-button');

        filenameInput.disabled = true;
        filenameInput.value = '';
        downloadBtn.disabled = true;
      }

      element._nextSibling = nextSibling;
    });
    this.addedElements = [];
  }
  redo() {
    this.execute();
  }
}
