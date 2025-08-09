package stirling.software.proprietary.security.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.model.dto.OrganizationWithTeamCountDTO;

@Repository
public interface OrganizationRepository extends JpaRepository<Organization, Long> {
    Optional<Organization> findByName(String name);

    @Query(
            "SELECT new stirling.software.proprietary.model.dto.OrganizationWithTeamCountDTO(o.id, o.name, o.description, COUNT(t)) "
                    + "FROM Organization o LEFT JOIN o.teams t GROUP BY o.id, o.name, o.description")
    List<OrganizationWithTeamCountDTO> findAllOrganizationsWithTeamCount();

    boolean existsByNameIgnoreCase(String name);
}
