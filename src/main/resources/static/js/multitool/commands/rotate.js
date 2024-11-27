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
