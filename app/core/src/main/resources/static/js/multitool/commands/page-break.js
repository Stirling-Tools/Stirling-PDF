import {Command} from './command.js';

export class PageBreakCommand extends Command {
  constructor(elements, isSelectedInWindow, selectedPages, pageBreakCallback, pagesContainer) {
    super();
    this.elements = elements;
    this.isSelectedInWindow = isSelectedInWindow;
    this.selectedPages = selectedPages;
    this.pageBreakCallback = pageBreakCallback;
    this.pagesContainer = pagesContainer;
    this.addedElements = [];
    this.originalStates = Array.from(elements, (element) => ({
      element,
      hasContent: element.innerHTML.trim() !== '',
    }));
  }

  async execute() {
    const undoBtn = document.getElementById('undo-btn');
    undoBtn.disabled = true;
    for (const [index, element] of this.elements.entries()) {
      if (!this.isSelectedInWindow || this.selectedPages.includes(index)) {
        if (index !== 0) {
          const newElement = await this.pageBreakCallback(element, this.addedElements);

          if (newElement) {
            this.addedElements = newElement;
          }
        }
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
        const filenameParagraph = document.getElementById('filename');
        const downloadBtn = document.getElementById('export-button');

        filenameInput.disabled = true;
        filenameInput.value = '';
        filenameParagraph.innerText = '';
        downloadBtn.disabled = true;
      }

      element._nextSibling = nextSibling;
    });
  }

  redo() {
    this.execute();
  }
}
