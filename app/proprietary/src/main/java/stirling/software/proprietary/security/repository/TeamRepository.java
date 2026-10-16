package stirling.software.proprietary.security.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.dto.TeamWithUserCountDTO;

public interface TeamRepository extends JpaRepository<Team, Long> {
    @org.springframework.data.jpa.repository.Lock(
            jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM Team t WHERE t.id = :id")
    Optional<Team> lockById(@org.springframework.data.repository.query.Param("id") Long id);

    // teams.name is not unique, so peers cold-booting a shared DB can commit two "Default" rows.
    // A derived Optional finder would then throw on every call; lowest id keeps all nodes agreeing.
    Optional<Team> findFirstByNameOrderByIdAsc(String name);

    @Query(
            "SELECT new stirling.software.proprietary.model.dto.TeamWithUserCountDTO(t.id, t.name, COUNT(u)) "
                    + "FROM Team t LEFT JOIN t.users u GROUP BY t.id, t.name")
    List<TeamWithUserCountDTO> findAllTeamsWithUserCount();

    boolean existsByNameIgnoreCase(String name);
}
