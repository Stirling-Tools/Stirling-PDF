import type { CloudOrigin } from "@editor/types/file";

const origins = new WeakMap<File, CloudOrigin>();

export function rememberCloudOrigin(file: File, origin: CloudOrigin): void {
  origins.set(file, origin);
}

export function cloudOriginOf(file: File): CloudOrigin | undefined {
  return origins.get(file);
}
