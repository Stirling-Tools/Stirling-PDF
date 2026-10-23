/**
 * Whether the settings page shows the signed-in account card under General
 * (`general#account`). Each build decides through its settings nav; search
 * asks here so it never links to a card the page won't render. Core has no
 * account card.
 */
export function useAccountCardShown(): boolean {
  return false;
}
