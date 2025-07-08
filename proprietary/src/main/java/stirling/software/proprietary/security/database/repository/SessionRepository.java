package stirling.software.proprietary.security.database.repository;

import java.util.Date;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.transaction.Transactional;

import stirling.software.proprietary.security.model.SessionEntity;

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

    @Query(
            "SELECT t.id as teamId, MAX(s.lastRequest) as lastActivity "
                    + "FROM stirling.software.proprietary.model.Team t "
                    + "LEFT JOIN t.users u "
                    + "LEFT JOIN SessionEntity s ON u.username = s.principalName "
                    + "GROUP BY t.id")
    List<Object[]> findLatestActivityByTeam();

    @Query(
            "SELECT u.username as username, MAX(s.lastRequest) as lastRequest "
                    + "FROM stirling.software.proprietary.security.model.User u "
                    + "LEFT JOIN SessionEntity s ON u.username = s.principalName "
                    + "WHERE u.team.id = :teamId "
                    + "GROUP BY u.username")
    List<Object[]> findLatestSessionByTeamId(@Param("teamId") Long teamId);
}
