/**
 * Absolute path to the user's own Downloads folder, or null where this build cannot see a
 * filesystem or the OS reports no such directory.
 *
 * Null here: a web build has no machine to ask. Builds that can read the disk shadow this file.
 *
 * Hazard: {@link readDiskFile} refuses paths that sit outside a mounted directory, so a caller
 * that means to read what it finds must mount this path first.
 */
export async function getDownloadsDirectory(): Promise<string | null> {
  return null;
}
