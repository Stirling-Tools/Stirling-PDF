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
}
