import type { HandlerFactory } from "@embedpdf/plugin-annotation";
import type { PdfAnnotationObject, Position } from "@embedpdf/models";

// EmbedPDF's line handler treats a release within this many page units of the
// press as a click rather than a drag.
const CLICK_DISTANCE = 5;

const wrapped = new WeakSet<object>();

const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Lets a line be drawn click-then-click on top of EmbedPDF's press-drag-release
 * line handler. The first click's release is withheld, so the line stays in
 * progress with its preview following the cursor, and the next click away from
 * the start commits it. A drag still draws the line in one gesture.
 */
export function clickToClickLineHandler<
  A extends PdfAnnotationObject,
  TId extends string,
>(base: HandlerFactory<A, TId>): HandlerFactory<A, TId> {
  if (wrapped.has(base)) return base;
  const factory: HandlerFactory<A, TId> = {
    annotationType: base.annotationType,
    create(context) {
      const inner = base.create(context);
      let start: Position | null = null;
      let awaitingEnd = false;
      const reset = () => {
        start = null;
        awaitingEnd = false;
      };
      return {
        ...inner,
        onPointerDown(pos, evt, modeId) {
          // The second click's press would restart the line; only its release matters.
          if (awaitingEnd) return;
          start = pos;
          inner.onPointerDown?.(pos, evt, modeId);
        },
        onPointerUp(pos, evt, modeId) {
          if (!start) return;
          if (distance(pos, start) < CLICK_DISTANCE) {
            awaitingEnd = true;
            return;
          }
          reset();
          inner.onPointerUp?.(pos, evt, modeId);
        },
        onPointerCancel(pos, evt, modeId) {
          reset();
          inner.onPointerCancel?.(pos, evt, modeId);
        },
        onHandlerActiveStart(modeId) {
          reset();
          inner.onHandlerActiveStart?.(modeId);
        },
        onHandlerActiveEnd(modeId) {
          reset();
          inner.onHandlerActiveEnd?.(modeId);
        },
      };
    },
  };
  wrapped.add(factory);
  return factory;
}
