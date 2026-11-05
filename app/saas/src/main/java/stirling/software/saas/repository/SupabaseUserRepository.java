package stirling.software.saas.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.SupabaseUser;

public interface SupabaseUserRepository extends JpaRepository<SupabaseUser, UUID> {

    /**
     * The local user linked to {@code supabaseId}, with its team and authorities, only while the
     * Supabase {@code auth.users} row still exists: a deleted Supabase account resolves to empty in
     * the same single statement that loads the user.
     */
    @Query(
            "SELECT u FROM User u LEFT JOIN FETCH u.team LEFT JOIN FETCH u.authorities"
                    + " WHERE u.supabaseId = :supabaseId"
                    + " AND EXISTS (SELECT 1 FROM SupabaseUser s WHERE s.id = u.supabaseId)")
    Optional<User> findLinkedUser(@Param("supabaseId") UUID supabaseId);

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
