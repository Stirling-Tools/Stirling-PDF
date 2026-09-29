/** Import provenance follows the File instance: metadata keys can collide across folders. */
export const pendingFilePathMappings = new WeakMap<
  File,
  string | Promise<string | undefined>
>();
