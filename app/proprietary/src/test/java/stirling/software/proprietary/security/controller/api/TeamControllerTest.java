package stirling.software.proprietary.security.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.proprietary.access.model.PrincipalType;
import stirling.software.proprietary.access.repository.ResourceGrantRepository;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.TeamMembershipService;
import stirling.software.proprietary.security.service.TeamService;

@ExtendWith(MockitoExtension.class)
class TeamControllerTest {

    @Mock private TeamRepository teamRepository;
    @Mock private UserRepository userRepository;
    @Mock private ResourceGrantRepository resourceGrantRepository;
    @Mock private IntegrationConfigRepository integrationConfigRepository;
    @Mock private TeamMembershipService teamMembershipService;

    @InjectMocks private TeamController controller;

    @ParameterizedTest
    @ValueSource(strings = {TeamService.DEFAULT_TEAM_NAME, TeamService.INTERNAL_TEAM_NAME})
    void cannotDeleteSystemTeamsEvenWhenEmpty(String name) {
        Team systemTeam = team(1L, name);
        when(teamRepository.findById(1L)).thenReturn(Optional.of(systemTeam));

        ResponseEntity<?> response = controller.deleteTeam(1L);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals(Map.of("error", "Cannot delete " + name + " team."), response.getBody());
        verify(teamRepository).findById(1L);
        verifyNoMoreInteractions(teamRepository);
        verifyNoInteractions(
                userRepository,
                resourceGrantRepository,
                integrationConfigRepository,
                teamMembershipService);
    }

    @Test
    void deletesAnEmptyOrdinaryTeamAndItsGrantsAndMemberships() {
        Team ordinaryTeam = team(2L, "Engineering");
        when(teamRepository.findById(2L)).thenReturn(Optional.of(ordinaryTeam));
        when(userRepository.countByTeam(ordinaryTeam)).thenReturn(0L);
        when(integrationConfigRepository.existsByOwnerTeam_Id(2L)).thenReturn(false);

        ResponseEntity<?> response = controller.deleteTeam(2L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(resourceGrantRepository).deleteByPrincipalTypeAndPrincipalId(PrincipalType.TEAM, 2L);
        verify(teamMembershipService).deleteAllForTeam(2L);
        verify(teamRepository).delete(ordinaryTeam);
    }

    @Test
    void renamingDefaultCreatesANewTeamAndMovesEveryMember() {
        Team defaultTeam = team(1L, TeamService.DEFAULT_TEAM_NAME);
        User first = user(10L, defaultTeam);
        User second = user(11L, defaultTeam);
        List<User> members = List.of(first, second);

        when(teamRepository.findById(1L)).thenReturn(Optional.of(defaultTeam));
        when(teamRepository.existsByNameIgnoreCase("Engineering")).thenReturn(false);
        when(teamRepository.save(any(Team.class)))
                .thenAnswer(
                        invocation -> {
                            Team saved = invocation.getArgument(0);
                            saved.setId(2L);
                            return saved;
                        });
        when(userRepository.findAllByTeam(defaultTeam)).thenReturn(members);

        ResponseEntity<?> response = controller.renameTeam(1L, "Engineering");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(TeamService.DEFAULT_TEAM_NAME, defaultTeam.getName());
        ArgumentCaptor<Team> teamCaptor = ArgumentCaptor.forClass(Team.class);
        verify(teamRepository).save(teamCaptor.capture());
        Team replacement = teamCaptor.getValue();
        assertEquals("Engineering", replacement.getName());
        assertSame(replacement, first.getTeam());
        assertSame(replacement, second.getTeam());
        verify(userRepository).saveAll(members);
        verify(teamMembershipService).syncMembership(first);
        verify(teamMembershipService).syncMembership(second);
        assertEquals(2L, ((Map<?, ?>) response.getBody()).get("teamId"));
    }

    private static Team team(Long id, String name) {
        Team team = new Team();
        team.setId(id);
        team.setName(name);
        return team;
    }

    private static User user(Long id, Team team) {
        User user = new User();
        user.setId(id);
        user.setTeam(team);
        return user;
    }
}
