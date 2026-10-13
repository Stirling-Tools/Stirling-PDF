import { beforeEach, describe, expect, it, vi } from "vitest";

const queue = vi.hoisted(() => ({ files: [] as string[] }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) =>
    command === "get_opened_files" ? queue.files : undefined,
  ),
}));

import {
  beginLoadingLaunchFiles,
  endLoadingLaunchFiles,
  launchFilesPending,
  trackLaunchFilePop,
} from "@app/services/launchFiles";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("launchFilesPending", () => {
  beforeEach(() => {
    queue.files = [];
  });

  it("waits out a pop that comes back empty rather than yielding to it", async () => {
    const pop = deferred<string[]>();
    void trackLaunchFilePop(pop.promise);
    const pending = launchFilesPending();
    pop.resolve([]);
    expect(await pending).toBe(false);
  });

  it("yields while popped files are still loading", async () => {
    const pop = deferred<string[]>();
    void trackLaunchFilePop(pop.promise).then((files) => {
      if (files.length > 0) beginLoadingLaunchFiles();
    });
    const pending = launchFilesPending();
    pop.resolve(["C:/doc.pdf"]);
    expect(await pending).toBe(true);
    endLoadingLaunchFiles();
    expect(await launchFilesPending()).toBe(false);
  });

  it("yields to files still on the queue", async () => {
    queue.files = ["C:/doc.pdf"];
    expect(await launchFilesPending()).toBe(true);
  });
});
