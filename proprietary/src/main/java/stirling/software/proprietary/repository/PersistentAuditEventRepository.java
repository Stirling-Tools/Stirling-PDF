package stirling.software.proprietary.repository;

import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.model.security.PersistentAuditEvent;

@Repository
public interface PersistentAuditEventRepository
        extends JpaRepository<PersistentAuditEvent, Long> {
    
    // Basic queries
    Page<PersistentAuditEvent> findByPrincipal(String principal, Pageable pageable);
    Page<PersistentAuditEvent> findByType(String type, Pageable pageable);
    Page<PersistentAuditEvent> findByTimestampBetween(Instant startDate, Instant endDate, Pageable pageable);
    Page<PersistentAuditEvent> findByPrincipalAndType(String principal, String type, Pageable pageable);
    Page<PersistentAuditEvent> findByPrincipalAndTimestampBetween(String principal, Instant startDate, Instant endDate, Pageable pageable);
    Page<PersistentAuditEvent> findByTypeAndTimestampBetween(String type, Instant startDate, Instant endDate, Pageable pageable);
    Page<PersistentAuditEvent> findByPrincipalAndTypeAndTimestampBetween(String principal, String type, Instant startDate, Instant endDate, Pageable pageable);
    
    // Non-paged versions for export
    List<PersistentAuditEvent> findByPrincipal(String principal);
    @Query("SELECT e FROM PersistentAuditEvent e WHERE e.type = :type")
    List<PersistentAuditEvent> findByTypeForExport(@Param("type") String type);
    List<PersistentAuditEvent> findByTimestampBetween(Instant startDate, Instant endDate);
    List<PersistentAuditEvent> findByTimestampAfter(Instant startDate);
    List<PersistentAuditEvent> findByPrincipalAndType(String principal, String type);
    List<PersistentAuditEvent> findByPrincipalAndTimestampBetween(String principal, Instant startDate, Instant endDate);
    List<PersistentAuditEvent> findByTypeAndTimestampBetween(String type, Instant startDate, Instant endDate);
    List<PersistentAuditEvent> findByPrincipalAndTypeAndTimestampBetween(String principal, String type, Instant startDate, Instant endDate);
    
    // Cleanup queries
    @Query("DELETE FROM PersistentAuditEvent e WHERE e.timestamp < ?1")
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.transaction.annotation.Transactional
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
    List<Object[]> findDistinctEventTypes();
}