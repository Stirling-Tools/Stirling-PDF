import { Command } from "./command.js";

export class DeletePageCommand extends Command {
  constructor(element, pagesContainer) {
    super();

    this.element = element;
    this.pagesContainer = pagesContainer;

    this.filenameInputValue = document.getElementById("filename-input").value;

    const filenameParagraph = document.getElementById("filename");
    this.filenameParagraphText = filenameParagraph
      ? filenameParagraph.innerText
      : "";
  }

  execute() {
    this.nextSibling = this.element.nextSibling;

    this.pagesContainer.removeChild(this.element);
    if (this.pagesContainer.childElementCount === 0) {
      const filenameInput = document.getElementById("filename-input");
      const downloadBtn = document.getElementById("export-button");

      filenameInput.disabled = true;
      filenameInput.value = "";

      downloadBtn.disabled = true;
    }
  }

  undo() {
    let node = this.nextSibling;
    if (node) this.pagesContainer.insertBefore(this.element, node);
    else this.pagesContainer.appendChild(this.element);

    const pageNumberElement = this.element.querySelector(".page-number");
    if (pageNumberElement) {
      this.element.removeChild(pageNumberElement);
    }

    const filenameInput = document.getElementById("filename-input");
    const downloadBtn = document.getElementById("export-button");

    filenameInput.disabled = false;
    filenameInput.value = this.filenameInputValue;

    downloadBtn.disabled = false;
  }

  redo() {
    const pageNumberElement = this.element.querySelector(".page-number");
    if (pageNumberElement) {
      this.element.removeChild(pageNumberElement);
    }

    this.pagesContainer.removeChild(this.element);
    if (this.pagesContainer.childElementCount === 0) {
      const filenameInput = document.getElementById("filename-input");
      const downloadBtn = document.getElementById("export-button");

      filenameInput.disabled = true;
      filenameInput.value = "";

      downloadBtn.disabled = true;
    }
  }
}
