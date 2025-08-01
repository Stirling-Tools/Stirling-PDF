package stirling.software.proprietary.security.service;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.repository.TeamRepository;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TeamServiceTest {

    @Mock
    private TeamRepository teamRepository;

    @Mock
    private OrganizationService organizationService;

    @InjectMocks
    private TeamService teamService;

    @Test
    void getDefaultTeam() {
        var organization = new Organization();
        organization.setId(1L);
        organization.setName("Default Organization");

        var team = new Team();
        team.setName("Marleyans");
        team.setOrganization(organization);

        when(organizationService.getOrCreateDefaultOrganization()).thenReturn(organization);
        when(teamRepository.findByNameAndOrganizationId(TeamService.DEFAULT_TEAM_NAME, organization.getId()))
                .thenReturn(Optional.of(team));

        Team result = teamService.getOrCreateDefaultTeam();

        assertEquals(team, result);
    }

    @Test
    void createDefaultTeam_whenRepositoryIsEmpty() {
        var organization = new Organization();
        organization.setId(1L);
        organization.setName("Default Organization");

        String teamName = "Default";
        var defaultTeam = new Team();
        defaultTeam.setId(1L);
        defaultTeam.setName(teamName);
        defaultTeam.setOrganization(organization);

        when(organizationService.getOrCreateDefaultOrganization()).thenReturn(organization);
        when(teamRepository.findByNameAndOrganizationId(teamName, organization.getId()))
                .thenReturn(Optional.empty());
        when(teamRepository.save(any(Team.class))).thenReturn(defaultTeam);

        Team result = teamService.getOrCreateDefaultTeam();

        assertEquals(TeamService.DEFAULT_TEAM_NAME, result.getName());
    }

    @Test
    void getInternalTeam() {
        var organization = new Organization();
        organization.setId(2L);
        organization.setName("Internal Organization");

        var team = new Team();
        team.setName("Eldians");
        team.setOrganization(organization);

        when(organizationService.getOrCreateInternalOrganization()).thenReturn(organization);
        when(teamRepository.findByNameAndOrganizationId(TeamService.INTERNAL_TEAM_NAME, organization.getId()))
            .thenReturn(Optional.of(team));

        Team result = teamService.getOrCreateInternalTeam();

        assertEquals(team, result);
    }

    @Test
    void createInternalTeam_whenRepositoryIsEmpty() {
        var organization = new Organization();
        organization.setId(2L);
        organization.setName("Internal Organization");

        String teamName = "Internal";
        Team internalTeam = new Team();
        internalTeam.setId(2L);
        internalTeam.setName(teamName);
        internalTeam.setOrganization(organization);

        when(organizationService.getOrCreateInternalOrganization()).thenReturn(organization);
        when(teamRepository.findByNameAndOrganizationId(TeamService.INTERNAL_TEAM_NAME, organization.getId()))
            .thenReturn(Optional.empty());
        when(teamRepository.save(any(Team.class))).thenReturn(internalTeam);

        Team result = teamService.getOrCreateInternalTeam();

        assertEquals(internalTeam, result);
    }
}
