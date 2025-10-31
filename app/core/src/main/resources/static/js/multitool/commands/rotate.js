import { Command } from "./command.js";

/**
 * Rotates a single image element by a relative degree.
 */
export class RotateElementCommand extends Command {
  /**
   * @param {HTMLElement} element - The <img> element to rotate.
   * @param {number|string} degree - Relative degrees to add (e.g., 90 or "-90").
   */
  constructor(element, degree) {
    super();
    this.element = element;
    this.degree = degree;
  }

  /** Execute: apply rotation. */
  execute() {
    let lastTransform = this.element.style.rotate || "0";
    const lastAngle = parseInt(lastTransform.replace(/[^\d-]/g, ""));
    const newAngle = lastAngle + parseInt(this.degree);

    this.element.style.rotate = newAngle + "deg";
  }

  /** Undo: revert by subtracting the same delta. */
  undo() {
    let lastTransform = this.element.style.rotate || "0";
    const currentAngle = parseInt(lastTransform.replace(/[^\d-]/g, ""));
    const undoAngle = currentAngle + -parseInt(this.degree);

    this.element.style.rotate = undoAngle + "deg";
  }

  /** Redo mirrors execute. */
  redo() {
    this.execute();
  }
}

/**
 * Rotates a set of image elements by a relative degree.
 */
export class RotateAllCommand extends Command {
  /**
   * @param {HTMLElement[]} elements - Image elements to rotate.
   * @param {number} degree - Relative degrees to add for all.
   */
  constructor(elements, degree) {
    super();
    this.elements = elements;
    this.degree = degree;
  }

  /** Execute: apply rotation to all. */
  execute() {
    for (const element of this.elements) {
      let lastTransform = element.style.rotate || "0";
      const lastAngle = parseInt(lastTransform.replace(/[^\d-]/g, ""));
      const newAngle = lastAngle + this.degree;

      element.style.rotate = newAngle + "deg";
    }
  }

  /** Undo: revert rotation for all. */
  undo() {
    for (const element of this.elements) {
      let lastTransform = element.style.rotate || "0";
      const currentAngle = parseInt(lastTransform.replace(/[^\d-]/g, ""));
      const undoAngle = currentAngle + -this.degree;

      element.style.rotate = undoAngle + "deg";
    }
  }

  /** Redo mirrors execute. */
  redo() {
    this.execute();
  }
}
