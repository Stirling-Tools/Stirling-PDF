package stirling.software.proprietary.repository;

import java.time.YearMonth;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.model.ApiRateLimitUsage;
import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.security.model.User;

@Repository
public interface ApiRateLimitUsageRepository extends JpaRepository<ApiRateLimitUsage, Long> {

    Optional<ApiRateLimitUsage> findByUserAndMonthKey(User user, YearMonth monthKey);

    Optional<ApiRateLimitUsage> findByOrganizationAndMonthKey(Organization organization, YearMonth monthKey);

    default int getUserUsageOrZero(User user, YearMonth monthKey) {
        return findByUserAndMonthKey(user, monthKey)
            .map(ApiRateLimitUsage::getUsageCount)
            .orElse(0);
    }
    
    default int getOrgUsageOrZero(Organization org, YearMonth monthKey) {
        return findByOrganizationAndMonthKey(org, monthKey)
            .map(ApiRateLimitUsage::getUsageCount)
            .orElse(0);
    }

    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Transactional
    @Query(
        value = """
            INSERT INTO api_rate_limit_usage (user_id, month_key, usage_count, created_at, updated_at, version)
            VALUES (:#{#user.id}, :monthKey, :inc, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
            ON CONFLICT (user_id, month_key) DO UPDATE
              SET usage_count = api_rate_limit_usage.usage_count + :inc,
                  updated_at  = CURRENT_TIMESTAMP,
                  version     = api_rate_limit_usage.version + 1
              WHERE api_rate_limit_usage.usage_count + :inc <= :maxLimit
            """,
        nativeQuery = true
    )
    int upsertAndIncrementUserUsage(@Param("user") User user,
                                    @Param("monthKey") String monthKey,
                                    @Param("inc") int increment,
                                    @Param("maxLimit") int maxLimit);

    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Transactional
    @Query(
        value = """
            INSERT INTO api_rate_limit_usage (org_id, month_key, usage_count, created_at, updated_at, version)
            VALUES (:#{#org.id}, :monthKey, :inc, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
            ON CONFLICT (org_id, month_key) DO UPDATE
              SET usage_count = api_rate_limit_usage.usage_count + :inc,
                  updated_at  = CURRENT_TIMESTAMP,
                  version     = api_rate_limit_usage.version + 1
              WHERE api_rate_limit_usage.usage_count + :inc <= :maxLimit
            """,
        nativeQuery = true
    )
    int upsertAndIncrementOrgUsage(@Param("org") Organization org,
                                   @Param("monthKey") String monthKey,
                                   @Param("inc") int increment,
                                   @Param("maxLimit") int maxLimit);
}