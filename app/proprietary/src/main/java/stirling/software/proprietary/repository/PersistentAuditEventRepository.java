package stirling.software.proprietary.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Parameters;
import io.quarkus.panache.common.Sort;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.proprietary.model.security.PersistentAuditEvent;

/**
 * Quarkus Panache repository for {@link PersistentAuditEvent}.
 *
 * <p>Migrated from a Spring Data {@code JpaRepository}. The original {@code @Query} JPQL strings
 * are preserved verbatim and executed through Panache's {@link #find(String, Object...)} / {@link
 * #find(String, io.quarkus.panache.common.Sort, java.util.Map)} APIs.
 *
 * <p>TODO: Migration required - the previous Spring Data signatures returned {@code
 * org.springframework.data.domain.Page<T>} and accepted {@code
 * org.springframework.data.domain.Pageable}. Those Spring types are gone in Quarkus; the paged
 * finders below now return a Panache {@link PanacheQuery} and accept an {@code
 * io.quarkus.panache.common.Page}. Collaborators that still consume the old Spring API
 * (AuditRestController, AuditCleanupService, CustomAuditEventRepository) must be updated:
 *
 * <ul>
 *   <li>{@code page.getContent()} -> {@code query.page(page).list()}
 *   <li>{@code page.getTotalElements()} -> {@code query.count()}
 *   <li>{@code page.getTotalPages()} -> {@code query.pageCount()}
 *   <li>{@code page.getNumber()}/{@code getSize()} -> read from the requested {@code
 *       io.quarkus.panache.common.Page}
 *   <li>build the {@code io.quarkus.panache.common.Page} from the request's page index + size
 * </ul>
 */
