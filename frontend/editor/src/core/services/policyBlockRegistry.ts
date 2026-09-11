/** Required-policy failures are provided by the policy-enabled layer. */
export function getPolicyBlock(_fileId: string): string | undefined {
  return undefined;
}

/** Whether a required policy currently blocks this file, so it must not export. */
export function isFileBlocked(fileId: string): boolean {
  return getPolicyBlock(fileId) !== undefined;
}
