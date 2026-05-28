package stirling.software.saas.payg.policy;

import org.springframework.context.ApplicationEvent;

/**
 * Fires when a {@code pricing_policy*} or {@code payg_team_extensions.pricing_policy_id} row
 * changes — published by the Postgres LISTEN runner (see {@link PolicyChangeListener}) or by admin
 * REST mutations directly. {@link PricingPolicyService} listens and invalidates its cache.
 *
 * <p>The {@code payload} echoes whatever the {@code pg_notify} channel carried (kept loose because
 * the invalidation strategy is "blow the whole cache" — payload detail doesn't change behaviour).
 * Field is exposed for logging/observability only.
 */
public class PolicyChangedEvent extends ApplicationEvent {

    private static final long serialVersionUID = 1L;

    private final String payload;

    public PolicyChangedEvent(Object source, String payload) {
        super(source);
        this.payload = payload;
    }

    public String getPayload() {
        return payload;
    }
}
