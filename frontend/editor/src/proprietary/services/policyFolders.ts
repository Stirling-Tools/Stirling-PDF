/**
 * Backing-folder layer for Policies. A configured policy's folder trigger,
 * editable steps, output and run-state all live in a Watched Folders
 * {@link WatchedFolder} (+ its {@link AutomationConfig}) — the policy reuses the
 * Watched Folders engine rather than re-implementing execution. This module is
 * the seam that creates and manages that backing record.
 *
 * The folder is tagged with `policyCategoryId` so the Watched Folders UI can
 * filter it out (it's owned by Policies). The backing automation also rides
 * along to the backend (in the saved policy's output.options) for round-trip;
 * this folder remains the locally-editable copy.
 */

import { automationStorage } from "@app/services/automationStorage";
import { watchedFolderStorage } from "@app/services/watchedFolderStorage";
import type {
  AutomationConfig,
  AutomationOperation,
} from "@app/types/automation";
import type { WatchedFolder } from "@app/types/watchedFolders";
import type { PolicyCategory, PolicyFolderSettings } from "@app/types/policies";

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
 * steps, then a WatchedFolder (the folder trigger) referencing it, tagged with
 * the policy's category id. Returns the created folder.
 */
export async function createPolicyFolder(
  category: PolicyCategory,
  operations: AutomationOperation[],
): Promise<WatchedFolder> {
  const automation = await automationStorage.saveAutomation({
    name: `${category.label} Policy`,
    description: `Pipeline for the ${category.label} policy`,
    operations,
  });
  return watchedFolderStorage.createFolder({
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
): Promise<WatchedFolder> {
  return watchedFolderStorage.createFolder({
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
  const folder = await watchedFolderStorage.getFolder(folderId);
  if (!folder) return [];
  const automation = await automationStorage.getAutomation(folder.automationId);
  return automation?.operations ?? [];
}

/** The policy's backing automation (its editable pipeline), via its folder. */
export async function getPolicyAutomation(
  folderId: string,
): Promise<AutomationConfig | null> {
  const folder = await watchedFolderStorage.getFolder(folderId);
  if (!folder) return null;
  return automationStorage.getAutomation(folder.automationId);
}

/** Replace the policy's steps by updating its backing automation. */
export async function updatePolicyOperations(
  folderId: string,
  operations: AutomationOperation[],
): Promise<void> {
  const folder = await watchedFolderStorage.getFolder(folderId);
  if (!folder) return;
  const automation = await automationStorage.getAutomation(folder.automationId);
  if (!automation) return;
  await automationStorage.updateAutomation({ ...automation, operations });
}

/** Apply output + retry settings to the policy's backing folder. */
export async function updatePolicyFolderSettings(
  folderId: string,
  settings: PolicyFolderSettings,
): Promise<void> {
  const folder = await watchedFolderStorage.getFolder(folderId);
  if (!folder) return;
  await watchedFolderStorage.updateFolder({ ...folder, ...settings });
}

/** Pause/resume the policy by toggling its backing folder's paused flag. */
export async function setPolicyFolderPaused(
  folderId: string,
  paused: boolean,
): Promise<void> {
  const folder = await watchedFolderStorage.getFolder(folderId);
  if (!folder) return;
  await watchedFolderStorage.updateFolder({ ...folder, isPaused: paused });
}

/** Delete the policy's backing folder and its automation. */
export async function deletePolicyFolder(folderId: string): Promise<void> {
  const folder = await watchedFolderStorage.getFolder(folderId);
  if (folder) {
    await automationStorage.deleteAutomation(folder.automationId);
  }
  await watchedFolderStorage.deleteFolder(folderId);
}
