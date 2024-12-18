import {Command} from './command.js';

export class AbstractMovePageCommand extends Command {
  constructor(startElement, endElement, pagesContainer, pagesContainerWrapper, scrollTo = false) {
    super();

    this.pagesContainer = pagesContainer;
    const childArray = Array.from(this.pagesContainer.childNodes);

    this.startIndex = childArray.indexOf(startElement);
    this.endIndex = childArray.indexOf(endElement);

    this.startElement = startElement;
    this.endElement = endElement;

    this.scrollTo = scrollTo;
    this.pagesContainerWrapper = pagesContainerWrapper;
  }

  execute() {
    // Check & remove page number elements here too if they exist because Firefox doesn't fire the relevant event on page move.
    const pageNumberElement = this.startElement.querySelector('.page-number');
    if (pageNumberElement) {
      this.startElement.removeChild(pageNumberElement);
    }

    this.pagesContainer.removeChild(this.startElement);
    if (!this.endElement) {
      this.pagesContainer.append(this.startElement);
    } else {
      this.pagesContainer.insertBefore(this.startElement, this.endElement);
    }

    if (this.scrollTo) {
      const {width} = this.startElement.getBoundingClientRect();
      const vector = this.endIndex !== -1 && this.startIndex > this.endIndex ? 0 - width : width;

      this.pagesContainerWrapper.scroll({
        left: this.pagesContainerWrapper.scrollLeft + vector,
      });
    }
  }

  undo() {
    // Requires overriding in child classes
  }

  redo() {
    this.execute();
  }
}

export class MovePageUpCommand extends AbstractMovePageCommand {
  constructor(startElement, endElement, pagesContainer, pagesContainerWrapper, scrollTo = false) {
    super(startElement, endElement, pagesContainer, pagesContainerWrapper, scrollTo);
  }

  undo() {
    if (this.endElement) {
      this.pagesContainer.removeChild(this.endElement);
      this.startElement.insertAdjacentElement('beforebegin', this.endElement);
    }

    if (this.scrollTo) {
      const {width} = this.startElement.getBoundingClientRect();
      const vector = this.endIndex === -1 || this.startIndex <= this.endIndex ? 0 - width : width;

      this.pagesContainerWrapper.scroll({
        left: this.pagesContainerWrapper.scrollLeft - vector,
      });
    }
  }

  redo() {
    this.execute();
  }
}

export class MovePageDownCommand extends AbstractMovePageCommand {
  constructor(startElement, endElement, pagesContainer, pagesContainerWrapper, scrollTo = false) {
    super(startElement, endElement, pagesContainer, pagesContainerWrapper, scrollTo);
  }

  undo() {
    let previousElement = this.startElement.previousSibling;

    if (this.startElement) {
      this.pagesContainer.removeChild(this.startElement);
      previousElement.insertAdjacentElement('beforebegin', this.startElement);
    }

    if (this.scrollTo) {
      const {width} = this.startElement.getBoundingClientRect();
      const vector = this.endIndex === -1 || this.startIndex <= this.endIndex ? 0 - width : width;

      this.pagesContainerWrapper.scroll({
        left: this.pagesContainerWrapper.scrollLeft - vector,
      });
    }
  }

  redo() {
    this.execute();
  }
}
