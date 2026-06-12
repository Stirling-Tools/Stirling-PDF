package stirling.software.saas.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.UserCredit;

/**
 * Panache repository for {@link UserCredit}. Includes JPQL queries for the common read paths and
 * native SQL for atomic credit-consumption updates (avoids select-then-update races).
 */
@ApplicationScoped
public class UserCreditRepository implements PanacheRepositoryBase<UserCredit, Long> {

    public Optional<UserCredit> findByUser(User user) {
        return find("user = ?1", user).firstResultOptional();
    }

    public Optional<UserCredit> findByUserId(Long userId) {
        return find("user.id = ?1", userId).firstResultOptional();
    }

    public List<UserCredit> findCreditsNeedingCycleReset(LocalDateTime lastScheduledReset) {
        return find("lastCycleResetAt IS NULL OR lastCycleResetAt < ?1", lastScheduledReset).list();
    }

    public Long getTotalApiCallsAcrossAllUsers() {
        return (Long)
                getEntityManager()
                        .createQuery("SELECT SUM(uc.totalApiCallsMade) FROM UserCredit uc")
                        .getSingleResult();
    }

    public Long getTotalAvailableCreditsAcrossAllUsers() {
        return (Long)
                getEntityManager()
                        .createQuery(
                                "SELECT SUM(uc.cycleCreditsRemaining + uc.boughtCreditsRemaining) FROM UserCredit uc")
                        .getSingleResult();
    }

    public Optional<UserCredit> findByUserApiKey(String apiKey) {
        return find("user.apiKey = ?1", apiKey).firstResultOptional();
    }

    public Optional<UserCredit> findBySupabaseId(UUID supabaseId) {
        return find("user.supabaseId = ?1", supabaseId).firstResultOptional();
    }

    public Long countActiveUsersInPeriod(LocalDateTime since) {
        return count("lastApiUsage >= ?1", since);
    }

    @Transactional
    public int consumeCredit(String apiKey, int creditAmount) {
        return getEntityManager()
                .createNativeQuery(
                        "UPDATE user_credits "
                                + "SET "
                                + "  cycle_credits_remaining = "
                                + "    CASE "
                                + "      WHEN cycle_credits_remaining >= :creditAmount THEN cycle_credits_remaining - :creditAmount "
                                + "      ELSE 0 "
                                + "    END, "
                                + "  bought_credits_remaining = "
                                + "    CASE "
                                + "      WHEN cycle_credits_remaining < :creditAmount "
                                + "        THEN GREATEST(0, bought_credits_remaining - (:creditAmount - cycle_credits_remaining)) "
                                + "      ELSE bought_credits_remaining "
                                + "    END, "
                                + "  total_api_calls_made = total_api_calls_made + 1, "
                                + "  last_api_usage = now() "
                                + "WHERE user_id = (SELECT user_id FROM users WHERE api_key = :apiKey) "
                                + "  AND (cycle_credits_remaining + bought_credits_remaining >= :creditAmount)")
                .setParameter("apiKey", apiKey)
                .setParameter("creditAmount", creditAmount)
                .executeUpdate();
    }

    @Transactional
    public int consumeCreditBySupabaseId(UUID supabaseId, int creditAmount) {
        return getEntityManager()
                .createNativeQuery(
                        "UPDATE user_credits "
                                + "SET "
                                + "  cycle_credits_remaining = "
                                + "    CASE "
                                + "      WHEN cycle_credits_remaining >= :creditAmount THEN cycle_credits_remaining - :creditAmount "
                                + "      ELSE 0 "
                                + "    END, "
                                + "  bought_credits_remaining = "
                                + "    CASE "
                                + "      WHEN cycle_credits_remaining < :creditAmount "
                                + "        THEN GREATEST(0, bought_credits_remaining - (:creditAmount - cycle_credits_remaining)) "
                                + "      ELSE bought_credits_remaining "
                                + "    END, "
                                + "  total_api_calls_made = total_api_calls_made + 1, "
                                + "  last_api_usage = now() "
                                + "WHERE user_id = (SELECT u.user_id FROM users u WHERE u.supabase_id = :supabaseId) "
                                + "  AND (cycle_credits_remaining + bought_credits_remaining >= :creditAmount)")
                .setParameter("supabaseId", supabaseId)
                .setParameter("creditAmount", creditAmount)
                .executeUpdate();
    }

    /** Consumes ONLY cycle credits (does not touch bought credits). */
    @Transactional
    public int consumeCycleCredits(UUID supabaseId, int amount) {
        return getEntityManager()
                .createNativeQuery(
                        "UPDATE user_credits "
                                + "SET "
                                + "  cycle_credits_remaining = cycle_credits_remaining - :amount, "
                                + "  total_api_calls_made = total_api_calls_made + 1, "
                                + "  last_api_usage = now() "
                                + "WHERE user_id = (SELECT u.user_id FROM users u WHERE u.supabase_id = :supabaseId) "
                                + "  AND cycle_credits_remaining >= :amount")
                .setParameter("supabaseId", supabaseId)
                .setParameter("amount", amount)
                .executeUpdate();
    }

    /** Consumes ONLY bought credits (does not touch cycle credits). */
    @Transactional
    public int consumeBoughtCredits(UUID supabaseId, int amount) {
        return getEntityManager()
                .createNativeQuery(
                        "UPDATE user_credits "
                                + "SET "
                                + "  bought_credits_remaining = bought_credits_remaining - :amount, "
                                + "  total_api_calls_made = total_api_calls_made + 1, "
                                + "  last_api_usage = now() "
                                + "WHERE user_id = (SELECT u.user_id FROM users u WHERE u.supabase_id = :supabaseId) "
                                + "  AND bought_credits_remaining >= :amount")
                .setParameter("supabaseId", supabaseId)
                .setParameter("amount", amount)
                .executeUpdate();
    }

    /** Checks if user has sufficient cycle credits (does NOT consume them). */
    @SuppressWarnings("unchecked")
    public Boolean hasCycleCredits(UUID supabaseId, int amount) {
        List<Object> results =
                getEntityManager()
                        .createNativeQuery(
                                "SELECT CASE WHEN uc.cycle_credits_remaining >= :amount THEN TRUE ELSE FALSE END "
                                        + "FROM user_credits uc "
                                        + "WHERE uc.user_id = (SELECT u.user_id FROM users u WHERE u.supabase_id = :supabaseId)")
                        .setParameter("supabaseId", supabaseId)
                        .setParameter("amount", amount)
                        .getResultList();
        return results.isEmpty() ? null : (Boolean) results.get(0);
    }

    /** Checks if user has sufficient bought credits (does NOT consume them). */
    @SuppressWarnings("unchecked")
    public Boolean hasBoughtCredits(UUID supabaseId, int amount) {
        List<Object> results =
                getEntityManager()
                        .createNativeQuery(
                                "SELECT CASE WHEN uc.bought_credits_remaining >= :amount THEN TRUE ELSE FALSE END "
                                        + "FROM user_credits uc "
                                        + "WHERE uc.user_id = (SELECT u.user_id FROM users u WHERE u.supabase_id = :supabaseId)")
                        .setParameter("supabaseId", supabaseId)
                        .setParameter("amount", amount)
                        .getResultList();
        return results.isEmpty() ? null : (Boolean) results.get(0);
    }
}
