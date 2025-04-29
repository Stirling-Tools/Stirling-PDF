package stirling.software.SPDF.config.security.session;

import java.util.Date;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.transaction.Transactional;

import stirling.software.SPDF.model.SessionEntity;

@Repository
public interface SessionRepository extends JpaRepository<SessionEntity, String> {
    List<SessionEntity> findByPrincipalName(String principalName);

    List<SessionEntity> findByExpired(boolean expired);

    SessionEntity findBySessionId(String sessionId);

    @Modifying
    @Transactional
    @Query(
            "UPDATE SessionEntity s SET s.expired = :expired, s.lastRequest = :lastRequest WHERE s.principalName = :principalName")
    void saveByPrincipalName(
            @Param("expired") boolean expired,
            @Param("lastRequest") Date lastRequest,
            @Param("principalName") String principalName);
}
