package stirling.software.saas.procurement.service;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.saas.procurement.model.ProcurementDeal;
import stirling.software.saas.procurement.model.ProcurementQuote;
import stirling.software.saas.procurement.repository.ProcurementDealRepository;
import stirling.software.saas.procurement.repository.ProcurementQuoteRepository;

/** Resolves time-bounded Enterprise access independently of the procurement journey stage. */
@Service
@Profile("saas")
@RequiredArgsConstructor
public class EnterpriseEntitlementService {
    private final ProcurementDealRepository deals;
    private final ProcurementQuoteRepository quotes;

    /** Commercial quantities describe the agreement; they never gate processing or admission. */
    public record Entitlement(
            String status,
            LocalDateTime periodStart,
            LocalDateTime periodEnd,
            LocalDateTime accessUntil,
            Integer agreedSeats,
            Long annualVolume) {}

    /**
     * Reads current access without caching so expiry and staff changes apply on the next request.
     */
    @Transactional(readOnly = true)
    public Optional<Entitlement> findActive(Long teamId) {
        if (teamId == null) return Optional.empty();
        return deals.findByTeamId(teamId)
                .flatMap(deal -> resolve(deal, LocalDateTime.now(ZoneOffset.UTC)));
    }

    /** Used by charging and feature gates; quantities in the quote do not restrict access. */
    public boolean isActive(Long teamId) {
        return findActive(teamId).isPresent();
    }

    Optional<Entitlement> resolve(ProcurementDeal deal, LocalDateTime now) {
        if (deal.getEnterprisePeriodStart() != null) {
            if (!contains(deal.getEnterprisePeriodStart(), deal.getEnterpriseAccessUntil(), now)) {
                return Optional.empty();
            }
            ProcurementQuote quote =
                    deal.getAcceptedQuoteId() == null
                            ? null
                            : quotes.findById(deal.getAcceptedQuoteId())
                                    .filter(q -> deal.getDealId().equals(q.getDealId()))
                                    .orElse(null);
            if (quote == null || deal.getEnterprisePeriodEnd() == null) return Optional.empty();
            return Optional.of(
                    new Entitlement(
                            ProcurementDeal.STAGE_LIVE.equals(deal.getStage())
                                    ? "active"
                                    : "payment_pending",
                            deal.getEnterprisePeriodStart(),
                            deal.getEnterprisePeriodEnd(),
                            deal.getEnterpriseAccessUntil(),
                            quote.getSeats(),
                            quote.getVolume()));
        }
        if (contains(deal.getTrialStartedAt(), deal.getTrialEndsAt(), now)) {
            return Optional.of(
                    new Entitlement(
                            "trial",
                            deal.getTrialStartedAt(),
                            deal.getTrialEndsAt(),
                            deal.getTrialEndsAt(),
                            null,
                            null));
        }
        return Optional.empty();
    }

    private static boolean contains(LocalDateTime start, LocalDateTime end, LocalDateTime now) {
        return start != null && end != null && !now.isBefore(start) && now.isBefore(end);
    }
}
