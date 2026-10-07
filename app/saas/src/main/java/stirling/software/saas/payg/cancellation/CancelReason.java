package stirling.software.saas.payg.cancellation;

import java.util.Arrays;
import java.util.Optional;

/**
 * Why a customer cancels, as the in-app cancel dialog offers it. Each maps onto Stripe's coarser
 * {@code cancellation_details.feedback} enum for Stripe's reports; the code and label go into
 * subscription metadata so the churn notification can say exactly what was picked.
 */
public enum CancelReason {
    TOO_EXPENSIVE("too_expensive", "too_expensive", "It costs too much"),
    UNUSED("unused", "unused", "We don't use it enough"),
    MISSING_FEATURES("missing_features", "missing_features", "It's missing something we need"),
    NOT_WORKING("not_working", "low_quality", "Something isn't working"),
    TOO_COMPLEX("too_complex", "too_complex", "It's too hard to set up or use"),
    SWITCHED_SERVICE("switched_service", "switched_service", "We're switching to another tool"),
    TEMPORARY("temporary", "unused", "We only needed it for a project"),
    SUPPORT("support", "customer_service", "Support didn't solve our problem"),
    OTHER("other", "other", "Something else");

    private final String code;
    private final String stripeFeedback;
    private final String label;

    CancelReason(String code, String stripeFeedback, String label) {
        this.code = code;
        this.stripeFeedback = stripeFeedback;
        this.label = label;
    }

    public String code() {
        return code;
    }

    public String stripeFeedback() {
        return stripeFeedback;
    }

    public String label() {
        return label;
    }

    public static Optional<CancelReason> fromCode(String code) {
        return Arrays.stream(values()).filter(r -> r.code.equals(code)).findFirst();
    }
}
