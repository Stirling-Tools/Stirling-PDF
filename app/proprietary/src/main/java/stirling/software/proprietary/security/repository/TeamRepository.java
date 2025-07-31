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

    Optional<Team> findByNameAndOrganizationId(String name, Long organizationId);

    List<Team> findByOrganizationId(Long organizationId);

    @Query(
            "SELECT new stirling.software.proprietary.model.dto.TeamWithUserCountDTO(t.id, t.name, COUNT(u)) "
                    + "FROM Team t LEFT JOIN t.users u WHERE t.organization.id = :organizationId GROUP BY t.id, t.name")
    List<TeamWithUserCountDTO> findAllTeamsWithUserCountByOrganizationId(Long organizationId);

    @Query(
            "SELECT new stirling.software.proprietary.model.dto.TeamWithUserCountDTO(t.id, t.name, COUNT(u)) "
                    + "FROM Team t LEFT JOIN t.users u GROUP BY t.id, t.name")
    List<TeamWithUserCountDTO> findAllTeamsWithUserCount();

    boolean existsByNameIgnoreCase(String name);

    boolean existsByNameIgnoreCaseAndOrganizationId(String name, Long organizationId);

    @Query("SELECT t FROM Team t WHERE t.organization IS NULL")
    List<Team> findTeamsWithoutOrganization();
}
