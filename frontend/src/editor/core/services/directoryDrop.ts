import type { PickedDirectory } from "@app/services/directoryPicker";

export const canDropDirectory = false;

/** Captures one dropped directory without reading or persisting its contents; null rejects the drop. */
export async function directoryFromDrop(
  _dataTransfer: DataTransfer,
): Promise<PickedDirectory | null> {
  return null;
}
