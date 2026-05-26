package stirling.software.saas.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.billing.service.StripeUsageReportingService;
import stirling.software.saas.config.CreditsProperties;
import stirling.software.saas.model.CreditConsumptionResult;
import stirling.software.saas.model.TeamCredit;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.repository.TeamCreditRepository;
import stirling.software.saas.repository.TeamMembershipRepository;

/**
 * Service for managing team credit pools. Handles credit initialization, consumption, and cycle
 * resets for teams.
 */
@Service
@Profile("saas")
@RequiredArgsConstructor
@Slf4j
public class TeamCreditService {

    private final TeamCreditRepository teamCreditRepository;
    private final TeamMembershipRepository membershipRepository;
    private final CreditsProperties creditsProperties;
    private final StripeUsageReportingService stripeUsageReportingService;
    private final SaasUserExtensionService saasUserExtensionService;

    /** Initialise a fixed PRO credit allocation for a new team. */
    @Transactional
    public TeamCredit initializeTeamCredits(Team team, User primaryUser) {
        Optional<TeamCredit> existing = teamCreditRepository.findByTeamId(team.getId());
        if (existing.isPresent()) {
            log.debug("Team credits already exist for team {}", team.getId());
            return existing.get();
        }

        TeamCredit credits = new TeamCredit(team);

        // Fixed PRO allocation; seat-independent.
        int proAllocation =
                creditsProperties.getCycle().getAllocations().getOrDefault("ROLE_PRO_USER", 500);
        int totalCycleAllocation = proAllocation;

        credits.setCycleCreditsAllocated(totalCycleAllocation);
        credits.setCycleCreditsRemaining(totalCycleAllocation);
        credits.setLastCycleResetAt(LocalDateTime.now());

        TeamCredit saved = teamCreditRepository.save(credits);
        log.info(
                "Initialized team credits for team {} with {} cycle credits (fixed PRO amount)",
                team.getId(),
                totalCycleAllocation);
        return saved;
    }

    /**
     * Check if team has credits available
     *
     * @param teamId the team ID
     * @return true if team has credits available
     */
    public boolean hasCreditsAvailable(Long teamId) {
        return teamCreditRepository
                .findByTeamId(teamId)
                .map(TeamCredit::hasCreditsAvailable)
                .orElse(false);
    }

    /**
     * Atomically consume credits from team pool
     *
     * @param teamId the team ID
     * @param amount number of credits to consume
     * @return true if credits were consumed, false if insufficient credits or version conflict
     */
    @Transactional
    public boolean consumeCredit(Long teamId, int amount) {
        int rowsUpdated = teamCreditRepository.consumeCredit(teamId, amount);
        if (rowsUpdated == 0) {
            log.warn(
                    "Failed to consume {} credits for team {} (insufficient credits or version conflict)",
                    amount,
                    teamId);
            return false;
        }
        log.debug("Consumed {} credits for team {}", amount, teamId);
        return true;
    }

    /**
     * Get team credit summary for a user's team.
     *
     * @param user the user
     * @return Optional of TeamCredit for the user's team
     */
    public Optional<TeamCredit> getCreditSummaryForUser(User user) {
        if (user.getTeam() == null) {
            log.warn("User {} has no team assigned", user.getId());
            return Optional.empty();
        }

        Long teamId = user.getTeam().getId();
        log.debug("Using user's team {} for credit summary", teamId);
        return teamCreditRepository.findByTeamId(teamId);
    }

    /**
     * Get team credits by team ID
     *
     * @param teamId the team ID
     * @return Optional of TeamCredit
     */
    public Optional<TeamCredit> getTeamCredits(Long teamId) {
        return teamCreditRepository.findByTeamId(teamId);
    }

    /**
     * Add bought credits to team pool
     *
     * @param teamId the team ID
     * @param credits number of credits to add
     */
    @Transactional
    public void addBoughtCredits(Long teamId, int credits) {
        TeamCredit teamCredit =
                teamCreditRepository
                        .findByTeamId(teamId)
                        .orElseThrow(() -> new IllegalArgumentException("Team credits not found"));

        teamCredit.addBoughtCredits(credits);
        teamCreditRepository.save(teamCredit);
        log.info("Added {} bought credits to team {}", credits, teamId);
    }

    /**
     * Reset cycle credits for team
     *
     * @param teamId the team ID
     * @param cycleAllocation new cycle allocation
     * @param resetTime reset timestamp
     */
    @Transactional
    public void resetCycleCredits(Long teamId, int cycleAllocation, LocalDateTime resetTime) {
        TeamCredit teamCredit =
                teamCreditRepository
                        .findByTeamId(teamId)
                        .orElseThrow(() -> new IllegalArgumentException("Team credits not found"));

        teamCredit.resetCycleCredits(cycleAllocation, resetTime);
        teamCreditRepository.save(teamCredit);
        log.info("Reset cycle credits for team {} to {}", teamId, cycleAllocation);
    }

