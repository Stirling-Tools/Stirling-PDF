/** Writable destination types, matching the server's hosted filesystem restriction. */
export function availableOutputModes(
  hosted = false,
): (
  | "folder"
  | "s3"
  | "onedrive"
  | "sharepoint"
  | "googledrive"
  | "vectordb"
)[] {
  const remote = [
    "s3",
    "onedrive",
    "sharepoint",
    "googledrive",
    "vectordb",
  ] as const;
  return hosted ? [...remote] : ["folder", ...remote];
}
