package stirling.software.proprietary.security.repository;

import java.util.Collection;
import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Parameters;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.proprietary.security.model.ApiKeyDailyUsage;
import stirling.software.proprietary.security.model.ApiKeyDailyUsageId;

/**
 * Quarkus Panache repository for {@link ApiKeyDailyUsage}.
 *
 * <p>Migrated from a Spring Data {@code JpaRepository}; every {@code @Query} JPQL string is
 * preserved verbatim. Panache has no interface projections, so the two batched queries run through
 * the {@code EntityManager} and their rows are mapped onto {@link ApiKeyUsageSum} by hand.
 */
@ApplicationScoped
public class ApiKeyDailyUsageRepository
        implements PanacheRepositoryBase<ApiKeyDailyUsage, ApiKeyDailyUsageId> {

    /** Atomically bump today's tally; returns 0 when no row exists yet (caller then inserts). */
    @Transactional
    public int incrementIfPresent(Long apiKeyId, long epochDay) {
        return update(
                "UPDATE ApiKeyDailyUsage u SET u.count = u.count + 1 "
                        + "WHERE u.apiKeyId = :apiKeyId AND u.epochDay = :epochDay",
                Parameters.with("apiKeyId", apiKeyId).and("epochDay", epochDay));
    }

    public long sumSince(Long apiKeyId, long fromDayInclusive) {
        // Read as Object: COALESCE over SUM boxes as a dialect-dependent integral type.
        Object total =
                getEntityManager()
                        .createQuery(
                                "SELECT COALESCE(SUM(u.count), 0) FROM ApiKeyDailyUsage u"
                                        + " WHERE u.apiKeyId = :apiKeyId"
                                        + " AND u.epochDay >= :fromDayInclusive")
                        .setParameter("apiKeyId", apiKeyId)
                        .setParameter("fromDayInclusive", fromDayInclusive)
                        .getSingleResult();
        return ((Number) total).longValue();
    }

    /** Null when the key has no row for that day, as the Spring Data single-result query gave. */
    public Long countForDay(Long apiKeyId, long epochDay) {
        return getEntityManager()
                .createQuery(
                        "SELECT u.count FROM ApiKeyDailyUsage u "
                                + "WHERE u.apiKeyId = :apiKeyId AND u.epochDay = :epochDay",
                        Long.class)
                .setParameter("apiKeyId", apiKeyId)
                .setParameter("epochDay", epochDay)
                .getResultStream()
                .findFirst()
                .orElse(null);
    }

    /** Batched today-count for many keys in one query (avoids N+1 when listing keys). */
    public List<ApiKeyUsageSum> countForDayByIds(Collection<Long> ids, long epochDay) {
        List<Object[]> rows =
                getEntityManager()
                        .createQuery(
                                "SELECT u.apiKeyId AS apiKeyId, u.count AS total"
                                        + " FROM ApiKeyDailyUsage u WHERE u.apiKeyId IN :ids"
                                        + " AND u.epochDay = :epochDay",
                                Object[].class)
                        .setParameter("ids", ids)
                        .setParameter("epochDay", epochDay)
                        .getResultList();
        return toSums(rows);
    }

    /** Batched trailing-window sum for many keys in one query. */
    public List<ApiKeyUsageSum> sumSinceByIds(Collection<Long> ids, long fromDayInclusive) {
        List<Object[]> rows =
                getEntityManager()
                        .createQuery(
                                "SELECT u.apiKeyId AS apiKeyId, SUM(u.count) AS total"
                                        + " FROM ApiKeyDailyUsage u WHERE u.apiKeyId IN :ids"
                                        + " AND u.epochDay >= :fromDayInclusive"
                                        + " GROUP BY u.apiKeyId",
                                Object[].class)
                        .setParameter("ids", ids)
                        .setParameter("fromDayInclusive", fromDayInclusive)
                        .getResultList();
        return toSums(rows);
    }

    @Transactional
    public void deleteByApiKeyId(Long apiKeyId) {
        delete("apiKeyId = ?1", apiKeyId);
    }

    public List<ApiKeyDailyUsage> findByApiKeyId(Long apiKeyId) {
        return list("apiKeyId = ?1", apiKeyId);
    }

    /** Spring Data's {@code saveAndFlush}: flushes so a constraint violation surfaces here. */
    public ApiKeyDailyUsage saveAndFlush(ApiKeyDailyUsage row) {
        persistAndFlush(row);
        return row;
    }

    private static List<ApiKeyUsageSum> toSums(List<Object[]> rows) {
        return rows.stream()
                .<ApiKeyUsageSum>map(row -> new UsageSum(asLong(row[0]), asLong(row[1])))
                .toList();
    }

    private static Long asLong(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }

    private record UsageSum(Long apiKeyId, Long total) implements ApiKeyUsageSum {

        @Override
        public Long getApiKeyId() {
            return apiKeyId;
        }

        @Override
        public Long getTotal() {
            return total;
        }
    }
}
