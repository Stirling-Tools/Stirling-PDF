package stirling.software.saas.payg.model;

/**
 * Whether a team's tool calls auto-group into multi-step processes via content-hash lineage. {@code
 * OFF} forces every call into its own single-step process.
 */
public enum AutoGroupStrategy {
    AUTO,
    OFF
}
