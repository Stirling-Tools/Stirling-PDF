package stirling.software.proprietary.security.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.dto.TeamWithUserCountDTO;

@Repository
public interface TeamRepository extends JpaRepository<Team, Long> {
    Optional<Team> findByName(String name);

    // teams.name is not unique, so peers cold-booting a shared DB can commit two "Default" rows.
    // Converging on the lowest id keeps every node agreeing instead of throwing NonUniqueResult.
    Optional<Team> findFirstByNameOrderByIdAsc(String name);

    @Query(
            "SELECT new stirling.software.proprietary.model.dto.TeamWithUserCountDTO(t.id, t.name, COUNT(u)) "
                    + "FROM Team t LEFT JOIN t.users u GROUP BY t.id, t.name")
    List<TeamWithUserCountDTO> findAllTeamsWithUserCount();

    boolean existsByNameIgnoreCase(String name);
}
