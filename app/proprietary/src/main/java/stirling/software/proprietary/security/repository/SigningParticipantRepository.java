package stirling.software.proprietary.security.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.model.SigningParticipantEntity;

@Repository
public interface SigningParticipantRepository
        extends JpaRepository<SigningParticipantEntity, Long> {

    Optional<SigningParticipantEntity> findByShareToken(String shareToken);

    @Query(
            "SELECT p FROM SigningParticipantEntity p WHERE p.session.sessionId = :sessionId AND p.email = :email")
    Optional<SigningParticipantEntity> findBySessionIdAndEmail(
            @Param("sessionId") String sessionId, @Param("email") String email);

    @Query("SELECT p FROM SigningParticipantEntity p WHERE p.session.sessionId = :sessionId")
    List<SigningParticipantEntity> findAllBySessionId(@Param("sessionId") String sessionId);
}
