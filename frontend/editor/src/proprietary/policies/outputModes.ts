/** Writable destination types, matching the server's hosted filesystem restriction. */
export function availableOutputModes(hosted = false): ("folder" | "s3" | "vectordb")[] {
  return hosted ? ["s3", "vectordb"] : ["folder", "s3", "vectordb"];
}
