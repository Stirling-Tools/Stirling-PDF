/**
 * Feature detection for the File System Access API.
 *
 * Browser support matrix (as of 2025):
 *   Chrome/Edge: full support — showDirectoryPicker, createWritable, queryPermission
 *   Firefox:     showDirectoryPicker + read-only iteration only; no createWritable, no queryPermission
 *   Safari 15.2+: showDirectoryPicker + read only; no createWritable
 */

/** True when the browser can pick a directory and read files from it. */
export const canReadLocalFolder: boolean =
  typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';

/** True when the browser supports writing files (createWritable). Requires Chrome/Edge. */
export const canWriteLocalFolder: boolean =
  canReadLocalFolder &&
  typeof FileSystemFileHandle !== 'undefined' &&
  typeof (FileSystemFileHandle.prototype as any).createWritable === 'function';

/** True when the browser supports permission querying across sessions (queryPermission). */
export const canPersistFsPermission: boolean =
  canReadLocalFolder &&
  typeof FileSystemHandle !== 'undefined' &&
  typeof (FileSystemHandle.prototype as any).queryPermission === 'function';

export const FS_READ_UNSUPPORTED_MSG =
  'Your browser does not support the File System Access API. Use Chrome or Edge.';

export const FS_WRITE_UNSUPPORTED_MSG =
  'Your browser cannot write to local folders. Use Chrome or Edge for this feature.';
