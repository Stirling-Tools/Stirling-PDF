package stirling.software.proprietary.security.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.security.model.ApiKeyDailyUsage;
import stirling.software.proprietary.security.model.ApiKeyDailyUsageId;

@Repository
public interface ApiKeyDailyUsageRepository
        extends JpaRepository<ApiKeyDailyUsage, ApiKeyDailyUsageId> {

    /** Atomically bump today's tally; returns 0 when no row exists yet (caller then inserts). */
    @Modifying
    @Query(
            "UPDATE ApiKeyDailyUsage u SET u.count = u.count + 1 "
                    + "WHERE u.apiKeyId = :apiKeyId AND u.epochDay = :epochDay")
    int incrementIfPresent(@Param("apiKeyId") Long apiKeyId, @Param("epochDay") long epochDay);

    @Query(
            "SELECT COALESCE(SUM(u.count), 0) FROM ApiKeyDailyUsage u "
                    + "WHERE u.apiKeyId = :apiKeyId AND u.epochDay >= :fromDayInclusive")
    long sumSince(
            @Param("apiKeyId") Long apiKeyId, @Param("fromDayInclusive") long fromDayInclusive);

    @Query(
            "SELECT u.count FROM ApiKeyDailyUsage u "
                    + "WHERE u.apiKeyId = :apiKeyId AND u.epochDay = :epochDay")
    Long countForDay(@Param("apiKeyId") Long apiKeyId, @Param("epochDay") long epochDay);

    /** Batched today-count for many keys in one query (avoids N+1 when listing keys). */
    @Query(
            "SELECT u.apiKeyId AS apiKeyId, u.count AS total FROM ApiKeyDailyUsage u "
                    + "WHERE u.apiKeyId IN :ids AND u.epochDay = :epochDay")
    List<ApiKeyUsageSum> countForDayByIds(
            @Param("ids") Collection<Long> ids, @Param("epochDay") long epochDay);

    /** Batched trailing-window sum for many keys in one query. */
    @Query(
            "SELECT u.apiKeyId AS apiKeyId, SUM(u.count) AS total FROM ApiKeyDailyUsage u "
                    + "WHERE u.apiKeyId IN :ids AND u.epochDay >= :fromDayInclusive "
                    + "GROUP BY u.apiKeyId")
    List<ApiKeyUsageSum> sumSinceByIds(
            @Param("ids") Collection<Long> ids, @Param("fromDayInclusive") long fromDayInclusive);

    void deleteByApiKeyId(Long apiKeyId);

    List<ApiKeyDailyUsage> findByApiKeyId(Long apiKeyId);
}
