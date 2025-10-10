package stirling.software.proprietary.security.repository;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.security.model.PasswordResetToken;
import stirling.software.proprietary.security.model.User;

/**
 * Repository for password reset tokens.
 */
@Repository
public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    /**
     * Find a token by its value.
     */
    Optional<PasswordResetToken> findByToken(String token);

    /**
     * Find all tokens for a specific user.
     */
    @Query("SELECT t FROM PasswordResetToken t WHERE t.user = :user ORDER BY t.createdAt DESC")
    java.util.List<PasswordResetToken> findByUser(User user);

    /**
     * Find valid (not used and not expired) tokens for a user.
     */
    @Query("SELECT t FROM PasswordResetToken t WHERE t.user = :user AND t.used = false AND t.expiresAt > :now")
    java.util.List<PasswordResetToken> findValidTokensByUser(User user, LocalDateTime now);

    /**
     * Delete all tokens for a specific user.
     */
    @Modifying
    @Transactional
    void deleteByUser(User user);

    /**
     * Delete expired tokens.
     */
    @Modifying
    @Transactional
    @Query("DELETE FROM PasswordResetToken t WHERE t.expiresAt < :now")
    void deleteExpiredTokens(LocalDateTime now);

    /**
     * Mark a token as used.
     */
    @Modifying
    @Transactional
    @Query("UPDATE PasswordResetToken t SET t.used = true WHERE t.token = :token")
    void markAsUsed(String token);

    /**
     * Count active (not used) tokens for a user.
     */
    @Query("SELECT COUNT(t) FROM PasswordResetToken t WHERE t.user = :user AND t.used = false AND t.expiresAt > :now")
    long countActiveTokensByUser(User user, LocalDateTime now);
}