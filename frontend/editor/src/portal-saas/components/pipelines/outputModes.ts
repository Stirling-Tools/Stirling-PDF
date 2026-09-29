import { availableOutputModes as modes } from "@app/policies/outputModes";

/** Hosted processing can deliver only to remote destinations. */
export function availableOutputModes() {
  return modes(true);
}
