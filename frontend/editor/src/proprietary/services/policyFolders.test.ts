import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";

// jsdom's crypto has no randomUUID, which watchedFolderStorage uses for folder ids.
if (typeof globalThis.crypto?.randomUUID !== "function") {
  const orig = globalThis.crypto;
  vi.stubGlobal("crypto", {
    getRandomValues: orig?.getRandomValues?.bind(orig),
    randomUUID: () =>
      `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
  });
}

import {
  createPolicyFolder,
  getPolicyOperations,
  updatePolicyOperations,
  setPolicyFolderPaused,
  deletePolicyFolder,
} from "@app/services/policyFolders";
import { watchedFolderStorage } from "@app/services/watchedFolderStorage";
import { automationStorage } from "@app/services/automationStorage";
import type { PolicyCategory } from "@app/types/policies";

const category: PolicyCategory = {
  id: "security",
  label: "Security",
  icon: null,
  desc: "Detect PII, encrypt, verify.",
};

const steps = [
  { operation: "sanitize", parameters: {} },
  { operation: "addPassword", parameters: {} },
];

describe("policyFolders backing-folder layer", () => {
  beforeEach(async () => {
    // Clean slate between tests (fake-indexeddb persists within a run).
    for (const f of await watchedFolderStorage.getAllFolders()) {
      await watchedFolderStorage.deleteFolder(f.id);
    }
    for (const a of await automationStorage.getAllAutomations()) {
      await automationStorage.deleteAutomation(a.id);
    }
  });

  it("creates a folder + automation tagged with the policy category", async () => {
    const folder = await createPolicyFolder(category, steps);
    expect(folder.policyCategoryId).toBe("security");
    expect(folder.automationId).toBeTruthy();

    const ops = await getPolicyOperations(folder.id);
    expect(ops.map((o) => o.operation)).toEqual(["sanitize", "addPassword"]);
  });

  it("updates the steps through the backing automation", async () => {
    const folder = await createPolicyFolder(category, steps);
    await updatePolicyOperations(folder.id, [
      { operation: "compress", parameters: {} },
    ]);
    const ops = await getPolicyOperations(folder.id);
    expect(ops.map((o) => o.operation)).toEqual(["compress"]);
  });

  it("pauses/resumes via the backing folder flag", async () => {
    const folder = await createPolicyFolder(category, steps);
    await setPolicyFolderPaused(folder.id, true);
    expect((await watchedFolderStorage.getFolder(folder.id))?.isPaused).toBe(
      true,
    );
    await setPolicyFolderPaused(folder.id, false);
    expect((await watchedFolderStorage.getFolder(folder.id))?.isPaused).toBe(
      false,
    );
  });

  it("deletes the folder and its automation", async () => {
    const folder = await createPolicyFolder(category, steps);
    const automationId = folder.automationId;
    await deletePolicyFolder(folder.id);
    expect(await watchedFolderStorage.getFolder(folder.id)).toBeNull();
    expect(await automationStorage.getAutomation(automationId)).toBeNull();
  });
});
