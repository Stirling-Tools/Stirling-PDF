package stirling.software.proprietary.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.UserCredits;
import stirling.software.proprietary.repository.UserCreditsRepository;

/**
 * Manages the credit lifecycle for SaaS users: querying balances, deducting on tool use, topping up
 * via purchases, and weekly resets.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CreditService {

    /** Default weekly credit allocation for free-tier users. */
    private static final int FREE_WEEKLY_CREDITS = 20;

    /** Default weekly credit allocation for pro-tier users. */
    private static final int PRO_WEEKLY_CREDITS = 200;

    /** Default weekly credit allocation for enterprise-tier users. */
    private static final int ENTERPRISE_WEEKLY_CREDITS = Integer.MAX_VALUE;

    private static final Map<String, Integer> PLAN_WEEKLY_CREDITS =
            Map.of(
                    "free", FREE_WEEKLY_CREDITS,
                    "pro", PRO_WEEKLY_CREDITS,
                    "enterprise", ENTERPRISE_WEEKLY_CREDITS);

    private final UserCreditsRepository creditsRepository;

    /** Get or initialize credit record for a user. */
    @Transactional
    public UserCredits getOrCreateCredits(Long userId, String planTier) {
        return creditsRepository
                .findByUserId(userId)
                .orElseGet(() -> initializeCredits(userId, planTier));
    }

    /** Get credits without creating (returns null if not found). */
    public UserCredits getCredits(Long userId) {
        return creditsRepository.findByUserId(userId).orElse(null);
    }

    /**
     * Deduct credits for a tool operation. Consumes weekly credits first, then bought credits.
     *
     * @return true if deduction succeeded, false if insufficient credits
     */
    @Transactional
    public boolean deductCredits(Long userId, int amount, String planTier) {
        UserCredits credits = getOrCreateCredits(userId, planTier);

        // Unlimited plans always succeed
        if (credits.getWeeklyCreditsAllocated() == Integer.MAX_VALUE) {
            credits.setLastApiUsage(LocalDateTime.now());
            creditsRepository.save(credits);
            return true;
        }

        int totalAvailable = credits.getTotalAvailableCredits();
        if (totalAvailable < amount) {
            return false;
        }

        // Deduct from weekly credits first
        int remaining = amount;
        if (credits.getWeeklyCreditsRemaining() >= remaining) {
            credits.setWeeklyCreditsRemaining(credits.getWeeklyCreditsRemaining() - remaining);
        } else {
            remaining -= credits.getWeeklyCreditsRemaining();
            credits.setWeeklyCreditsRemaining(0);
            credits.setBoughtCreditsRemaining(credits.getBoughtCreditsRemaining() - remaining);
        }

        credits.setLastApiUsage(LocalDateTime.now());
        creditsRepository.save(credits);
        return true;
    }

    /** Add purchased credits to a user's balance. */
    @Transactional
    public void addPurchasedCredits(Long userId, int amount, String planTier) {
        UserCredits credits = getOrCreateCredits(userId, planTier);
        credits.setBoughtCreditsRemaining(credits.getBoughtCreditsRemaining() + amount);
        credits.setTotalBoughtCredits(credits.getTotalBoughtCredits() + amount);
        creditsRepository.save(credits);
    }

    /** Update the weekly allocation when a user's plan changes. */
    @Transactional
    public void updatePlanAllocation(Long userId, String newPlanTier) {
        UserCredits credits = creditsRepository.findByUserId(userId).orElse(null);
        if (credits == null) {
            initializeCredits(userId, newPlanTier);
            return;
        }
        int newAllocation = PLAN_WEEKLY_CREDITS.getOrDefault(newPlanTier, FREE_WEEKLY_CREDITS);
        int oldAllocation = credits.getWeeklyCreditsAllocated();

        credits.setWeeklyCreditsAllocated(newAllocation);

        // If upgrading, grant the difference immediately
        if (newAllocation > oldAllocation) {
            int bonus = newAllocation - oldAllocation;
            credits.setWeeklyCreditsRemaining(credits.getWeeklyCreditsRemaining() + bonus);
        }

        creditsRepository.save(credits);
    }

    /** Reset weekly credits for all users whose reset date has passed. Runs every hour. */
    @Scheduled(fixedRate = 3600000)
    @Transactional
    public void resetExpiredWeeklyCredits() {
        List<UserCredits> expired =
                creditsRepository.findByWeeklyResetDateBefore(LocalDateTime.now());
        for (UserCredits credits : expired) {
            credits.setWeeklyCreditsRemaining(credits.getWeeklyCreditsAllocated());
            credits.setWeeklyResetDate(LocalDateTime.now().plusWeeks(1));
            creditsRepository.save(credits);
        }
        if (!expired.isEmpty()) {
            log.info("Reset weekly credits for {} users", expired.size());
        }
    }

    private UserCredits initializeCredits(Long userId, String planTier) {
        int weeklyAllocation =
                PLAN_WEEKLY_CREDITS.getOrDefault(
                        planTier != null ? planTier : "free", FREE_WEEKLY_CREDITS);

        UserCredits credits = new UserCredits();
        credits.setUserId(userId);
        credits.setWeeklyCreditsAllocated(weeklyAllocation);
        credits.setWeeklyCreditsRemaining(weeklyAllocation);
        credits.setBoughtCreditsRemaining(0);
        credits.setTotalBoughtCredits(0);
        credits.setWeeklyResetDate(LocalDateTime.now().plusWeeks(1));
        return creditsRepository.save(credits);
    }
}
