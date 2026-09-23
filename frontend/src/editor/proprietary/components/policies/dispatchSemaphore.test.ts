import { describe, it, expect, beforeEach } from "vitest";
import {
  acquireDispatchSlot,
  releaseDispatchSlot,
  resetDispatchSemaphoreForTests,
} from "@app/components/policies/dispatchSemaphore";

// Drain the microtask queue so an acquire's await-resume AND the caller's .then
// have both run.
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => resetDispatchSemaphoreForTests());

describe("dispatchSemaphore", () => {
  it("lets up to 4 acquire without waiting, then blocks the 5th", async () => {
    for (let i = 0; i < 4; i++) await acquireDispatchSlot();
    let fifthAcquired = false;
    void acquireDispatchSlot().then(() => {
      fifthAcquired = true;
    });
    await flush();
    expect(fifthAcquired).toBe(false);
    releaseDispatchSlot();
    await flush();
    expect(fifthAcquired).toBe(true);
  });

  it("serves a priority (chained) waiter before earlier normal waiters", async () => {
    for (let i = 0; i < 4; i++) await acquireDispatchSlot(); // pool full
    const order: string[] = [];
    // Two normal (new-file) dispatches queue first…
    void acquireDispatchSlot(false).then(() => order.push("normal-1"));
    void acquireDispatchSlot(false).then(() => order.push("normal-2"));
    // …then a chained dispatch arrives — it must jump ahead.
    void acquireDispatchSlot(true).then(() => order.push("chained"));
    await flush();

    releaseDispatchSlot();
    await flush();
    releaseDispatchSlot();
    await flush();
    releaseDispatchSlot();
    await flush();

    expect(order).toEqual(["chained", "normal-1", "normal-2"]);
  });
});