    /**
     * Consume from the team credit pool; falls through to the team leader's metered Stripe billing
     * when the pool is exhausted.
     */
    @Transactional
    public CreditConsumptionResult consumeCreditWithWaterfall(Long teamId, int amount) {
        log.debug("[TEAM-CREDIT] Starting consumption for team {} - amount: {}", teamId, amount);

        // Step 1: Try consuming from team credit pool
        int rowsUpdated = teamCreditRepository.consumeCredit(teamId, amount);
        if (rowsUpdated == 1) {
            log.info("[TEAM-CREDIT] Consumed {} credits from team {} pool", amount, teamId);
            return CreditConsumptionResult.success("TEAM_CREDITS");
        }

        log.warn("[TEAM-CREDIT] Team {} credit pool exhausted; checking leader overage", teamId);

        // Step 2: Get team leader
        Optional<User> leaderOpt = getTeamLeader(teamId);
        if (leaderOpt.isEmpty()) {
            log.error("[TEAM-CREDIT] Team {} has no leader; cannot use overage billing", teamId);
            return CreditConsumptionResult.failure("NO_TEAM_LEADER");
        }

        User teamLeader = leaderOpt.get();

        // Step 3: Check if team leader has metered billing enabled
        if (!saasUserExtensionService.isMeteredBillingEnabled(teamLeader)) {
            log.warn(
                    "[TEAM-CREDIT] Team {} leader {} does not have metered billing enabled",
                    teamId,
                    teamLeader.getUsername());
            return CreditConsumptionResult.failure(
                    "TEAM_CREDITS_EXHAUSTED_NO_OVERAGE",
                    "Team credits exhausted. Team leader must enable overage billing for"
                            + " uninterrupted service.");
        }

        // Step 4: Report overage to Stripe via team leader's metered billing
        String leaderSupabaseId =
                teamLeader.getSupabaseId() != null ? teamLeader.getSupabaseId().toString() : null;

        if (leaderSupabaseId == null) {
            log.error("[TEAM-CREDIT] Team leader {} has no Supabase ID", teamLeader.getUsername());
            return CreditConsumptionResult.failure("LEADER_NO_SUPABASE_ID");
        }

        try {
            String operationId = org.slf4j.MDC.get("requestId");
            if (operationId == null || operationId.isBlank()) {
                operationId = java.util.UUID.randomUUID().toString();
            }
            String idempotencyKey =
                    stripeUsageReportingService.generateIdempotencyKey(
                            leaderSupabaseId, amount, operationId);

            log.info(
                    "[TEAM-CREDIT] Reporting {} overage credits to Stripe for team {} leader {}",
                    amount,
                    teamId,
                    teamLeader.getUsername());

            boolean reported =
                    stripeUsageReportingService.reportUsageToStripe(
                            leaderSupabaseId, amount, idempotencyKey);

            if (reported) {
                log.info(
                        "[TEAM-CREDIT] Successfully reported {} overage credits for team {} via"
                                + " leader {}",
                        amount,
                        teamId,
                        teamLeader.getUsername());
                return CreditConsumptionResult.success("TEAM_LEADER_METERED");
            } else {
                log.error("[TEAM-CREDIT] Failed to report overage to Stripe for team {}", teamId);
                return CreditConsumptionResult.failure(
                        "STRIPE_REPORTING_FAILED",
                        "Unable to report usage to Stripe. Please try again.");
            }
        } catch (Exception e) {
            log.error(
                    "[TEAM-CREDIT] Exception reporting overage for team {}: {}",
                    teamId,
                    e.getMessage(),
                    e);
            return CreditConsumptionResult.failure(
                    "STRIPE_REPORTING_ERROR", "Error reporting usage: " + e.getMessage());
        }
    }

    /** Returns the team's LEADER (first one if multiple exist) for overage-billing routing. */
    private Optional<User> getTeamLeader(Long teamId) {
        List<TeamMembership> leaders =
                membershipRepository.findByTeamIdAndRole(teamId, TeamRole.LEADER);

        if (leaders.isEmpty()) {
            log.warn("Team {} has no leaders", teamId);
            return Optional.empty();
        }

        // Return first leader (typically only one leader per team)
        TeamMembership leader = leaders.get(0);
        User leaderUser = leader.getUser();
        log.debug(
                "Found team {} leader: {} (user ID: {})",
                teamId,
                leaderUser.getUsername(),
                leaderUser.getId());

        return Optional.of(leaderUser);
    }
}
