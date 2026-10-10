import { describe, expect, it, vi } from "vitest";
import { createReadAloudDocSession } from "@app/components/viewer/readAloudDocSession";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createReadAloudDocSession", () => {
  it("opens once and shares the handle across pages", async () => {
    const open = vi.fn(async () => 7);
    const close = vi.fn();
    const session = createReadAloudDocSession(open, close);
    const bytes = new ArrayBuffer(8);
    const file = { id: "a" };

    await expect(session.ensure(file, bytes)).resolves.toBe(7);
    await expect(session.ensure(file, bytes)).resolves.toBe(7);
    expect(open).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it("closes the old handle when the file changes", async () => {
    const open = vi.fn(async () => 7);
    const close = vi.fn(async () => {});
    const session = createReadAloudDocSession(open, close);

    await session.ensure({ id: "a" }, new ArrayBuffer(8));
    await session.ensure({ id: "b" }, new ArrayBuffer(8));

    expect(open).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(7);
  });

  it("shares one open between concurrent advances", async () => {
    const gate = deferred<number>();
    const open = vi.fn(() => gate.promise);
    const close = vi.fn();
    const session = createReadAloudDocSession(open, close);
    const bytes = new ArrayBuffer(8);
    const file = { id: "a" };

    const first = session.ensure(file, bytes);
    const second = session.ensure(file, bytes);
    gate.resolve(11);
    await expect(first).resolves.toBe(11);
    await expect(second).resolves.toBe(11);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("closes a superseded open instead of caching it", async () => {
    const firstGate = deferred<number>();
    const secondGate = deferred<number>();
    const open = vi
      .fn()
      .mockReturnValueOnce(firstGate.promise)
      .mockReturnValueOnce(secondGate.promise);
    const close = vi.fn(async () => {});
    const session = createReadAloudDocSession(open, close);
    const bytes = new ArrayBuffer(8);

    const stale = session.ensure({ id: "a" }, bytes);
    const fresh = session.ensure({ id: "b" }, bytes);
    firstGate.resolve(21);
    await expect(stale).resolves.toBeNull();
    expect(close).toHaveBeenCalledWith(21);
    secondGate.resolve(22);
    await expect(fresh).resolves.toBe(22);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("returns null and clears the slot when opening fails", async () => {
    const open = vi.fn<() => Promise<number>>(async () => {
      throw new Error("nope");
    });
    const close = vi.fn();
    const session = createReadAloudDocSession(open, close);
    const bytes = new ArrayBuffer(8);

    await expect(session.ensure({ id: "a" }, bytes)).resolves.toBeNull();
    expect(close).not.toHaveBeenCalled();

    open.mockResolvedValue(33);
    await expect(session.ensure({ id: "a" }, bytes)).resolves.toBe(33);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("a reopen after close invalidates the still-pending first open", async () => {
    const firstGate = deferred<number>();
    const secondGate = deferred<number>();
    const open = vi
      .fn()
      .mockReturnValueOnce(firstGate.promise)
      .mockReturnValueOnce(secondGate.promise);
    const close = vi.fn(async () => {});
    const session = createReadAloudDocSession(open, close);
    const bytes = new ArrayBuffer(8);
    const file = { id: "a" };

    const first = session.ensure(file, bytes);
    session.close();
    const second = session.ensure(file, bytes);
    firstGate.resolve(21);
    await expect(first).resolves.toBeNull();
    expect(close).toHaveBeenCalledWith(21);
    secondGate.resolve(22);
    await expect(second).resolves.toBe(22);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("close drops the handle and tolerates close failures", async () => {
    const open = vi.fn(async () => 7);
    const close = vi.fn(async () => {
      throw new Error("busy");
    });
    const session = createReadAloudDocSession(open, close);
    const bytes = new ArrayBuffer(8);

    await session.ensure({ id: "a" }, bytes);
    session.close();
    await session.ensure({ id: "a" }, bytes);
    expect(open).toHaveBeenCalledTimes(2);
  });
});
