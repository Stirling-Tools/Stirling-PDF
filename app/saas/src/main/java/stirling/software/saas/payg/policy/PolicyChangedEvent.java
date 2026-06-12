package stirling.software.saas.payg.policy;

/**
 * Fires after a successful admin write to a {@code pricing_policy*} or {@code
 * payg_team_extensions.pricing_policy_id} row. {@link PricingPolicyService} listens and invalidates
 * its in-process cache so the writer instance reflects the change immediately. Other instances pick
 * up the change on the next 30-second TTL expiry.
 *
 * <p>{@code payload} is informational only ({@code "create:42"}, {@code "setDefault:7"}, etc.) —
 * the invalidation strategy is "blow the whole cache" regardless of what changed.
 */
// TODO: Migration required - was a Spring ApplicationEvent subclass. Converted to a plain POJO CDI
// event (no `extends ApplicationEvent`, no super(source) call). The `source` is retained as a plain
// field so the existing (Object source, String payload) constructor used by PricingPolicyService
// stays source-compatible.
public class PolicyChangedEvent {

    private final transient Object source;
    private final String payload;

    public PolicyChangedEvent(Object source, String payload) {
        this.source = source;
        this.payload = payload;
    }

    public Object getSource() {
        return source;
    }

    public String getPayload() {
        return payload;
    }
}
