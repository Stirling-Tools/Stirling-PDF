/** Absolute path to the user's Downloads folder, or null where this build cannot see a filesystem.
 *  Hazard: readDiskFile refuses paths outside a mounted directory, so mount this before reading. */
export async function getDownloadsDirectory(): Promise<string | null> {
  return null;
}
