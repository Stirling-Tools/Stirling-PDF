package stirling.software.saas.payg.policy;

import org.springframework.context.ApplicationEvent;

/**
 * Fires after a successful admin write to a {@code pricing_policy*} or {@code
 * payg_team_extensions.pricing_policy_id} row. {@link PricingPolicyService} listens and invalidates
 * its in-process cache so the writer instance reflects the change immediately. Other instances pick
 * up the change on the next 30-second TTL expiry.
 *
 * <p>{@code payload} is informational only ({@code "create:42"}, {@code "setDefault:7"}, etc.) —
 * the invalidation strategy is "blow the whole cache" regardless of what changed.
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
