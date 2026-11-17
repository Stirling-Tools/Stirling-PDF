/**
 * Link to a page of a Stirling web app, for handing to the system browser.
 * `path` is joined under `base`'s own path, so a sub-path deployment such as
 * `https://stirling.com/app` keeps its prefix. Query, hash and credentials on
 * `base` are dropped. Throws when `base` is missing or not http(s).
 */
export function webPageUrl(base: string | undefined, path: string): string {
  if (!base) throw new Error("Web app URL unavailable");
  const url = new URL(base);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Invalid web app URL");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  url.search = "";
  url.hash = "";
  url.username = "";
  url.password = "";
  return url.href;
}
