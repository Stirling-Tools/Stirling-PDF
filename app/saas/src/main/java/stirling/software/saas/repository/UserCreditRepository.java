package stirling.software.saas.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.UserCredit;

/**
 * JPA repository for {@link UserCredit}. Includes JPQL queries for the common read paths and native
 * SQL for atomic credit-consumption updates (avoids select-then-update races).
 *
 * <p>Native queries reference {@code user_credits} and {@code users} unqualified — they pick up
 * Hibernate's {@code default_schema} (set to {@code stirling_pdf} in {@code
 * application-saas.properties}). Keeping the schema out of the SQL means a future schema rename is
 * a one-property change instead of a sweep of native SQL.
 */
@Repository
public interface UserCreditRepository extends JpaRepository<UserCredit, Long> {

    Optional<UserCredit> findByUser(User user);

    Optional<UserCredit> findByUserId(Long userId);

    @Query(
            "SELECT uc FROM UserCredit uc WHERE uc.lastCycleResetAt IS NULL OR uc.lastCycleResetAt < :lastScheduledReset")
    List<UserCredit> findCreditsNeedingCycleReset(
            @Param("lastScheduledReset") LocalDateTime lastScheduledReset);

    @Query("SELECT SUM(uc.totalApiCallsMade) FROM UserCredit uc")
    Long getTotalApiCallsAcrossAllUsers();

    @Query("SELECT SUM(uc.cycleCreditsRemaining + uc.boughtCreditsRemaining) FROM UserCredit uc")
    Long getTotalAvailableCreditsAcrossAllUsers();

    @Query("SELECT uc FROM UserCredit uc WHERE uc.user.apiKey = :apiKey")
    Optional<UserCredit> findByUserApiKey(@Param("apiKey") String apiKey);

    @Query("SELECT uc FROM UserCredit uc WHERE uc.user.supabaseId = :supabaseId")
    Optional<UserCredit> findBySupabaseId(@Param("supabaseId") UUID supabaseId);

    @Query("SELECT COUNT(uc) FROM UserCredit uc WHERE uc.lastApiUsage >= :since")
    Long countActiveUsersInPeriod(@Param("since") LocalDateTime since);

    @Modifying
    @Query(
            value =
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
                            + "  AND (cycle_credits_remaining + bought_credits_remaining >= :creditAmount)",
            nativeQuery = true)
    int consumeCredit(@Param("apiKey") String apiKey, @Param("creditAmount") int creditAmount);

    @Modifying
    @Query(
            value =
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
                            + "  AND (cycle_credits_remaining + bought_credits_remaining >= :creditAmount)",
            nativeQuery = true)
    int consumeCreditBySupabaseId(
            @Param("supabaseId") UUID supabaseId, @Param("creditAmount") int creditAmount);

    /**
     * Consumes ONLY cycle credits (does not touch bought credits). Used in explicit waterfall
     * logic.
     */
    @Modifying
    @Query(
            value =
                    "UPDATE user_credits "
                            + "SET "
                            + "  cycle_credits_remaining = cycle_credits_remaining - :amount, "
                            + "  total_api_calls_made = total_api_calls_made + 1, "
                            + "  last_api_usage = now() "
                            + "WHERE user_id = (SELECT u.user_id FROM users u WHERE u.supabase_id = :supabaseId) "
                            + "  AND cycle_credits_remaining >= :amount",
            nativeQuery = true)
    int consumeCycleCredits(@Param("supabaseId") UUID supabaseId, @Param("amount") int amount);

    /** Consumes ONLY bought credits (does not touch cycle credits). */
    @Modifying
    @Query(
            value =
                    "UPDATE user_credits "
                            + "SET "
                            + "  bought_credits_remaining = bought_credits_remaining - :amount, "
                            + "  total_api_calls_made = total_api_calls_made + 1, "
                            + "  last_api_usage = now() "
                            + "WHERE user_id = (SELECT u.user_id FROM users u WHERE u.supabase_id = :supabaseId) "
                            + "  AND bought_credits_remaining >= :amount",
            nativeQuery = true)
    int consumeBoughtCredits(@Param("supabaseId") UUID supabaseId, @Param("amount") int amount);

    /** Checks if user has sufficient cycle credits (does NOT consume them). */
    @Query(
            value =
                    "SELECT CASE WHEN uc.cycle_credits_remaining >= :amount THEN TRUE ELSE FALSE END "
                            + "FROM user_credits uc "
                            + "WHERE uc.user_id = (SELECT u.user_id FROM users u WHERE u.supabase_id = :supabaseId)",
            nativeQuery = true)
    Boolean hasCycleCredits(@Param("supabaseId") UUID supabaseId, @Param("amount") int amount);

    /** Checks if user has sufficient bought credits (does NOT consume them). */
    @Query(
            value =
                    "SELECT CASE WHEN uc.bought_credits_remaining >= :amount THEN TRUE ELSE FALSE END "
                            + "FROM user_credits uc "
                            + "WHERE uc.user_id = (SELECT u.user_id FROM users u WHERE u.supabase_id = :supabaseId)",
            nativeQuery = true)
    Boolean hasBoughtCredits(@Param("supabaseId") UUID supabaseId, @Param("amount") int amount);
}
