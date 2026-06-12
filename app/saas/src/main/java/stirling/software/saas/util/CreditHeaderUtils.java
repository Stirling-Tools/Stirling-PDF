package stirling.software.saas.util;

import java.util.Optional;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.TeamCredit;
import stirling.software.saas.model.UserCredit;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.SaasTeamExtensionService;
import stirling.software.saas.service.TeamCreditService;

/**
 * Resolves the user's remaining credit balance. Uses the team pool for non-personal team members,
 * otherwise the user's individual credits (looked up by Supabase ID or API key).
 */
@ApplicationScoped
@IfBuildProfile("saas")
@RequiredArgsConstructor
@Slf4j
public class CreditHeaderUtils {

    private final SaasTeamExtensionService saasTeamExtensionService;

    /**
     * Get the remaining credits for a user, checking team credits first (non-personal teams only).
     *
     * @param user The user whose credits to check
     * @param creditService The credit service to fetch user credits
     * @param teamCreditService The team credit service to fetch team credits
     * @return The remaining credit balance, or -1 if credits cannot be determined
     */
    public int getRemainingCredits(
            User user, CreditService creditService, TeamCreditService teamCreditService) {
        try {
            // Limited-API users always read personal credits.
            boolean isLimitedApiUser =
                    user.getAuthorities().stream()
                            .anyMatch(
                                    authority ->
                                            "ROLE_LIMITED_API_USER".equals(authority.getAuthority())
                                                    || "ROLE_EXTRA_LIMITED_API_USER"
                                                            .equals(authority.getAuthority()));

            Long targetTeamId = null;
            if (!isLimitedApiUser
                    && user.getTeam() != null
                    && !saasTeamExtensionService.isPersonal(user.getTeam())) {
                targetTeamId = user.getTeam().getId();
            }

            if (targetTeamId != null) {
                return teamCreditService
                        .getTeamCredits(targetTeamId)
                        .map(TeamCredit::getTotalAvailableCredits)
                        .orElse(-1);
            } else {
                log.debug(
                        "[CREDIT-HEADER] Getting personal credits - SupabaseId: {}, ApiKey: {}, Username: {}",
                        user.getSupabaseId(),
                        user.getApiKey() != null ? "present" : "null",
                        user.getUsername());

                Optional<UserCredit> credits;
                if (user.getSupabaseId() != null) {
                    credits =
                            creditService.getUserCreditsBySupabaseId(
                                    user.getSupabaseId().toString());
                    log.debug(
                            "[CREDIT-HEADER] Looked up by SupabaseId - Found: {}",
                            credits.isPresent());
                } else if (user.getApiKey() != null) {
                    credits = creditService.getUserCreditsByApiKey(user.getApiKey());
                    log.debug(
                            "[CREDIT-HEADER] Looked up by ApiKey - Found: {}", credits.isPresent());
                } else {
                    log.warn(
                            "[CREDIT-HEADER] No SupabaseId or ApiKey for user: {}",
                            user.getUsername());
                    return -1;
                }

                int remaining = credits.map(UserCredit::getTotalAvailableCredits).orElse(-1);
                log.debug("[CREDIT-HEADER] Returning credits: {}", remaining);
                return remaining;
            }
        } catch (Exception e) {
            log.warn("[CREDIT-HEADER] Could not get remaining credits: {}", e.getMessage(), e);
            return -1;
        }
    }
}
