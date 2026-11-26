/**
 * `@tauri-apps/plugin-http` in the desktop Storybook build. The real plugin
 * streams each request over IPC to the native shell; the browser's own fetch
 * reaches the same URLs, so the MSW handlers every story already serves answer
 * desktop requests exactly as they answer the web build's.
 */
export function fetch(
  input: URL | Request | string,
  init?: RequestInit,
): Promise<Response> {
  return globalThis.fetch(input, init);
}
