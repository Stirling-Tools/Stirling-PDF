package stirling.software.saas.payg.model;

/** Which charging engine a wallet is running. Flipped per-team during cutover. */
public enum WalletEngine {
    LEGACY,
    PAYG_SHADOW,
    PAYG
}
