package stirling.software.saas.model;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * Result of a credit consumption attempt with explicit waterfall logic. Indicates whether the
 * operation succeeded and which credit source was used.
 */
@Data
@AllArgsConstructor
public class CreditConsumptionResult {

    /** Whether the credit consumption succeeded */
    private boolean success;

    /**
     * The credit source used for this operation. Possible values: "PRO_PLAN" (Pro user with
     * unlimited UI access, no credits consumed); "CYCLE_CREDITS" (free monthly cycle credit
     * allocation); "BOUGHT_CREDITS" (one-time purchased credits); "METERED_SUBSCRIPTION"
     * (pay-what-you-use metered billing, reported to Stripe); null (operation failed; see message
     * for reason).
     */
    private String source;

    /** Human-readable message about the result */
    private String message;

    /**
     * Creates a successful result for unlimited access (Pro plan UI requests).
     *
     * @param source The credit source (typically "PRO_PLAN")
     * @return CreditConsumptionResult indicating unlimited access
     */
    public static CreditConsumptionResult unlimited(String source) {
        return new CreditConsumptionResult(true, source, "Unlimited access");
    }

    /**
     * Creates a successful result for credit consumption.
     *
     * @param source The credit source used
     * @return CreditConsumptionResult indicating success
     */
    public static CreditConsumptionResult success(String source) {
        return new CreditConsumptionResult(true, source, "Credits consumed");
    }

    /**
     * Creates a failure result.
     *
     * @param reason The reason for failure
     * @return CreditConsumptionResult indicating failure
     */
    public static CreditConsumptionResult failure(String reason) {
        return new CreditConsumptionResult(false, null, reason);
    }

    /**
     * Creates a failure result with custom message.
     *
     * @param reason The reason code
     * @param message Custom human-readable message
     * @return CreditConsumptionResult indicating failure
     */
    public static CreditConsumptionResult failure(String reason, String message) {
        return new CreditConsumptionResult(false, null, message != null ? message : reason);
    }
}
