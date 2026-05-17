package stirling.software.saas.service;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.billing.service.StripeUsageReportingService;
import stirling.software.saas.config.CreditsProperties;
import stirling.software.saas.model.CreditConsumptionResult;
import stirling.software.saas.model.TeamCredit;
import stirling.software.saas.model.UserCredit;
import stirling.software.saas.repository.TeamCreditRepository;
import stirling.software.saas.repository.UserCreditRepository;
import stirling.software.saas.util.LogRedactionUtils;

@Service
@Profile("saas")
@Slf4j
@Transactional
public class CreditService {

    private final UserCreditRepository userCreditRepository;
    private final TeamCreditRepository teamCreditRepository;
    private final UserRepository userRepository;
    private final UserService userService;
    private final CreditsProperties creditsProperties;
    private final TeamCreditService teamCreditService;
    private final StripeUsageReportingService stripeUsageReportingService;
    private final SaasUserExtensionService saasUserExtensionService;
    private final SaasTeamExtensionService saasTeamExtensionService;

    // Telemetry metrics
    private final Counter creditsConsumedCounter;
    private final Counter creditConsumptionFailuresCounter;
    private final Counter cycleResetCounter;

    public CreditService(
            UserCreditRepository userCreditRepository,
            TeamCreditRepository teamCreditRepository,
            UserRepository userRepository,
            UserService userService,
            CreditsProperties creditsProperties,
            TeamCreditService teamCreditService,
            StripeUsageReportingService stripeUsageReportingService,
            SaasUserExtensionService saasUserExtensionService,
            SaasTeamExtensionService saasTeamExtensionService,
            MeterRegistry meterRegistry) {
        this.userCreditRepository = userCreditRepository;
        this.teamCreditRepository = teamCreditRepository;
        this.userRepository = userRepository;
        this.userService = userService;
        this.creditsProperties = creditsProperties;
        this.teamCreditService = teamCreditService;
        this.stripeUsageReportingService = stripeUsageReportingService;
        this.saasUserExtensionService = saasUserExtensionService;
        this.saasTeamExtensionService = saasTeamExtensionService;

        // Initialize metrics
        this.creditsConsumedCounter =
                Counter.builder("credits.consumed")
                        .description("Number of credits consumed")
                        .register(meterRegistry);
        this.creditConsumptionFailuresCounter =
                Counter.builder("credits.consumption.failures")
                        .description("Number of failed credit consumption attempts")
                        .register(meterRegistry);
        this.cycleResetCounter =
                Counter.builder("credits.cycle_reset")
                        .description("Number of credit cycle resets performed")
                        .register(meterRegistry);

        // Active gauges for current credit levels
        Gauge.builder("credits.total_available", this, CreditService::getTotalAvailableCredits)
                .description("Total credits available across all users")
                .register(meterRegistry);
        Gauge.builder("credits.total_api_calls", this, CreditService::getTotalApiCalls)
                .description("Total API calls made across all users")
                .register(meterRegistry);
    }

    public Optional<UserCredit> getUserCreditsByApiKey(String apiKey) {
        return userCreditRepository.findByUserApiKey(apiKey);
    }

    public Optional<UserCredit> getUserCreditsBySupabaseId(String supabaseId) {
        try {
            UUID supabaseUuid = UUID.fromString(supabaseId);
            return userCreditRepository.findBySupabaseId(supabaseUuid);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid Supabase ID format: {}", supabaseId);
            return Optional.empty();
        }
    }

    public Optional<User> getUserBySupabaseId(UUID supabaseId) {
        return userService.findBySupabaseId(supabaseId);
    }

