export function getHeaderString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
