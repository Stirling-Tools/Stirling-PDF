package stirling.software.proprietary.policy.model;

/**
 * How a policy run was started. The review bucket only guards {@link #SOURCE} runs: files pulled
 * from a source are auto-processed with nobody watching, so holds surface in the portal review
 * queue. An {@link #EDITOR} upload has its user right there — failures are reviewed in the editor
 * instead — and {@link #AD_HOC} pipelines have no stored policy to configure review against.
 */
public enum RunOrigin {
    EDITOR,
    SOURCE,
    AD_HOC
}
