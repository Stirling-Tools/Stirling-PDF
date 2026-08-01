package stirling.software.saas.payg.model;

/**
 * Where a tool invocation originated on the client side. <strong>Caller surface only</strong> —
 * this enum does not encode whether the request was served by SaaS or by a self-hosted instance.
 * That distinction lives at the team / policy level: self-hosted instances bind to their own team
 * (via {@code license_keys.team_id}) which carries its own {@code pricing_policy_id}.
 *
 * <p>Used as the key for per-source step limits on {@code pricing_policy.step_limits}.
 */
public enum JobSource {
    WEB,
    API,
    PIPELINE,
    /**
     * The Tauri desktop client. Independent of whether it routes to SaaS or a self-hosted backend.
     */
    DESKTOP_APP,
    /**
     * Usage reported by a linked self-hosted instance via the daily sync (combined-billing "Mode
     * A"). The per-request surface is lost in the aggregate — the instance reports cumulative units
     * per {@code BillingCategory} — so this just marks the charge as instance-synced. No per-source
     * step limit is seeded for it; the charge path's fallback applies.
     */
    LINKED_INSTANCE
}
