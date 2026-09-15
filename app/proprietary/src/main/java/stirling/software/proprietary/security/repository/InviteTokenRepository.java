package stirling.software.proprietary.security.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.security.model.InviteToken;

@Repository
public interface InviteTokenRepository extends JpaRepository<InviteToken, Long> {

    Optional<InviteToken> findByToken(String token);

    Optional<InviteToken> findByEmail(String email);

    List<InviteToken> findByUsedFalseAndExpiresAtAfter(LocalDateTime now);

    List<InviteToken> findByCreatedBy(String createdBy);

    @Modifying
    @Query("DELETE FROM InviteToken it WHERE it.expiresAt < :now")
    void deleteExpiredTokens(@Param("now") LocalDateTime now);

    @Query("SELECT COUNT(it) FROM InviteToken it WHERE it.used = false AND it.expiresAt > :now")
    long countActiveInvites(@Param("now") LocalDateTime now);

    /**
     * Consumes an unused token. The {@code used = false} predicate is re-evaluated under the row
     * lock the update takes, so of any number of concurrent redemptions of one token exactly one
     * call sees a row to update. Must be called inside the transaction that creates the account, so
     * a failed creation releases the token.
     *
     * @return 1 when this caller consumed the token, 0 when it was already consumed
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(
            "UPDATE InviteToken it SET it.used = true, it.usedAt = :now WHERE it.id = :id AND"
                    + " it.used = false")
    int consumeIfUnused(@Param("id") Long id, @Param("now") LocalDateTime now);
}
