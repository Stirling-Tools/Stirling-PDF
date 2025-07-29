package stirling.software.proprietary.security.database.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.security.model.JwtSigningKey;

@Repository
public interface JwtSigningKeyRepository extends JpaRepository<JwtSigningKey, Long> {

    Optional<JwtSigningKey> findByIsActiveTrue();

    Optional<JwtSigningKey> findByKeyId(String keyId);

    @Query(
            "SELECT k FROM signing_keys k WHERE k.isActive = false AND k.createdAt < :cutoffDate ORDER BY k.createdAt ASC")
    List<JwtSigningKey> findInactiveKeysOlderThan(
            @Param("cutoffDate") LocalDateTime cutoffDate, Pageable pageable);

    @Query(
            "SELECT COUNT(k) FROM signing_keys k WHERE k.isActive = false AND k.createdAt < :cutoffDate")
    long countKeysEligibleForCleanup(@Param("cutoffDate") LocalDateTime cutoffDate);

    @Modifying
    @Query("DELETE FROM signing_keys k WHERE k.id IN :ids")
    void deleteAllByIdInBatch(@Param("ids") List<Long> ids);
}
