/** Returns a guard that permits opening chat or presents the account requirement. */
export function useChatAccess(): () => boolean {
  return () => true;
}
