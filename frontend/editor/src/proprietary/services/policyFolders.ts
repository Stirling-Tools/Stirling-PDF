/**
 * Backing-folder layer for Policies. A configured policy's folder trigger,
 * editable steps, output and run-state all live in a Watch Folders
 * {@link SmartFolder} (+ its {@link AutomationConfig}) — the policy reuses the
 * Watch Folders engine rather than re-implementing execution. This module is
 * the seam that creates and manages that backing record.
 *
 * The folder is tagged with `policyCategoryId` so the Watch Folders UI can
 * filter it out (it's owned by Policies), while the folder poller still
 * processes it. When the backend lands, this layer is what maps a policy to a
 * server `Policy { trigger, steps, output }`.
 */

import { automationStorage } from "@app/services/automationStorage";
import { smartFolderStorage } from "@app/services/smartFolderStorage";
import type {
  AutomationConfig,
  AutomationOperation,
} from "@app/types/automation";
import type { SmartFolder } from "@app/types/smartFolders";
import type { PolicyCategory } from "@app/types/policies";

/** Folder icon (a name string) used for each policy category's backing folder. */
const CATEGORY_FOLDER_ICON: Record<string, string> = {
  ingestion: "StorageIcon",
  security: "SecurityIcon",
  compliance: "CheckIcon",
  routing: "SwapHorizIcon",
  retention: "StorageIcon",
};

const POLICY_FOLDER_ACCENT = "#3b82f6";

/**
 * Create the backing folder for a policy: persist an automation from the given
 * steps, then a SmartFolder (the folder trigger) referencing it, tagged with
 * the policy's category id. Returns the created folder.
 */
export async function createPolicyFolder(
  category: PolicyCategory,
  operations: AutomationOperation[],
): Promise<SmartFolder> {
  const automation = await automationStorage.saveAutomation({
    name: `${category.label} Policy`,
    description: `Pipeline for the ${category.label} policy`,
    operations,
  });
  return smartFolderStorage.createFolder({
    name: `${category.label} Policy`,
    description: category.desc,
    automationId: automation.id,
    icon: CATEGORY_FOLDER_ICON[category.id] ?? "WorkIcon",
    accentColor: POLICY_FOLDER_ACCENT,
    policyCategoryId: category.id,
    inputSource: "idb",
  });
}

/**
 * Create the backing folder for a policy from an *already-saved* automation
 * (e.g. one the workflow builder just created). Pairs with the wizard, where
 * AutomationCreation persists the automation and we link a folder to it.
 */
export async function createPolicyFolderForAutomation(
  category: PolicyCategory,
  automationId: string,
): Promise<SmartFolder> {
  return smartFolderStorage.createFolder({
    name: `${category.label} Policy`,
    description: category.desc,
    automationId,
    icon: CATEGORY_FOLDER_ICON[category.id] ?? "WorkIcon",
    accentColor: POLICY_FOLDER_ACCENT,
    policyCategoryId: category.id,
    inputSource: "idb",
  });
}

/** The policy's current steps, resolved through its backing folder's automation. */
export async function getPolicyOperations(
  folderId: string,
): Promise<AutomationOperation[]> {
  const folder = await smartFolderStorage.getFolder(folderId);
  if (!folder) return [];
  const automation = await automationStorage.getAutomation(folder.automationId);
  return automation?.operations ?? [];
}

/** The policy's backing automation (its editable pipeline), via its folder. */
export async function getPolicyAutomation(
  folderId: string,
): Promise<AutomationConfig | null> {
  const folder = await smartFolderStorage.getFolder(folderId);
  if (!folder) return null;
  return automationStorage.getAutomation(folder.automationId);
}

/** Replace the policy's steps by updating its backing automation. */
export async function updatePolicyOperations(
  folderId: string,
  operations: AutomationOperation[],
): Promise<void> {
  const folder = await smartFolderStorage.getFolder(folderId);
  if (!folder) return;
  const automation = await automationStorage.getAutomation(folder.automationId);
  if (!automation) return;
  await automationStorage.updateAutomation({ ...automation, operations });
}

/** Pause/resume the policy by toggling its backing folder's paused flag. */
export async function setPolicyFolderPaused(
  folderId: string,
  paused: boolean,
): Promise<void> {
  const folder = await smartFolderStorage.getFolder(folderId);
  if (!folder) return;
  await smartFolderStorage.updateFolder({ ...folder, isPaused: paused });
}

/** Delete the policy's backing folder and its automation. */
export async function deletePolicyFolder(folderId: string): Promise<void> {
  const folder = await smartFolderStorage.getFolder(folderId);
  if (folder) {
    await automationStorage.deleteAutomation(folder.automationId);
  }
  await smartFolderStorage.deleteFolder(folderId);
}