@ApplicationScoped
public class PersistentAuditEventRepository
        implements PanacheRepositoryBase<PersistentAuditEvent, Long> {

    // ---------------------------------------------------------------------
    // Basic paged queries
    // TODO: Migration required - callers must adapt to the PanacheQuery return type (see class
    // doc).
    // ---------------------------------------------------------------------

    public PanacheQuery<PersistentAuditEvent> findByPrincipal(String principal) {
        return find(
                "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%',"
                        + " :principal, '%')) ORDER BY e.timestamp DESC",
                Parameters.with("principal", principal));
    }

    public PanacheQuery<PersistentAuditEvent> findByType(String type) {
        return find("type", Sort.descending("timestamp"), type);
    }

    public PanacheQuery<PersistentAuditEvent> findByTimestampBetween(
            Instant startDate, Instant endDate) {
        return find(
                "timestamp BETWEEN ?1 AND ?2", Sort.descending("timestamp"), startDate, endDate);
    }

    public PanacheQuery<PersistentAuditEvent> findByPrincipalAndType(
            String principal, String type) {
        return find(
                "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%',"
                        + " :principal, '%')) AND e.type = :type ORDER BY e.timestamp DESC",
                Parameters.with("principal", principal).and("type", type));
    }

    public PanacheQuery<PersistentAuditEvent> findByPrincipalAndTimestampBetween(
            String principal, Instant startDate, Instant endDate) {
        return find(
                "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%',"
                        + " :principal, '%')) AND e.timestamp BETWEEN :startDate AND :endDate ORDER"
                        + " BY e.timestamp DESC",
                Parameters.with("principal", principal)
                        .and("startDate", startDate)
                        .and("endDate", endDate));
    }

    public PanacheQuery<PersistentAuditEvent> findByTypeAndTimestampBetween(
            String type, Instant startDate, Instant endDate) {
        return find(
                "type = ?1 AND timestamp BETWEEN ?2 AND ?3",
                Sort.descending("timestamp"),
                type,
                startDate,
                endDate);
    }

    public PanacheQuery<PersistentAuditEvent> findByPrincipalAndTypeAndTimestampBetween(
            String principal, String type, Instant startDate, Instant endDate) {
        return find(
                "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%',"
                        + " :principal, '%')) AND e.type = :type AND e.timestamp BETWEEN :startDate"
                        + " AND :endDate ORDER BY e.timestamp DESC",
                Parameters.with("principal", principal)
                        .and("type", type)
                        .and("startDate", startDate)
                        .and("endDate", endDate));
    }

    // ---------------------------------------------------------------------
    // Non-paged versions for export
    // ---------------------------------------------------------------------

    public List<PersistentAuditEvent> findAllByPrincipalForExport(String principal) {
        return find(
                        "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE"
                                + " UPPER(CONCAT('%', :principal, '%')) ORDER BY e.timestamp DESC",
                        Parameters.with("principal", principal))
                .list();
    }

    public List<PersistentAuditEvent> findByTypeForExport(String type) {
        return list("type", Sort.descending("timestamp"), type);
    }

    public List<PersistentAuditEvent> findByTypeAndTimestampAfterForExport(
            String type, Instant startDate) {
        return list("type = ?1 AND timestamp > ?2", Sort.descending("timestamp"), type, startDate);
    }

    public List<PersistentAuditEvent> findAllByTimestampBetweenForExport(
            Instant startDate, Instant endDate) {
        return list(
                "timestamp BETWEEN ?1 AND ?2", Sort.descending("timestamp"), startDate, endDate);
    }

    public List<PersistentAuditEvent> findByTimestampAfter(Instant startDate) {
        return list("timestamp > ?1", Sort.descending("timestamp"), startDate);
    }

    public List<PersistentAuditEvent> findAllByPrincipalAndTypeForExport(
            String principal, String type) {
        return find(
                        "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE"
                                + " UPPER(CONCAT('%', :principal, '%')) AND e.type = :type ORDER BY"
                                + " e.timestamp DESC",
                        Parameters.with("principal", principal).and("type", type))
                .list();
    }

    public List<PersistentAuditEvent> findAllByPrincipalAndTimestampBetweenForExport(
            String principal, Instant startDate, Instant endDate) {
        return find(
                        "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE"
                                + " UPPER(CONCAT('%', :principal, '%')) AND e.timestamp BETWEEN"
                                + " :startDate AND :endDate ORDER BY e.timestamp DESC",
                        Parameters.with("principal", principal)
                                .and("startDate", startDate)
                                .and("endDate", endDate))
                .list();
    }

    public List<PersistentAuditEvent> findAllByTypeAndTimestampBetweenForExport(
            String type, Instant startDate, Instant endDate) {
        return list(
                "type = ?1 AND timestamp BETWEEN ?2 AND ?3",
                Sort.descending("timestamp"),
                type,
                startDate,
                endDate);
    }

    public List<PersistentAuditEvent> findAllByPrincipalAndTypeAndTimestampBetweenForExport(
            String principal, String type, Instant startDate, Instant endDate) {
        return find(
                        "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE"
                                + " UPPER(CONCAT('%', :principal, '%')) AND e.type = :type AND"
                                + " e.timestamp BETWEEN :startDate AND :endDate ORDER BY"
                                + " e.timestamp DESC",
                        Parameters.with("principal", principal)
                                .and("type", type)
                                .and("startDate", startDate)
                                .and("endDate", endDate))
                .list();
    }

    // ---------------------------------------------------------------------
    // Cleanup queries
    // ---------------------------------------------------------------------

    @Transactional
    public int deleteByTimestampBefore(Instant cutoffDate) {
        return (int) delete("timestamp < ?1", cutoffDate);
    }

    /**
     * Find IDs for batch deletion - using JPQL with paging instead of a native query.
     *
     * <p>TODO: Migration required - originally accepted a Spring {@code Pageable}; callers must
     * pass an {@code io.quarkus.panache.common.Page} instead (see class doc).
     */
    public List<Long> findIdsForBatchDeletion(
            Instant cutoffDate, io.quarkus.panache.common.Page page) {
        return getEntityManager()
                .createQuery(
                        "SELECT e.id FROM PersistentAuditEvent e WHERE e.timestamp < :cutoffDate"
                                + " ORDER BY e.id",
                        Long.class)
                .setParameter("cutoffDate", cutoffDate)
                .setFirstResult(page.index * page.size)
                .setMaxResults(page.size)
                .getResultList();
    }

    // ---------------------------------------------------------------------
    // Stats queries
    // ---------------------------------------------------------------------

    public List<Object[]> countByType() {
        return getEntityManager()
                .createQuery(
                        "SELECT e.type, COUNT(e) FROM PersistentAuditEvent e GROUP BY e.type",
                        Object[].class)
                .getResultList();
    }

    public List<Object[]> countByPrincipal() {
        return getEntityManager()
                .createQuery(
                        "SELECT e.principal, COUNT(e) FROM PersistentAuditEvent e GROUP BY"
                                + " e.principal",
                        Object[].class)
                .getResultList();
    }

    public List<Object[]> countByTypeBetween(Instant startDate, Instant endDate) {
        return getEntityManager()
                .createQuery(
                        "SELECT e.type, COUNT(e) FROM PersistentAuditEvent e WHERE e.timestamp"
                                + " BETWEEN :startDate AND :endDate GROUP BY e.type",
                        Object[].class)
                .setParameter("startDate", startDate)
                .setParameter("endDate", endDate)
                .getResultList();
    }

    public List<Object[]> countByPrincipalBetween(Instant startDate, Instant endDate) {
        return getEntityManager()
                .createQuery(
                        "SELECT e.principal, COUNT(e) FROM PersistentAuditEvent e WHERE e.timestamp"
                                + " BETWEEN :startDate AND :endDate GROUP BY e.principal",
                        Object[].class)
                .setParameter("startDate", startDate)
                .setParameter("endDate", endDate)
                .getResultList();
    }

    // Portable time-bucketing using YEAR/MONTH/DAY functions (works across most dialects)
    public List<Object[]> histogramByDayBetween(Instant startDate, Instant endDate) {
        return getEntityManager()
                .createQuery(
                        "SELECT YEAR(e.timestamp), MONTH(e.timestamp), DAY(e.timestamp), COUNT(e) "
                                + "FROM PersistentAuditEvent e "
                                + "WHERE e.timestamp BETWEEN :startDate AND :endDate "
                                + "GROUP BY YEAR(e.timestamp), MONTH(e.timestamp), DAY(e.timestamp) "
                                + "ORDER BY YEAR(e.timestamp), MONTH(e.timestamp), DAY(e.timestamp)",
                        Object[].class)
                .setParameter("startDate", startDate)
                .setParameter("endDate", endDate)
                .getResultList();
    }

    public List<Object[]> histogramByHourBetween(Instant startDate, Instant endDate) {
        return getEntityManager()
                .createQuery(
                        "SELECT HOUR(e.timestamp), COUNT(e) FROM PersistentAuditEvent e WHERE"
                                + " e.timestamp BETWEEN :startDate AND :endDate GROUP BY"
                                + " HOUR(e.timestamp) ORDER BY HOUR(e.timestamp)",
                        Object[].class)
                .setParameter("startDate", startDate)
                .setParameter("endDate", endDate)
                .getResultList();
    }

    // ---------------------------------------------------------------------
    // Get distinct event types for filtering
    // ---------------------------------------------------------------------

    public List<String> findDistinctEventTypes() {
        return getEntityManager()
                .createQuery(
                        "SELECT DISTINCT e.type FROM PersistentAuditEvent e ORDER BY e.type",
                        String.class)
                .getResultList();
    }

    public List<String> findDistinctPrincipals() {
        return getEntityManager()
                .createQuery(
                        "SELECT DISTINCT e.principal FROM PersistentAuditEvent e ORDER BY"
                                + " e.principal",
                        String.class)
                .getResultList();
    }

    public List<String> findDistinctPrincipalsByType(String type) {
        return getEntityManager()
                .createQuery(
                        "SELECT DISTINCT e.principal FROM PersistentAuditEvent e WHERE e.type ="
                                + " :type ORDER BY e.principal",
                        String.class)
                .setParameter("type", type)
                .getResultList();
    }

    // ---------------------------------------------------------------------
    // Top/Latest helpers & existence checks
    // ---------------------------------------------------------------------

    public Optional<PersistentAuditEvent> findTopByOrderByTimestampDesc() {
        return find("", Sort.by("timestamp").descending()).firstResultOptional();
    }

    public Optional<PersistentAuditEvent> findTopByPrincipalOrderByTimestampDesc(String principal) {
        return find("principal", Sort.by("timestamp").descending(), principal)
                .firstResultOptional();
    }

    public Optional<PersistentAuditEvent> findTopByTypeOrderByTimestampDesc(String type) {
        return find("type", Sort.by("timestamp").descending(), type).firstResultOptional();
    }

    // ---------------------------------------------------------------------
    // Multi-value queries for filtering by multiple types and/or principals
    // TODO: Migration required - callers must adapt to the PanacheQuery return type (see class
    // doc).
    // ---------------------------------------------------------------------

    public PanacheQuery<PersistentAuditEvent> findByTypeIn(List<String> types) {
        return find("type IN ?1", Sort.descending("timestamp"), types);
    }

    public PanacheQuery<PersistentAuditEvent> findByPrincipalIn(List<String> principals) {
        return find("principal IN ?1", Sort.descending("timestamp"), principals);
    }

    public PanacheQuery<PersistentAuditEvent> findByTypeInAndTimestampBetween(
            List<String> types, Instant startDate, Instant endDate) {
        return find(
                "type IN ?1 AND timestamp BETWEEN ?2 AND ?3",
                Sort.descending("timestamp"),
                types,
                startDate,
                endDate);
    }

    public PanacheQuery<PersistentAuditEvent> findByPrincipalInAndTimestampBetween(
            List<String> principals, Instant startDate, Instant endDate) {
        return find(
                "principal IN ?1 AND timestamp BETWEEN ?2 AND ?3",
                Sort.descending("timestamp"),
                principals,
                startDate,
                endDate);
    }

    public PanacheQuery<PersistentAuditEvent> findByTypeInAndPrincipalIn(
            List<String> types, List<String> principals) {
        return find(
                "type IN ?1 AND principal IN ?2", Sort.descending("timestamp"), types, principals);
    }

    public PanacheQuery<PersistentAuditEvent> findByTypeInAndPrincipalInAndTimestampBetween(
            List<String> types, List<String> principals, Instant startDate, Instant endDate) {
        return find(
                "type IN ?1 AND principal IN ?2 AND timestamp BETWEEN ?3 AND ?4",
                Sort.descending("timestamp"),
                types,
                principals,
                startDate,
                endDate);
    }

    // ---------------------------------------------------------------------
    // Export versions (non-paged)
    // ---------------------------------------------------------------------

    public List<PersistentAuditEvent> findByTypeInForExport(List<String> types) {
        return list("type IN ?1", Sort.descending("timestamp"), types);
    }

    public List<PersistentAuditEvent> findByPrincipalInForExport(List<String> principals) {
        return list("principal IN ?1", Sort.descending("timestamp"), principals);
    }

    public List<PersistentAuditEvent> findByTypeInAndTimestampBetweenForExport(
            List<String> types, Instant startDate, Instant endDate) {
        return list(
                "type IN ?1 AND timestamp BETWEEN ?2 AND ?3",
                Sort.descending("timestamp"),
                types,
                startDate,
                endDate);
    }

    public List<PersistentAuditEvent> findByPrincipalInAndTimestampBetweenForExport(
            List<String> principals, Instant startDate, Instant endDate) {
        return list(
                "principal IN ?1 AND timestamp BETWEEN ?2 AND ?3",
                Sort.descending("timestamp"),
                principals,
                startDate,
                endDate);
    }

    public List<PersistentAuditEvent> findByTypeInAndPrincipalInForExport(
            List<String> types, List<String> principals) {
        return list(
                "type IN ?1 AND principal IN ?2", Sort.descending("timestamp"), types, principals);
    }

    public List<PersistentAuditEvent> findByTypeInAndPrincipalInAndTimestampBetweenForExport(
            List<String> types, List<String> principals, Instant startDate, Instant endDate) {
        return list(
                "type IN ?1 AND principal IN ?2 AND timestamp BETWEEN ?3 AND ?4",
                Sort.descending("timestamp"),
                types,
                principals,
                startDate,
                endDate);
    }

    // Query events excluding a specific type (used for analytics where we want to exclude UI_DATA)
    public List<PersistentAuditEvent> findAllExceptTypeForExport(String excludeType) {
        return list("type != ?1", Sort.descending("timestamp"), excludeType);
    }

    public List<PersistentAuditEvent> findAllExceptTypeAndTimestampAfterForExport(
            String excludeType, Instant startDate) {
        return list(
                "type != ?1 AND timestamp > ?2",
                Sort.descending("timestamp"),
                excludeType,
                startDate);
    }
}
