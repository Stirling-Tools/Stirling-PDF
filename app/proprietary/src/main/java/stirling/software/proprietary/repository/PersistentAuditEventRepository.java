package stirling.software.proprietary.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.model.security.PersistentAuditEvent;

@Repository
public interface PersistentAuditEventRepository extends JpaRepository<PersistentAuditEvent, Long> {

    // Basic queries
    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%',"
                    + " :principal, '%'))")
    Page<PersistentAuditEvent> findByPrincipal(
            @Param("principal") String principal, Pageable pageable);

    Page<PersistentAuditEvent> findByType(String type, Pageable pageable);

    Page<PersistentAuditEvent> findByTimestampBetween(
            Instant startDate, Instant endDate, Pageable pageable);

    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%',"
                    + " :principal, '%')) AND e.type = :type")
    Page<PersistentAuditEvent> findByPrincipalAndType(
            @Param("principal") String principal, @Param("type") String type, Pageable pageable);

    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%',"
                    + " :principal, '%')) AND e.timestamp BETWEEN :startDate AND :endDate")
    Page<PersistentAuditEvent> findByPrincipalAndTimestampBetween(
            @Param("principal") String principal,
            @Param("startDate") Instant startDate,
            @Param("endDate") Instant endDate,
            Pageable pageable);

    Page<PersistentAuditEvent> findByTypeAndTimestampBetween(
            String type, Instant startDate, Instant endDate, Pageable pageable);

    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%',"
                    + " :principal, '%')) AND e.type = :type AND e.timestamp BETWEEN :startDate AND"
                    + " :endDate")
    Page<PersistentAuditEvent> findByPrincipalAndTypeAndTimestampBetween(
            @Param("principal") String principal,
            @Param("type") String type,
            @Param("startDate") Instant startDate,
            @Param("endDate") Instant endDate,
            Pageable pageable);

    // Non-paged versions for export
    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%',"
                    + " :principal, '%'))")
    List<PersistentAuditEvent> findAllByPrincipalForExport(@Param("principal") String principal);

    @Query("SELECT e FROM PersistentAuditEvent e WHERE e.type = :type")
    List<PersistentAuditEvent> findByTypeForExport(@Param("type") String type);

    @Query("SELECT e FROM PersistentAuditEvent e WHERE e.timestamp BETWEEN :startDate AND :endDate")
    List<PersistentAuditEvent> findAllByTimestampBetweenForExport(
            @Param("startDate") Instant startDate, @Param("endDate") Instant endDate);

    @Query("SELECT e FROM PersistentAuditEvent e WHERE e.timestamp > :startDate")
    List<PersistentAuditEvent> findByTimestampAfter(@Param("startDate") Instant startDate);

    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%',"
                    + " :principal, '%')) AND e.type = :type")
    List<PersistentAuditEvent> findAllByPrincipalAndTypeForExport(
            @Param("principal") String principal, @Param("type") String type);

    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%',"
                    + " :principal, '%')) AND e.timestamp BETWEEN :startDate AND :endDate")
    List<PersistentAuditEvent> findAllByPrincipalAndTimestampBetweenForExport(
            @Param("principal") String principal,
            @Param("startDate") Instant startDate,
            @Param("endDate") Instant endDate);

    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE e.type = :type AND e.timestamp BETWEEN"
                    + " :startDate AND :endDate")
    List<PersistentAuditEvent> findAllByTypeAndTimestampBetweenForExport(
            @Param("type") String type,
            @Param("startDate") Instant startDate,
            @Param("endDate") Instant endDate);

    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%',"
                    + " :principal, '%')) AND e.type = :type AND e.timestamp BETWEEN :startDate AND"
                    + " :endDate")
    List<PersistentAuditEvent> findAllByPrincipalAndTypeAndTimestampBetweenForExport(
            @Param("principal") String principal,
            @Param("type") String type,
            @Param("startDate") Instant startDate,
            @Param("endDate") Instant endDate);

    // Cleanup queries
    @Query("DELETE FROM PersistentAuditEvent e WHERE e.timestamp < ?1")
    @Modifying
    @Transactional
    int deleteByTimestampBefore(Instant cutoffDate);

    // Find IDs for batch deletion - using JPQL with setMaxResults instead of native query
    @Query("SELECT e.id FROM PersistentAuditEvent e WHERE e.timestamp < ?1 ORDER BY e.id")
    List<Long> findIdsForBatchDeletion(Instant cutoffDate, Pageable pageable);

    // Stats queries
    @Query("SELECT e.type, COUNT(e) FROM PersistentAuditEvent e GROUP BY e.type")
    List<Object[]> countByType();

    @Query("SELECT e.principal, COUNT(e) FROM PersistentAuditEvent e GROUP BY e.principal")
    List<Object[]> countByPrincipal();

    @Query(
            "SELECT e.type, COUNT(e) FROM PersistentAuditEvent e WHERE e.timestamp BETWEEN"
                    + " :startDate AND :endDate GROUP BY e.type")
    List<Object[]> countByTypeBetween(
            @Param("startDate") Instant startDate, @Param("endDate") Instant endDate);

    @Query(
            "SELECT e.principal, COUNT(e) FROM PersistentAuditEvent e WHERE e.timestamp BETWEEN"
                    + " :startDate AND :endDate GROUP BY e.principal")
    List<Object[]> countByPrincipalBetween(
            @Param("startDate") Instant startDate, @Param("endDate") Instant endDate);

    // Portable time-bucketing using YEAR/MONTH/DAY functions (works across most dialects)
    @Query(
            "SELECT YEAR(e.timestamp), MONTH(e.timestamp), DAY(e.timestamp), COUNT(e) "
                    + "FROM PersistentAuditEvent e "
                    + "WHERE e.timestamp BETWEEN :startDate AND :endDate "
                    + "GROUP BY YEAR(e.timestamp), MONTH(e.timestamp), DAY(e.timestamp) "
                    + "ORDER BY YEAR(e.timestamp), MONTH(e.timestamp), DAY(e.timestamp)")
    List<Object[]> histogramByDayBetween(
            @Param("startDate") Instant startDate, @Param("endDate") Instant endDate);

    @Query(
            "SELECT HOUR(e.timestamp), COUNT(e) FROM PersistentAuditEvent e WHERE e.timestamp"
                    + " BETWEEN :startDate AND :endDate GROUP BY HOUR(e.timestamp) ORDER BY"
                    + " HOUR(e.timestamp)")
    List<Object[]> histogramByHourBetween(
            @Param("startDate") Instant startDate, @Param("endDate") Instant endDate);

    // Get distinct event types for filtering
    @Query("SELECT DISTINCT e.type FROM PersistentAuditEvent e ORDER BY e.type")
    List<String> findDistinctEventTypes();

    @Query("SELECT DISTINCT e.principal FROM PersistentAuditEvent e ORDER BY e.principal")
    List<String> findDistinctPrincipals();

    @Query(
            "SELECT DISTINCT e.principal FROM PersistentAuditEvent e WHERE e.type = :type ORDER BY"
                    + " e.principal")
    List<String> findDistinctPrincipalsByType(@Param("type") String type);

    // Top/Latest helpers & existence checks
    Optional<PersistentAuditEvent> findTopByOrderByTimestampDesc();

    Optional<PersistentAuditEvent> findTopByPrincipalOrderByTimestampDesc(String principal);

    Optional<PersistentAuditEvent> findTopByTypeOrderByTimestampDesc(String type);
}
