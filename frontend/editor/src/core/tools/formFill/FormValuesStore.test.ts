import { describe, it, expect } from "vitest";
import { FormValuesStore } from "./FormValuesStore";

describe("FormValuesStore", () => {
  it("returns a NEW values reference after setValue (tear-free snapshot)", () => {
    const store = new FormValuesStore();
    const before = store.values;

    store.setValue("field1", "hello");

    const after = store.values;
    // Copy-on-write: the snapshot object reference must change so useSyncExternalStore
    // detects the update. In-place mutation kept the same reference and froze consumers
    // like the progress counter.
    expect(after).not.toBe(before);
    expect(after.field1).toBe("hello");
  });

  it("hands each global subscriber a distinct snapshot per change", () => {
    const store = new FormValuesStore();
    const snapshots: Array<Record<string, string>> = [];
    store.subscribeGlobal(() => snapshots.push(store.values));

    store.setValue("a", "1");
    store.setValue("b", "2");

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).not.toBe(snapshots[1]);
    expect(snapshots[1]).toEqual({ a: "1", b: "2" });
  });

  it("does not notify or replace the snapshot when the value is unchanged", () => {
    const store = new FormValuesStore();
    store.setValue("a", "1");
    const ref = store.values;
    let calls = 0;
    store.subscribeGlobal(() => calls++);

    store.setValue("a", "1"); // same value

    expect(calls).toBe(0);
    expect(store.values).toBe(ref);
  });
});
