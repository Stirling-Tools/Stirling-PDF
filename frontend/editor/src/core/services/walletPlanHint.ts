const KEY = "stirling.wallet.metered";

/**
 * Remembers whether the last wallet this browser saw was on a paid plan, so the
 * sidebar footer knows — before any request finishes — whether to reserve space
 * for the free-credits row. Without it a free team gets a row that pops in and
 * shoves the account row down, and a paying team gets one that appears and then
 * vanishes.
 *
 * Deliberately a layout hint, not a cache: it holds no figures and nothing is
 * gated on it. The live wallet overwrites it on every load, so a wrong guess
 * costs one reflow and self-corrects. It isn't scoped per user for the same
 * reason — two accounts sharing a browser can at worst mis-reserve a row until
 * the wallet lands.
 */
export function readWalletIsMetered(): boolean | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? null : raw === "true";
  } catch {
    // Private mode / storage disabled: no hint, so the row waits for the wallet.
    return null;
  }
}

export function writeWalletIsMetered(metered: boolean): void {
  try {
    localStorage.setItem(KEY, String(metered));
  } catch {
    // Nothing to do — the hint is an optimisation, never a correctness input.
  }
}
