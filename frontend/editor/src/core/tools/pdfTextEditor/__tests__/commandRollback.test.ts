import { describe, expect, it } from "vitest";
import { CompositeCommand } from "@app/tools/pdfTextEditor/commands/CompositeCommand";
import {
  RolledBackError,
  type Command,
} from "@app/tools/pdfTextEditor/commands/Command";
import {
  HistoryStack,
  HistoryStepError,
} from "@app/tools/pdfTextEditor/store/HistoryStack";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

const doc = {} as EditorDocument;

/** A command that appends to `log` so the exact call order is assertable. */
function tracked(
  name: string,
  log: string[],
  fail?: { apply?: boolean; revert?: boolean },
): Command {
  return {
    type: name,
    apply: () => {
      if (fail?.apply) throw new Error(`${name} apply blew up`);
      log.push(`+${name}`);
    },
    revert: () => {
      if (fail?.revert) throw new Error(`${name} revert blew up`);
      log.push(`-${name}`);
    },
  } as unknown as Command;
}

describe("CompositeCommand rollback", () => {
  it("undoes the children that ran when a later apply throws", () => {
    const log: string[] = [];
    const composite = new CompositeCommand([
      tracked("a", log),
      tracked("b", log),
      tracked("c", log, { apply: true }),
      tracked("d", log),
    ]);
    expect(() => composite.apply(doc)).toThrow(RolledBackError);
    // b and a reverted in reverse order; d never ran.
    expect(log).toEqual(["+a", "+b", "-b", "-a"]);
  });

  it("re-applies the children that ran when a revert throws", () => {
    const log: string[] = [];
    const composite = new CompositeCommand([
      tracked("a", log),
      tracked("b", log, { revert: true }),
      tracked("c", log),
    ]);
    // revert() runs c then b; b throws, so c is put back.
    expect(() => composite.revert(doc)).toThrow(RolledBackError);
    expect(log).toEqual(["-c", "+c"]);
  });

  it("reports an unrecoverable failure when the rollback itself throws", () => {
    const log: string[] = [];
    const composite = new CompositeCommand([
      // Applies fine, but cannot be undone - so the group is genuinely stuck.
      tracked("a", log, { revert: true }),
      tracked("b", log, { apply: true }),
    ]);
    let thrown: unknown;
    try {
      composite.apply(doc);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(RolledBackError);
  });

  it("leaves nothing applied when the FIRST child throws", () => {
    const log: string[] = [];
    const composite = new CompositeCommand([
      tracked("a", log, { apply: true }),
      tracked("b", log),
    ]);
    expect(() => composite.apply(doc)).toThrow(RolledBackError);
    expect(log).toEqual([]);
  });
});

describe("HistoryStack forward-apply failures", () => {
  it("surfaces a failed execute as a HistoryStepError", () => {
    const h = new HistoryStack();
    const log: string[] = [];
    expect(() => h.execute(tracked("a", log, { apply: true }), doc)).toThrow(
      HistoryStepError,
    );
  });

  it("does not record a command whose apply threw", () => {
    const h = new HistoryStack();
    const log: string[] = [];
    try {
      h.execute(tracked("a", log, { apply: true }), doc);
    } catch {
      /* expected */
    }
    // Recording it would make the next undo revert changes never made.
    expect(h.size()).toEqual({ undo: 0, redo: 0 });
    expect(h.canUndo).toBe(false);
  });

  it("keeps the previous history intact after a failed execute", () => {
    const h = new HistoryStack();
    const log: string[] = [];
    h.execute(tracked("a", log), doc);
    try {
      h.execute(tracked("b", log, { apply: true }), doc);
    } catch {
      /* expected */
    }
    expect(h.size()).toEqual({ undo: 1, redo: 0 });
    h.undo(doc);
    expect(log).toEqual(["+a", "-a"]);
  });

  it("marks a rolled-back composite as leaving the document intact", () => {
    const h = new HistoryStack();
    const log: string[] = [];
    const composite = new CompositeCommand([
      tracked("a", log),
      tracked("b", log, { apply: true }),
    ]);
    let thrown: unknown;
    try {
      h.execute(composite, doc);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(HistoryStepError);
    expect((thrown as HistoryStepError).documentIntact).toBe(true);
    // The cause is unwrapped, so the UI shows what actually failed.
    expect((thrown as HistoryStepError).cause).toBeInstanceOf(Error);
    expect(String((thrown as HistoryStepError).cause)).toMatch(/b apply/);
  });

  it("marks a bare command's failure as leaving the document unknown", () => {
    const h = new HistoryStack();
    const log: string[] = [];
    let thrown: unknown;
    try {
      h.execute(tracked("a", log, { apply: true }), doc);
    } catch (err) {
      thrown = err;
    }
    expect((thrown as HistoryStepError).documentIntact).toBe(false);
  });

  it("a failed execute does not coalesce the next edit into it", () => {
    const h = new HistoryStack();
    const log: string[] = [];
    const keyed = (name: string, fail?: boolean): Command =>
      ({
        ...tracked(name, log, fail ? { apply: true } : undefined),
        coalesceKey: () => "same",
      }) as unknown as Command;
    h.execute(keyed("a"), doc);
    try {
      h.execute(keyed("b", true), doc);
    } catch {
      /* expected */
    }
    h.execute(keyed("c"), doc);
    // Two separate undo steps: the failure ended the burst.
    expect(h.size()).toEqual({ undo: 2, redo: 0 });
  });
});
