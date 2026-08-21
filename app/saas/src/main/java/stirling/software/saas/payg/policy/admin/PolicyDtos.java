package stirling.software.saas.payg.policy.admin;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.policy.PricingPolicy;

/**
 * Request/response DTOs for the pricing-policy admin endpoints. Records rather than the JPA entity
 * directly so the admin API surface is decoupled from internal columns (e.g. {@code @Version}
 * optimistic-lock fields, audit timestamps).
 */
final class PolicyDtos {

    private PolicyDtos() {}

    /** Outbound representation of a {@link PricingPolicy}. */
    record PolicyResponse(
            Long policyId,
            String version,
            LocalDateTime effectiveFrom,
            LocalDateTime effectiveTo,
            Integer docPagesPerUnit,
            Long docBytesPerUnit,
            Integer minChargeUnits,
            Integer fileUnitCap,
            Map<JobSource, Integer> stepLimits,
            Set<String> stripePriceIds,
            Boolean isDefault,
            String notes,
            String createdBy,
            LocalDateTime createdAt) {

        static PolicyResponse from(PricingPolicy p) {
            return new PolicyResponse(
                    p.getId(),
                    p.getVersion(),
                    p.getEffectiveFrom(),
                    p.getEffectiveTo(),
                    p.getDocPagesPerUnit(),
                    p.getDocBytesPerUnit(),
                    p.getMinChargeUnits(),
                    p.getFileUnitCap(),
                    // Copy the outer collections so a caller's mutation can't leak back into the
                    // cached entity. Values (Integer, String) are immutable, so a shallow copy is
                    // sufficient here.
                    new HashMap<>(p.getStepLimits()),
                    new HashSet<>(p.getStripePriceIds()),
                    p.getIsDefault(),
                    p.getNotes(),
                    p.getCreatedBy(),
                    p.getCreatedAt());
        }
    }

    /**
     * Inbound payload for {@code POST /policies}. {@code stepLimits} and {@code stripePriceIds}
     * default to empty collections if omitted. {@code effectiveFrom} defaults to {@code now()}.
     */
    record CreatePolicyRequest(
            String version,
            LocalDateTime effectiveFrom,
            LocalDateTime effectiveTo,
            Integer docPagesPerUnit,
            Long docBytesPerUnit,
            Integer minChargeUnits,
            Integer fileUnitCap,
            Map<JobSource, Integer> stepLimits,
            Set<String> stripePriceIds,
            String notes,
            String createdBy) {}

    /**
     * Inbound payload for {@code PUT /teams/{teamId}/policy-override}. {@code policyId = null}
     * clears the override (team falls back to default).
     */
    record TeamOverrideRequest(Long policyId) {}
}
