package stirling.software.proprietary.repository;

import java.time.Instant;
import java.util.List;

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
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%', :principal, '%'))")
    Page<PersistentAuditEvent> findByPrincipal(
            @Param("principal") String principal, Pageable pageable);

    Page<PersistentAuditEvent> findByType(String type, Pageable pageable);

    Page<PersistentAuditEvent> findByTimestampBetween(
            Instant startDate, Instant endDate, Pageable pageable);

    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%', :principal, '%')) AND e.type = :type")
    Page<PersistentAuditEvent> findByPrincipalAndType(
            @Param("principal") String principal, @Param("type") String type, Pageable pageable);

    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%', :principal, '%')) AND e.timestamp BETWEEN :startDate AND :endDate")
    Page<PersistentAuditEvent> findByPrincipalAndTimestampBetween(
            @Param("principal") String principal,
            @Param("startDate") Instant startDate,
            @Param("endDate") Instant endDate,
            Pageable pageable);

    Page<PersistentAuditEvent> findByTypeAndTimestampBetween(
            String type, Instant startDate, Instant endDate, Pageable pageable);

    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%', :principal, '%')) AND e.type = :type AND e.timestamp BETWEEN :startDate AND :endDate")
    Page<PersistentAuditEvent> findByPrincipalAndTypeAndTimestampBetween(
            @Param("principal") String principal,
            @Param("type") String type,
            @Param("startDate") Instant startDate,
            @Param("endDate") Instant endDate,
            Pageable pageable);

    // Non-paged versions for export
    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%', :principal, '%'))")
    List<PersistentAuditEvent> findAllByPrincipalForExport(@Param("principal") String principal);

    @Query("SELECT e FROM PersistentAuditEvent e WHERE e.type = :type")
    List<PersistentAuditEvent> findByTypeForExport(@Param("type") String type);

    @Query("SELECT e FROM PersistentAuditEvent e WHERE e.timestamp BETWEEN :startDate AND :endDate")
    List<PersistentAuditEvent> findAllByTimestampBetweenForExport(
            @Param("startDate") Instant startDate, @Param("endDate") Instant endDate);

    @Query("SELECT e FROM PersistentAuditEvent e WHERE e.timestamp > :startDate")
    List<PersistentAuditEvent> findByTimestampAfter(@Param("startDate") Instant startDate);

    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%', :principal, '%')) AND e.type = :type")
    List<PersistentAuditEvent> findAllByPrincipalAndTypeForExport(
            @Param("principal") String principal, @Param("type") String type);

    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%', :principal, '%')) AND e.timestamp BETWEEN :startDate AND :endDate")
    List<PersistentAuditEvent> findAllByPrincipalAndTimestampBetweenForExport(
            @Param("principal") String principal,
            @Param("startDate") Instant startDate,
            @Param("endDate") Instant endDate);

    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE e.type = :type AND e.timestamp BETWEEN :startDate AND :endDate")
    List<PersistentAuditEvent> findAllByTypeAndTimestampBetweenForExport(
            @Param("type") String type,
            @Param("startDate") Instant startDate,
            @Param("endDate") Instant endDate);

    @Query(
            "SELECT e FROM PersistentAuditEvent e WHERE UPPER(e.principal) LIKE UPPER(CONCAT('%', :principal, '%')) AND e.type = :type AND e.timestamp BETWEEN :startDate AND :endDate")
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

    // Get distinct event types for filtering
    @Query("SELECT DISTINCT e.type FROM PersistentAuditEvent e ORDER BY e.type")
    List<String> findDistinctEventTypes();
}
