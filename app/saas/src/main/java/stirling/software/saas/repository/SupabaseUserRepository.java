package stirling.software.saas.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.saas.model.SupabaseUser;

@Repository
public interface SupabaseUserRepository extends JpaRepository<SupabaseUser, UUID> {

    /**
     * Anonymous users created before the cut-off date. Used by the cleanup job to drop stale
     * anonymous sessions in batch (avoids long-running transactions on a single big delete).
     */
    @Query(
            "SELECT s.id FROM SupabaseUser s WHERE s.isAnonymous = true AND s.createdAt < :cutoffDate")
    Stream<UUID> findByCreatedAtBeforeAndIsAnonymousTrue(
            @Param("cutoffDate") LocalDateTime cutoffDate);

    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM SupabaseUser u WHERE u.id IN :ids")
    void deleteAllByIdInBatch(@Param("ids") List<UUID> ids);
}