    public Optional<UserCredit> getUserCreditsFromAuthentication() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return Optional.empty();
        }

        if (authentication instanceof ApiKeyAuthenticationToken) {
            // API Key authentication: credit limits apply
            User user = (User) authentication.getPrincipal();
            return getUserCreditsByUserId(user.getId());
        } else if (authentication instanceof UsernamePasswordAuthenticationToken) {
            // JWT/Session authentication: unlimited for frontend users
            User user = (User) authentication.getPrincipal();
            return getUserCreditsByUserId(user.getId());
        }

        return Optional.empty();
    }

    public Optional<UserCredit> getUserCreditsByUserId(Long userId) {
        return userCreditRepository.findByUserId(userId);
    }

    public UserCredit getOrCreateUserCredits(User user) {
        Optional<UserCredit> existing = userCreditRepository.findByUser(user);
        if (existing.isPresent()) {
            UserCredit credits = existing.get();
            // Check if cycle reset is needed based on last scheduled reset
            LocalDateTime lastScheduledReset = getMostRecentScheduledReset();
            if (credits.isCycleResetDue(lastScheduledReset)) {
                int allocation = getCycleAllocationForUser(user);
                credits.resetCycleCredits(allocation, lastScheduledReset);
                return userCreditRepository.save(credits);
            }
            return credits;
        }

        // Create new credits for user with proper allocation
        UserCredit newCredits = new UserCredit(user);
        int allocation = getCycleAllocationForUser(user);
        newCredits.resetCycleCredits(allocation, LocalDateTime.now());
        return userCreditRepository.save(newCredits);
    }

    private LocalDateTime getMostRecentScheduledReset() {
        ZoneId configuredZone = ZoneId.of(creditsProperties.getReset().getZone());
        LocalDateTime now = LocalDateTime.now(configuredZone);
        ZonedDateTime zonedNow = now.atZone(configuredZone);

        // Extract hour from cron expression (format: "0 0 2 1 * *" -> hour is 2)
        String cronExpression = creditsProperties.getReset().getCron();
        int resetHour = extractHourFromCron(cronExpression);

        // Find first day of current month at the configured time
        ZonedDateTime firstOfMonth =
                zonedNow.withDayOfMonth(1)
                        .withHour(resetHour)
                        .withMinute(0)
                        .withSecond(0)
                        .withNano(0);

        // If we're on the 1st but before the reset hour, use previous month's first day
        if (zonedNow.getDayOfMonth() == 1 && zonedNow.getHour() < resetHour) {
            firstOfMonth = firstOfMonth.minusMonths(1);
        }
        // If we're before the 1st of this month, use previous month's first day
        else if (zonedNow.isBefore(firstOfMonth)) {
            firstOfMonth = firstOfMonth.minusMonths(1);
        }

        return firstOfMonth.toLocalDateTime();
    }

    private int extractHourFromCron(String cronExpression) {
        try {
            // Cron format: "second minute hour day month weekday"
            String[] parts = cronExpression.split("\\s+");
            if (parts.length >= 3) {
                return Integer.parseInt(parts[2]);
            }
        } catch (NumberFormatException e) {
            log.warn(
                    "Failed to parse hour from cron expression '{}', using default 2",
                    cronExpression);
        }
        return 2; // Default to 2 AM
    }

    public boolean hasCreditsAvailable(String apiKey) {
        Optional<UserCredit> credits = getUserCreditsByApiKey(apiKey);
        if (credits.isPresent()) {
            return credits.get().hasCreditsAvailable();
        }

        // Lazy create UserCredit for existing users who don't have rows yet
        Optional<User> userOpt = userRepository.findByApiKey(apiKey);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            UserCredit newCredits = getOrCreateUserCredits(user);
            return newCredits.hasCreditsAvailable();
        }

        // No user found with this API key
        return false;
    }

    public boolean consumeCredit(String apiKey, int creditAmount) {
        int rowsUpdated = userCreditRepository.consumeCredit(apiKey, creditAmount);

        if (rowsUpdated == 1) {
            creditsConsumedCounter.increment(creditAmount);
            if (log.isTraceEnabled()) {
                log.trace("{} credits consumed for API key: {}", creditAmount, maskApiKey(apiKey));
            }
            return true;
        }

        creditConsumptionFailuresCounter.increment();
        log.warn(
                "Credit consumption failed for API key: {} - insufficient credits (requested: {})",
                maskApiKey(apiKey),
                creditAmount);
        return false;
    }

    /** Consume credits for a user identified by Supabase ID; metered overage bills to Stripe. */
    public boolean consumeCreditBySupabaseId(String supabaseId, int creditAmount) {
        try {
            UUID supabaseUuid = UUID.fromString(supabaseId);
            log.debug(
                    "[CREDIT-CONSUME] Starting credit consumption for Supabase ID: {}, amount: {}",
                    supabaseId,
                    creditAmount);

            // Check if user is usage-based
            Optional<User> userOpt = userService.findBySupabaseId(supabaseUuid);

            if (userOpt.isEmpty()) {
                log.error("[CREDIT-CONSUME] User not found for Supabase ID: {}", supabaseId);
                creditConsumptionFailuresCounter.increment();
                return false;
            }

            User user = userOpt.get();
            boolean isUsageBased = hasMeteredBillingEnabled(user);
            log.info(
                    "[CREDIT-CONSUME] User {} - Metered billing enabled: {}, Roles: {}",
                    user.getUsername(),
                    isUsageBased,
                    user.getRolesAsString());

            if (isUsageBased) {
                // Metered billing: Try to consume free credits first, then report overage to Stripe
                UserCredit userCredits = getOrCreateUserCredits(user);

                log.info(
                        "[CREDIT-CONSUME] Metered billing user detected: {} - Cycle credits remaining: {}, Amount needed: {}",
                        user.getUsername(),
                        userCredits.getCycleCreditsRemaining(),
                        creditAmount);

                if (userCredits.getCycleCreditsRemaining() >= creditAmount) {
                    // Covered by free tier; consume normally
                    int rowsUpdated =
                            userCreditRepository.consumeCreditBySupabaseId(
                                    supabaseUuid, creditAmount);

                    if (rowsUpdated == 1) {
                        creditsConsumedCounter.increment(creditAmount);
                        if (log.isTraceEnabled()) {
                            log.trace(
                                    "[USAGE-BASED] {} credits consumed from free tier for user: {}",
                                    creditAmount,
                                    supabaseId);
                        }
                        return true;
                    }
                } else {
                    // Partial or full overage: consume free credits and report overage to Stripe
                    int freeCreditsUsed =
                            userCredits.getCycleCreditsRemaining() != null
                                    ? userCredits.getCycleCreditsRemaining()
                                    : 0;
                    int overageCredits = creditAmount - freeCreditsUsed;

                    log.warn(
                            "[CREDIT-CONSUME] OVERAGE DETECTED for user: {} - Free credits available: {}, Credits needed: {}, Overage: {}",
                            user.getUsername(),
                            freeCreditsUsed,
                            creditAmount,
                            overageCredits);

                    // Consume available free credits (if any)
                    if (freeCreditsUsed > 0) {
                        log.debug(
                                "[CREDIT-CONSUME] Consuming {} free credits first",
                                freeCreditsUsed);
                        int rowsUpdated =
                                userCreditRepository.consumeCreditBySupabaseId(
                                        supabaseUuid, freeCreditsUsed);
                        if (rowsUpdated != 1) {
                            log.warn(
                                    "[USAGE-BASED] Failed to consume {} free credits for user: {}",
                                    freeCreditsUsed,
                                    supabaseId);
                            creditConsumptionFailuresCounter.increment();
                            return false;
                        }
                    }

                    // Report overage to Stripe
                    String idempotencyKey =
                            stripeUsageReportingService.generateIdempotencyKey(supabaseId);

                    log.info(
                            "[CREDIT-CONSUME] Calling Stripe reporting service - User: {}, Overage credits: {}, Idempotency key: {}",
                            supabaseId,
                            overageCredits,
                            idempotencyKey);

                    boolean reported =
                            stripeUsageReportingService.reportUsageToStripe(
                                    supabaseId, overageCredits, idempotencyKey);

                    log.info(
                            "[CREDIT-CONSUME] Stripe reporting result: {} for user: {}",
                            reported ? "SUCCESS" : "FAILED",
                            supabaseId);

                    if (reported) {
                        creditsConsumedCounter.increment(creditAmount);
                        log.info(
                                "[USAGE-BASED] User {} consumed {} free + {} overage credits (total: {})",
                                supabaseId,
                                freeCreditsUsed,
                                overageCredits,
                                creditAmount);
                        return true;
                    } else {
                        log.error(
                                "[USAGE-BASED] Failed to report {} overage credits to Stripe for user: {}",
                                overageCredits,
                                supabaseId);
                        log.error(
                                "[USAGE-BASED] Throwing exception to fail the operation; metering must succeed");
                        creditConsumptionFailuresCounter.increment();
                        throw new RuntimeException(
                                "Unable to report usage to Stripe. Operation cannot proceed without metering. Please try again or contact support if the issue persists.");
                    }
                }

                // Free credits were sufficient; already consumed and returned above
                // If we reach here, there's a logic error
                log.error("[USAGE-BASED] Unexpected code path reached for user: {}", supabaseId);
                return false;
            }

            // Existing prepaid logic for Pro/Credit-Based users
            log.debug(
                    "[CREDIT-CONSUME] Non-usage-based user; using standard prepaid credit consumption");
            int rowsUpdated =
                    userCreditRepository.consumeCreditBySupabaseId(supabaseUuid, creditAmount);

            if (rowsUpdated == 1) {
                creditsConsumedCounter.increment(creditAmount);
                if (log.isTraceEnabled()) {
                    log.trace("{} credits consumed for Supabase ID: {}", creditAmount, supabaseId);
                }
                log.debug(
                        "[CREDIT-CONSUME] Standard credit consumption successful for user: {}",
                        supabaseId);
                return true;
            }

            creditConsumptionFailuresCounter.increment();
            log.warn(
                    "[CREDIT-CONSUME] Credit consumption failed for Supabase ID: {} - insufficient credits (requested: {})",
                    supabaseId,
                    creditAmount);
            return false;
        } catch (IllegalArgumentException e) {
            log.error(
                    "[CREDIT-CONSUME] Invalid Supabase ID format: {} - cannot consume credits",
                    supabaseId,
                    e);
            creditConsumptionFailuresCounter.increment();
            return false;
        } catch (RuntimeException e) {
            // Metering failures are critical and should fail the operation.
            // This ensures users aren't charged for operations that weren't metered.
            if (e.getMessage() != null
                    && e.getMessage().contains("Unable to report usage to Stripe")) {
                log.error(
                        "[CREDIT-CONSUME] Metering failure; rethrowing exception to fail operation");
                throw e;
            }

            // Other runtime exceptions are logged but don't fail the operation.
            // This prevents transient errors from blocking user operations.
            log.error(
                    "[CREDIT-CONSUME] Unexpected runtime error consuming credits for user: {} - {}",
                    supabaseId,
                    e.getMessage(),
                    e);
            creditConsumptionFailuresCounter.increment();
            return false;
        } catch (Exception e) {
            log.error(
                    "[CREDIT-CONSUME] Unexpected error consuming credits for user: {} - {}",
                    supabaseId,
                    e.getMessage(),
                    e);
            creditConsumptionFailuresCounter.increment();
            return false;
        }
    }

    /**
     * Checks if a user has metered billing enabled. For users with metered billing, credits are
     * billed on usage through Stripe metering rather than being allocated on a monthly cycle basis.
     *
     * @param user User to check
     * @return true if the user has metered billing enabled, false otherwise
     */
    private boolean hasMeteredBillingEnabled(User user) {
        return saasUserExtensionService.isMeteredBillingEnabled(user);
    }

    /** Check if a user has credits available by Supabase ID (unified approach). */
    public boolean hasCreditsAvailableBySupabaseId(String supabaseId) {
        Optional<UserCredit> credits = getUserCreditsBySupabaseId(supabaseId);
        if (credits.isPresent()) {
            return credits.get().hasCreditsAvailable();
        }

        // Lazy create UserCredit for existing users who don't have rows yet
        try {
            UUID supabaseUuid = UUID.fromString(supabaseId);
            Optional<User> userOpt = userService.findBySupabaseId(supabaseUuid);
            if (userOpt.isPresent()) {
                User user = userOpt.get();
                UserCredit newCredits = getOrCreateUserCredits(user);
                return newCredits.hasCreditsAvailable();
            }
        } catch (IllegalArgumentException e) {
            log.warn("Invalid Supabase ID format: {}", supabaseId);
        }

        // No user found with this Supabase ID
        return false;
    }

    public boolean isApiKeyAuthenticated() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication instanceof ApiKeyAuthenticationToken;
    }

    public boolean isJwtAuthenticated() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication instanceof UsernamePasswordAuthenticationToken;
    }

    public void addBoughtCredits(String username, int credits) {
        Optional<User> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            throw new IllegalArgumentException("User not found: " + username);
        }

        User user = userOpt.get();
        UserCredit userCredits = getOrCreateUserCredits(user);
        userCredits.addBoughtCredits(credits);
        userCreditRepository.save(userCredits);

        log.info(
                "Added {} bought credits to user: {}. Total available: {}",
                credits,
                username,
                userCredits.getTotalAvailableCredits());
    }

    public void setBoughtCredits(String username, int credits) {
        Optional<User> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            throw new IllegalArgumentException("User not found: " + username);
        }
        User user = userOpt.get();
        UserCredit userCredits = getOrCreateUserCredits(user);

        int previousBought = userCredits.getBoughtCreditsRemaining();
        userCredits.setBoughtCreditsRemaining(credits);
        userCredits.setTotalBoughtCredits(credits); // Also update total bought to match

        userCreditRepository.save(userCredits);
        log.info(
                "Set bought credits for user: {} from {} to {}. Total available: {}",
                username,
                previousBought,
                credits,
                userCredits.getTotalAvailableCredits());
    }

    public void setCycleCredits(String username, int credits) {
        Optional<User> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            throw new IllegalArgumentException("User not found: " + username);
        }
        User user = userOpt.get();
        UserCredit userCredits = getOrCreateUserCredits(user);

        int previousCycle = userCredits.getCycleCreditsRemaining();
        userCredits.setCycleCreditsRemaining(credits);

        userCreditRepository.save(userCredits);
        log.info(
                "Set cycle credits for user: {} from {} to {}. Total available: {}",
                username,
                previousCycle,
                credits,
                userCredits.getTotalAvailableCredits());
    }

    public void addBoughtCreditsBySupabaseId(String supabaseId, int credits) {
        UserCredit userCredits = getUserCreditsBySupabaseIdWithValidation(supabaseId);
        userCredits.addBoughtCredits(credits);
        userCreditRepository.save(userCredits);

        log.info(
                "Added {} bought credits to user with Supabase ID: {}. Total available: {}",
                credits,
                supabaseId,
                userCredits.getTotalAvailableCredits());
    }

    public void setBoughtCreditsBySupabaseId(String supabaseId, int credits) {
        UserCredit userCredits = getUserCreditsBySupabaseIdWithValidation(supabaseId);

        int previousBought = userCredits.getBoughtCreditsRemaining();
        userCredits.setBoughtCreditsRemaining(credits);
        userCredits.setTotalBoughtCredits(credits); // Also update total bought to match

        userCreditRepository.save(userCredits);
        log.info(
                "Set bought credits for user with Supabase ID: {} from {} to {}. Total available: {}",
                supabaseId,
                previousBought,
                credits,
                userCredits.getTotalAvailableCredits());
    }

    public void setCycleCreditsBySupabaseId(String supabaseId, int credits) {
        UserCredit userCredits = getUserCreditsBySupabaseIdWithValidation(supabaseId);

        int previousCycle = userCredits.getCycleCreditsRemaining();
        userCredits.setCycleCreditsRemaining(credits);

        userCreditRepository.save(userCredits);
        log.info(
                "Set cycle credits for user with Supabase ID: {} from {} to {}. Total available: {}",
                supabaseId,
                previousCycle,
                credits,
                userCredits.getTotalAvailableCredits());
    }

    public void resetCycleCreditsForAllUsers(LocalDateTime lastScheduledReset) {
        List<UserCredit> creditsNeedingReset =
                userCreditRepository.findCreditsNeedingCycleReset(lastScheduledReset);

        for (UserCredit credit : creditsNeedingReset) {
            int allocation = getCycleAllocationForUser(credit.getUser());
            credit.resetCycleCredits(allocation, lastScheduledReset);
            userCreditRepository.save(credit);
            cycleResetCounter.increment();
        }

        log.info(
                "Reset cycle credits for {} users based on scheduled reset time: {}",
                creditsNeedingReset.size(),
                lastScheduledReset);
    }

    // Backward compatibility method
    public void resetCycleCreditsForAllUsers() {
        LocalDateTime now = LocalDateTime.now();
        resetCycleCreditsForAllUsers(now);
    }

    public void resetCycleCreditsForAllTeams(LocalDateTime lastScheduledReset) {
        List<TeamCredit> creditsNeedingReset =
                teamCreditRepository.findCreditsNeedingCycleReset(lastScheduledReset);

        int proAllocation =
                creditsProperties.getCycle().getAllocations().getOrDefault("ROLE_PRO_USER", 500);
        int totalCycleAllocation = proAllocation;

        for (TeamCredit credit : creditsNeedingReset) {
            credit.resetCycleCredits(totalCycleAllocation, lastScheduledReset);
            teamCreditRepository.save(credit);
            cycleResetCounter.increment();

            log.info(
                    "Reset cycle credits for team {} to {} (fixed PRO amount)",
                    credit.getTeam().getId(),
                    totalCycleAllocation);
        }

        log.info(
                "Reset cycle credits for {} teams based on scheduled reset time: {}",
                creditsNeedingReset.size(),
                lastScheduledReset);
    }

    // Backward compatibility method
    public void resetCycleCreditsForAllTeams() {
        LocalDateTime now = LocalDateTime.now();
        resetCycleCreditsForAllTeams(now);
    }

    public CreditSummary getCreditSummary(String username) {
        // Note: This method is kept for admin functions that need to lookup users by username.
        Optional<User> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            log.warn("No user found with username: {}", username);
            return new CreditSummary();
        }

        User user = userOpt.get();
        UserCredit credits = getOrCreateUserCredits(user);
        boolean isUnlimited = credits.getCycleCreditsAllocated() == Integer.MAX_VALUE;
        return new CreditSummary(
                credits.getCycleCreditsRemaining(),
                credits.getCycleCreditsAllocated(),
                credits.getBoughtCreditsRemaining(),
                credits.getTotalBoughtCredits(),
                credits.getTotalAvailableCredits(),
                credits.getLastCycleResetAt(),
                credits.getLastApiUsage(),
                isUnlimited);
    }

    /**
     * Credit summary for a user. Non-personal team members use the shared team pool; personal-team
     * or teamless users use individual credits.
     */
    public CreditSummary getCreditSummaryBySupabaseId(String supabaseId) {
        // First, look up the user to check for team membership
        UUID supabaseUuid;
        try {
            supabaseUuid = UUID.fromString(supabaseId);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid Supabase ID format: {}", supabaseId);
            return new CreditSummary();
        }

        Optional<User> userOpt = userService.findBySupabaseId(supabaseUuid);
        if (userOpt.isEmpty()) {
            log.warn("No user found with Supabase ID: {}", supabaseId);
            return new CreditSummary();
        }

        User user = userOpt.get();

        // Check if user has LIMITED_API_USER role (anonymous/guest users).
        // Limited API users always use personal credits, never team credits.
        boolean isLimitedApiUser =
                user.getAuthorities().stream()
                        .anyMatch(
                                authority ->
                                        "ROLE_LIMITED_API_USER".equals(authority.getAuthority())
                                                || "ROLE_EXTRA_LIMITED_API_USER"
                                                        .equals(authority.getAuthority()));

        if (isLimitedApiUser) {
            log.debug("User {} is limited API user; using personal credits", user.getUsername());
        }
        // Check if user is on a non-personal team; if so, return team credits.
        // Skip this check for limited API users.
        else if (user.getTeam() != null && !saasTeamExtensionService.isPersonal(user.getTeam())) {
            Long teamId = user.getTeam().getId();
            log.debug(
                    "User {} is on team {} - returning team credits instead of personal credits",
                    user.getUsername(),
                    teamId);

            Optional<TeamCredit> teamCreditsOpt = teamCreditService.getTeamCredits(teamId);
            if (teamCreditsOpt.isPresent()) {
                TeamCredit tc = teamCreditsOpt.get();
                return new CreditSummary(
                        tc.getCycleCreditsRemaining() != null ? tc.getCycleCreditsRemaining() : 0,
                        tc.getCycleCreditsAllocated() != null ? tc.getCycleCreditsAllocated() : 0,
                        tc.getBoughtCreditsRemaining() != null ? tc.getBoughtCreditsRemaining() : 0,
                        tc.getTotalBoughtCredits() != null ? tc.getTotalBoughtCredits() : 0,
                        tc.getTotalAvailableCredits(),
                        tc.getLastCycleResetAt(),
                        tc.getLastApiUsage(),
                        false // teams never have unlimited credits
                        );
            } else {
                log.warn("Team {} exists but has no credit record; returning empty", teamId);
                return new CreditSummary();
            }
        }

        // User is limited API user, not on a team, or on a personal team; return personal credits
        log.debug("User {} using personal credits", user.getUsername());
        Optional<UserCredit> creditsOpt = getUserCreditsBySupabaseId(supabaseId);
        if (creditsOpt.isEmpty()) {
            // Lazy initialization: try to create UserCredit for existing user
            log.info(
                    "UserCredit missing for Supabase ID {}, creating now",
                    LogRedactionUtils.redactSupabaseId(supabaseId));
            UserCredit newCredits = initializeCreditsForUser(user);
            boolean isUnlimited = newCredits.getCycleCreditsAllocated() == Integer.MAX_VALUE;
            return new CreditSummary(
                    newCredits.getCycleCreditsRemaining(),
                    newCredits.getCycleCreditsAllocated(),
                    newCredits.getBoughtCreditsRemaining(),
                    newCredits.getTotalBoughtCredits(),
                    newCredits.getTotalAvailableCredits(),
                    newCredits.getLastCycleResetAt(),
                    newCredits.getLastApiUsage(),
                    isUnlimited);
        }

        UserCredit credits = creditsOpt.get();
        boolean isUnlimited = credits.getCycleCreditsAllocated() == Integer.MAX_VALUE;
        return new CreditSummary(
                credits.getCycleCreditsRemaining(),
                credits.getCycleCreditsAllocated(),
                credits.getBoughtCreditsRemaining(),
                credits.getTotalBoughtCredits(),
                credits.getTotalAvailableCredits(),
                credits.getLastCycleResetAt(),
                credits.getLastApiUsage(),
                isUnlimited);
    }

    /** Helper method to lookup user by Supabase ID with proper error handling */
    private UserCredit getUserCreditsBySupabaseIdWithValidation(String supabaseId) {
        try {
            UUID supabaseUuid = UUID.fromString(supabaseId);
            Optional<User> userOpt = userService.findBySupabaseId(supabaseUuid);
            if (userOpt.isEmpty()) {
                throw new IllegalArgumentException(
                        "User not found with Supabase ID: " + supabaseId);
            }

            User user = userOpt.get();
            return getOrCreateUserCredits(user);
        } catch (IllegalArgumentException e) {
            if (e.getMessage().startsWith("Invalid UUID")) {
                throw new IllegalArgumentException("Invalid Supabase ID format: " + supabaseId);
            }
            throw e;
        }
    }

    private String maskApiKey(String apiKey) {
        if (apiKey == null || apiKey.length() < 8) {
            return "***";
        }
        return apiKey.substring(0, 4) + "***" + apiKey.substring(apiKey.length() - 4);
    }

    /** Get total available credits across all users (for metrics gauge) */
    private Double getTotalAvailableCredits() {
        try {
            Long total = userCreditRepository.getTotalAvailableCreditsAcrossAllUsers();
            return total != null ? total.doubleValue() : 0.0;
        } catch (Exception e) {
            log.error("Error calculating total available credits for metrics", e);
            return 0.0;
        }
    }

    /** Get total API calls across all users (for metrics gauge) */
    private Double getTotalApiCalls() {
        try {
            Long total = userCreditRepository.getTotalApiCallsAcrossAllUsers();
            return total != null ? total.doubleValue() : 0.0;
        } catch (Exception e) {
            log.error("Error calculating total API calls for metrics", e);
            return 0.0;
        }
    }

    /** Get cycle credit allocation for a user based on configuration */
    private int getCycleAllocationForUser(User user) {
        if (user == null || user.getRolesAsString() == null) {
            log.warn("User or roles is null, returning 0 credits");
            return 0;
        }

        String rolesString = user.getRolesAsString();
        Map<String, Integer> allocations = creditsProperties.getCycle().getAllocations();

        log.debug(
                "Getting credit allocation for user {} with roles: {}",
                user.getUsername(),
                rolesString);
        log.debug("Available credit allocations: {}", allocations);

        // Check roles in priority order
        if (rolesString.contains("ROLE_ADMIN") && creditsProperties.getCycle().isAdminUnlimited()) {
            log.debug("User {} has admin unlimited credits", user.getUsername());
            return Integer.MAX_VALUE;
        }

        // Internal API users (including test API key) get unlimited credits
        if (rolesString.contains("ROLE_INTERNAL_API_USER")) {
            log.debug("User {} has internal API unlimited credits", user.getUsername());
            return Integer.MAX_VALUE;
        }

        for (Map.Entry<String, Integer> entry : allocations.entrySet()) {
            if (rolesString.contains(entry.getKey())) {
                log.debug(
                        "User {} matched role {} with {} credits",
                        user.getUsername(),
                        entry.getKey(),
                        entry.getValue());
                return entry.getValue();
            }
        }

        // Default allocation
        int defaultCredits = allocations.getOrDefault("ROLE_USER", 50);
        log.debug(
                "User {} using default ROLE_USER allocation: {} credits",
                user.getUsername(),
                defaultCredits);
        return defaultCredits;
    }

    /** Initialize credits for a new user */
    public UserCredit initializeCreditsForUser(User user) {
        log.info(
                "Initializing credits for user: {} (id: {})",
                LogRedactionUtils.redactEmail(user.getUsername()),
                user.getId());
        UserCredit credits = new UserCredit(user);
        int allocation = getCycleAllocationForUser(user);
        log.info(
                "Allocated {} credits to user: {}",
                allocation,
                LogRedactionUtils.redactEmail(user.getUsername()));
        credits.resetCycleCredits(allocation, LocalDateTime.now());
        UserCredit saved = userCreditRepository.save(credits);
        log.info(
                "Successfully saved UserCredit for user: {} with allocation: {}",
                LogRedactionUtils.redactEmail(user.getUsername()),
                allocation);
        return saved;
    }

    /**
     * Refresh cycle credits after a role change. Resets {@code cycleCreditsRemaining} to the new
     * allocation; preserves {@code boughtCreditsRemaining}.
     */
    public void refreshCreditsAfterRoleChange(User user) {
        log.info(
                "Refreshing credits for user: {} after role change",
                LogRedactionUtils.redactEmail(user.getUsername()));

        Optional<UserCredit> creditsOpt = userCreditRepository.findByUserId(user.getId());
        if (creditsOpt.isEmpty()) {
            log.warn(
                    "No credits found for user {}, initializing",
                    LogRedactionUtils.redactEmail(user.getUsername()));
            initializeCreditsForUser(user);
            return;
        }

        UserCredit credits = creditsOpt.get();
        int oldAllocation = credits.getCycleCreditsAllocated();
        int oldRemaining = credits.getCycleCreditsRemaining();
        int newAllocation = getCycleAllocationForUser(user);

        log.info(
                "Updating credits for user {} from {}/{} to {}/{} cycle credits",
                user.getUsername(),
                oldRemaining,
                oldAllocation,
                newAllocation,
                newAllocation);

        // Full reset: sets both allocation and remaining to the new amount.
        // This gives full credits on upgrade, but removes excess on downgrade.
        credits.resetCycleCredits(newAllocation, LocalDateTime.now());
        userCreditRepository.save(credits);

        log.info(
                "Successfully refreshed credits for user {}: {} cycle credits available",
                user.getUsername(),
                newAllocation);
    }

    /**
     * Resets cycle credit allocation after a role change. More efficient version when the caller
     * already knows the target allocation. Performs a FULL RESET: updates allocation, remaining,
     * and timestamp.
     *
     * <p>Different from setCycleCredits() which only adjusts remaining credits.
     *
     * @param userId The user ID
     * @param newAllocation The new cycle credit allocation amount
     */
    public void resetCycleAllocationForRoleChange(Long userId, int newAllocation) {
        log.info("Resetting cycle allocation for user ID {} to {}", userId, newAllocation);

        Optional<UserCredit> creditsOpt = userCreditRepository.findByUserId(userId);
        if (creditsOpt.isEmpty()) {
            log.warn("No credits found for user ID {}, cannot reset allocation", userId);
            throw new IllegalStateException("User credits not found for user ID: " + userId);
        }

        UserCredit credits = creditsOpt.get();
        int oldAllocation = credits.getCycleCreditsAllocated();
        int oldRemaining = credits.getCycleCreditsRemaining();

        log.info(
                "Resetting allocation for user ID {} from {}/{} to {}/{} cycle credits",
                userId,
                oldRemaining,
                oldAllocation,
                newAllocation,
                newAllocation);

        // Full reset: sets both allocation and remaining to the new amount
        credits.resetCycleCredits(newAllocation, LocalDateTime.now());
        userCreditRepository.save(credits);

        log.info(
                "Successfully reset cycle allocation for user ID {}: {} credits available",
                userId,
                newAllocation);
    }

    /**
     * Consumes credits with explicit waterfall logic for Pro billing model. Implements the
     * following priority order:
     *
     * <ol>
     *   <li><b>Cycle Credits</b>: Try consuming from cycle credit allocation (100/month for Pro,
     *       25/month for Free)
     *   <li><b>Bought Credits</b>: Try consuming from purchased credits
     *   <li><b>Metered Billing</b>: If user.has_metered_billing_enabled, report to Stripe and allow
     *   <li><b>Reject</b>: No available credit source (Pro users without metered billing get
     *       helpful message about enabling overage billing)
     * </ol>
     *
     * @param user User consuming credits
     * @param creditAmount Amount to consume
     * @param isApiRequest True if API key request, false if UI request (both consume credits for
     *     Pro users)
     * @return CreditConsumptionResult with source and success status
     */
    public CreditConsumptionResult consumeCreditWithWaterfall(
            User user, int creditAmount, boolean isApiRequest) {

        log.debug(
                "[WATERFALL] Starting credit consumption for user {} - Amount: {}, API request: {}",
                user.getUsername(),
                creditAmount,
                isApiRequest);

        // Internal API users (e.g., CUSTOM_API_USER) get unlimited credits, no Supabase ID needed
        if (user.getRolesAsString().contains("STIRLING-PDF-BACKEND-API-USER")) {
            log.debug(
                    "[WATERFALL] Internal API user {} - unlimited credits, skipping consumption",
                    user.getUsername());
            creditsConsumedCounter.increment(creditAmount);
            return CreditConsumptionResult.success("INTERNAL_API_UNLIMITED");
        }

        UUID supabaseId = user.getSupabaseId();
        if (supabaseId == null) {
            log.error("[WATERFALL] User {} has no Supabase ID", user.getUsername());
            return CreditConsumptionResult.failure("User has no Supabase ID");
        }

        // STEP 2: Try cycle free credits
        Boolean hasCycle = userCreditRepository.hasCycleCredits(supabaseId, creditAmount);
        if (Boolean.TRUE.equals(hasCycle)) {
            int rowsUpdated = userCreditRepository.consumeCycleCredits(supabaseId, creditAmount);
            if (rowsUpdated == 1) {
                creditsConsumedCounter.increment(creditAmount);
                log.info(
                        "[WATERFALL] Consumed {} cycle credits for user: {}",
                        creditAmount,
                        user.getUsername());
                return CreditConsumptionResult.success("CYCLE_CREDITS");
            }
        }

        // STEP 3: Try purchased credits
        Boolean hasBought = userCreditRepository.hasBoughtCredits(supabaseId, creditAmount);
        if (Boolean.TRUE.equals(hasBought)) {
            int rowsUpdated = userCreditRepository.consumeBoughtCredits(supabaseId, creditAmount);
            if (rowsUpdated == 1) {
                creditsConsumedCounter.increment(creditAmount);
                log.info(
                        "[WATERFALL] Consumed {} bought credits for user: {}",
                        creditAmount,
                        user.getUsername());
                return CreditConsumptionResult.success("BOUGHT_CREDITS");
            }
        }

        // STEP 4: Try metered billing (check flag, not role)
        if (saasUserExtensionService.isMeteredBillingEnabled(user)) {
            log.info(
                    "[WATERFALL] User {} has metered billing enabled; reporting {} credits to Stripe",
                    user.getUsername(),
                    creditAmount);

            try {
                // Report to Stripe meter via edge function
                String idempotencyKey =
                        stripeUsageReportingService.generateIdempotencyKey(supabaseId.toString());

                boolean reported =
                        stripeUsageReportingService.reportUsageToStripe(
                                supabaseId.toString(), creditAmount, idempotencyKey);

                if (reported) {
                    creditsConsumedCounter.increment(creditAmount);

                    log.info(
                            "[WATERFALL] Reported {} overage credits to Stripe for user: {}",
                            creditAmount,
                            user.getUsername());
                    return CreditConsumptionResult.success("METERED_SUBSCRIPTION");
                } else {
                    log.error(
                            "[WATERFALL] Failed to report usage to Stripe for user: {}",
                            user.getUsername());
                    creditConsumptionFailuresCounter.increment();
                    return CreditConsumptionResult.failure("Failed to report usage to Stripe");
                }
            } catch (Exception e) {
                log.error(
                        "[WATERFALL] Exception while reporting to Stripe for user {}: {}",
                        user.getUsername(),
                        e.getMessage(),
                        e);
                creditConsumptionFailuresCounter.increment();
                return CreditConsumptionResult.failure(
                        "Error reporting usage to Stripe: " + e.getMessage());
            }
        } else if (user.getRolesAsString().contains("ROLE_PRO_USER")) {
            // Pro user without metered billing enabled; reject with helpful message
            log.warn(
                    "[WATERFALL] Pro user {} has exhausted credits but metered billing not enabled. Rejecting request.",
                    user.getUsername());
            log.info(
                    "[WATERFALL] User should set up overage billing via UI to enable uninterrupted service.");

            creditConsumptionFailuresCounter.increment();
            return CreditConsumptionResult.failure(
                    "Credits exhausted. Please enable overage billing in settings for uninterrupted service.");
        }

        // STEP 5: Reject; no available credit source
        log.warn(
                "[WATERFALL] No credit source available for user: {} (needed: {} credits)",
                user.getUsername(),
                creditAmount);
        creditConsumptionFailuresCounter.increment();
        return CreditConsumptionResult.failure("INSUFFICIENT_CREDITS");
    }

    public static class CreditSummary {
        public final int cycleCreditsRemaining;
        public final int cycleCreditsAllocated;
        public final int boughtCreditsRemaining;
        public final int totalBoughtCredits;
        public final int totalAvailableCredits;
        public final LocalDateTime cycleResetDate;
        public final LocalDateTime lastApiUsage;
        public final boolean unlimited;

        public CreditSummary() {
            this(0, 0, 0, 0, 0, null, null, false);
        }

        public CreditSummary(
                int cycleCreditsRemaining,
                int cycleCreditsAllocated,
                int boughtCreditsRemaining,
                int totalBoughtCredits,
                int totalAvailableCredits,
                LocalDateTime cycleResetDate,
                LocalDateTime lastApiUsage,
                boolean unlimited) {
            this.cycleCreditsRemaining = cycleCreditsRemaining;
            this.cycleCreditsAllocated = cycleCreditsAllocated;
            this.boughtCreditsRemaining = boughtCreditsRemaining;
            this.totalBoughtCredits = totalBoughtCredits;
            this.totalAvailableCredits = totalAvailableCredits;
            this.cycleResetDate = cycleResetDate;
            this.lastApiUsage = lastApiUsage;
            this.unlimited = unlimited;
        }
    }
}
