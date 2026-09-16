/** Writable destination types, matching the server's hosted filesystem restriction. */
export function availableOutputModes(hosted = false): ("folder" | "s3")[] {
  return hosted ? ["s3"] : ["folder", "s3"];
}
