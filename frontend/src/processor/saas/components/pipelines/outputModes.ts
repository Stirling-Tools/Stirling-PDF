import { availableOutputModes as modes } from "@editor/policies/outputModes";

/** Hosted processing can deliver only to remote destinations. */
export function availableOutputModes() {
  return modes(true);
}
