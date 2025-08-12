package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.repository.TeamRepository;

@ExtendWith(MockitoExtension.class)
class TeamServiceTest {

    @Mock private TeamRepository teamRepository;

    @InjectMocks private TeamService teamService;

    @Test
    void getDefaultTeam() {
        var team = new Team();
        team.setName("Marleyans");

        when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME))
                .thenReturn(Optional.of(team));

        Team result = teamService.getOrCreateDefaultTeam();

        assertEquals(team, result);
    }

    @Test
    void createDefaultTeam_whenRepositoryIsEmpty() {
        String teamName = "Default";
        var defaultTeam = new Team();
        defaultTeam.setId(1L);
        defaultTeam.setName(teamName);

        when(teamRepository.findByName(teamName)).thenReturn(Optional.empty());
        when(teamRepository.save(any(Team.class))).thenReturn(defaultTeam);

        Team result = teamService.getOrCreateDefaultTeam();

        assertEquals(TeamService.DEFAULT_TEAM_NAME, result.getName());
    }

    @Test
    void getInternalTeam() {
        var team = new Team();
        team.setName("Eldians");

        when(teamRepository.findByName(TeamService.INTERNAL_TEAM_NAME))
                .thenReturn(Optional.of(team));

        Team result = teamService.getOrCreateInternalTeam();

        assertEquals(team, result);
    }

    @Test
    void createInternalTeam_whenRepositoryIsEmpty() {
        String teamName = "Internal";
        Team internalTeam = new Team();
        internalTeam.setId(2L);
        internalTeam.setName(teamName);

        when(teamRepository.findByName(teamName)).thenReturn(Optional.empty());
        when(teamRepository.save(any(Team.class))).thenReturn(internalTeam);
        when(teamRepository.findByName(TeamService.INTERNAL_TEAM_NAME))
                .thenReturn(Optional.empty());

        Team result = teamService.getOrCreateInternalTeam();

        assertEquals(internalTeam, result);
    }
}
