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
    for (const [index, element] of this.elements.entries()) {
      if (this.isSelectedInWindow && !this.selectedPages.includes(index)) {
        continue;
      }

      const newElement = await this.pageBreakCallback(element.nextSibling, true);
      if (newElement) {
        this.addedElements.push(newElement);
      }
    }
  }

  undo() {
    this.addedElements.forEach((element) => {
      const nextSibling = element.nextSibling;

      this.pagesContainer.removeChild(element[0]);

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
