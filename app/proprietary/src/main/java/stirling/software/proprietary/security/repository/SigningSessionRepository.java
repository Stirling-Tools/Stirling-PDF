package stirling.software.proprietary.security.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.model.SigningSessionEntity;
import stirling.software.proprietary.security.model.User;

@Repository
public interface SigningSessionRepository extends JpaRepository<SigningSessionEntity, Long> {

    Optional<SigningSessionEntity> findBySessionId(String sessionId);

    @Query(
            "SELECT s FROM SigningSessionEntity s WHERE s.user.id = :userId ORDER BY s.createdAt DESC")
    List<SigningSessionEntity> findAllByUserIdOrderByCreatedAtDesc(@Param("userId") Long userId);

    @Query(
            "SELECT s FROM SigningSessionEntity s LEFT JOIN FETCH s.participants WHERE s.sessionId = :sessionId")
    Optional<SigningSessionEntity> findBySessionIdWithParticipants(
            @Param("sessionId") String sessionId);

    @Query(
            "SELECT s FROM SigningSessionEntity s WHERE s.user.id = :userId AND s.finalized = false ORDER BY s.createdAt DESC")
    List<SigningSessionEntity> findActiveSessionsByUserId(@Param("userId") Long userId);

    boolean existsBySessionId(String sessionId);

    long countByUserAndFinalizedFalse(User user);
}
