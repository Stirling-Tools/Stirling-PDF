package stirling.software.proprietary.security.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.security.model.RefreshToken;

@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    /**
     * Find a refresh token by its hash
     *
     * @param tokenHash SHA-256 hash of the token
     * @return Optional containing the refresh token if found
     */
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    /**
     * Find all refresh tokens for a specific user
     *
     * @param userId User ID
     * @return List of refresh tokens
     */
    List<RefreshToken> findByUserId(Long userId);

    /**
     * Find all valid (non-revoked, non-expired) refresh tokens for a user
     *
     * @param userId User ID
     * @param now Current timestamp
     * @return List of valid refresh tokens
     */
    @Query(
            "SELECT r FROM RefreshToken r WHERE r.userId = :userId AND r.revoked = false AND r.expiresAt > :now")
    List<RefreshToken> findValidTokensByUserId(
            @Param("userId") Long userId, @Param("now") LocalDateTime now);

    /**
     * Revoke all refresh tokens for a specific user (used on logout or security events)
     *
     * @param userId User ID
     * @return Number of tokens revoked
     */
    @Modifying
    @Transactional
    @Query("UPDATE RefreshToken r SET r.revoked = true WHERE r.userId = :userId")
    int revokeAllByUserId(@Param("userId") Long userId);

    /**
     * Revoke a specific refresh token by its hash
     *
     * @param tokenHash SHA-256 hash of the token
     * @return Number of tokens revoked (0 or 1)
     */
    @Modifying
    @Transactional
    @Query("UPDATE RefreshToken r SET r.revoked = true WHERE r.tokenHash = :tokenHash")
    int revokeByTokenHash(@Param("tokenHash") String tokenHash);

    /**
     * Delete all expired refresh tokens (cleanup job)
     *
     * @param now Current timestamp
     * @return Number of tokens deleted
     */
    @Modifying
    @Transactional
    @Query("DELETE FROM RefreshToken r WHERE r.expiresAt < :now")
    int deleteExpiredTokens(@Param("now") LocalDateTime now);

    /**
     * Count valid tokens for a user
     *
     * @param userId User ID
     * @param now Current timestamp
     * @return Count of valid tokens
     */
    @Query(
            "SELECT COUNT(r) FROM RefreshToken r WHERE r.userId = :userId AND r.revoked = false AND r.expiresAt > :now")
    long countValidTokensByUserId(@Param("userId") Long userId, @Param("now") LocalDateTime now);
}
