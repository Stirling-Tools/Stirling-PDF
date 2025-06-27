import { Command } from "./command.js";

export class RotateElementCommand extends Command {
  constructor(element, degree) {
    super();
    this.element = element;
    this.degree = degree;
  }

  execute() {
    let lastTransform = this.element.style.rotate;
    if (!lastTransform) {
      lastTransform = "0";
    }
    const lastAngle = parseInt(lastTransform.replace(/[^\d-]/g, ""));
    const newAngle = lastAngle + parseInt(this.degree);

    this.element.style.rotate = newAngle + "deg";
  }

  undo() {
    let lastTransform = this.element.style.rotate;
    if (!lastTransform) {
      lastTransform = "0";
    }

    const currentAngle = parseInt(lastTransform.replace(/[^\d-]/g, ""));
    const undoAngle = currentAngle + -parseInt(this.degree);

    this.element.style.rotate = undoAngle + "deg";
  }

  redo() {
    this.execute();
  }
}

export class RotateAllCommand extends Command {
  constructor(elements, degree) {
    super();
    this.elements = elements;
    this.degree = degree;
  }

  execute() {
    for (let element of this.elements) {
      let lastTransform = element.style.rotate;
      if (!lastTransform) {
        lastTransform = "0";
      }
      const lastAngle = parseInt(lastTransform.replace(/[^\d-]/g, ""));
      const newAngle = lastAngle + this.degree;

      element.style.rotate = newAngle + "deg";
    }
  }

  undo() {
    for (let element of this.elements) {
      let lastTransform = element.style.rotate;
      if (!lastTransform) {
        lastTransform = "0";
      }
      const currentAngle = parseInt(lastTransform.replace(/[^\d-]/g, ""));
      const undoAngle = currentAngle + -this.degree;

      element.style.rotate = undoAngle + "deg";
    }
  }

  redo() {
    this.execute();
  }
}
