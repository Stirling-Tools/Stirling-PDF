package stirling.software.proprietary.storage.egress;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** A sharing policy refused this egress; names the rule that stopped them. */
public class ShareEgressException extends ResponseStatusException {

    private final transient String policyId;

    public ShareEgressException(ShareEgressDecision decision) {
        super(HttpStatus.FORBIDDEN, message(decision));
        this.policyId = decision.policyId();
    }

    public String getPolicyId() {
        return policyId;
    }

    private static String message(ShareEgressDecision decision) {
        String reason = decision.reason() == null ? "Sharing is not permitted" : decision.reason();
        return decision.policyName() == null
                ? reason
                : reason + " (blocked by the \"" + decision.policyName() + "\" policy)";
    }
}
