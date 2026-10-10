package stirling.software.proprietary.security.controller.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.proprietary.access.repository.ResourceGrantRepository;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.TeamMembershipService;

@ExtendWith(MockitoExtension.class)
@DisplayName("TeamController - team names")
class TeamControllerNameTest {

    @Mock private TeamRepository teamRepository;
    @Mock private UserRepository userRepository;
    @Mock private ResourceGrantRepository resourceGrantRepository;
    @Mock private IntegrationConfigRepository integrationConfigRepository;
    @Mock private TeamMembershipService teamMembershipService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        TeamController controller =
                new TeamController(
                        teamRepository,
                        userRepository,
                        resourceGrantRepository,
                        integrationConfigRepository,
                        teamMembershipService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    @DisplayName("refuses to create a team whose name is only whitespace")
    void createRejectsBlankName() throws Exception {
        mockMvc.perform(post("/api/v1/team/create").param("name", "   "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Team name is required."));

        verify(teamRepository, never()).save(any());
    }

    @Test
    @DisplayName("stores a created team's name trimmed")
    void createTrimsName() throws Exception {
        when(teamRepository.existsByNameIgnoreCase("Finance")).thenReturn(false);

        mockMvc.perform(post("/api/v1/team/create").param("name", "  Finance  "))
                .andExpect(status().isOk());

        ArgumentCaptor<Team> saved = ArgumentCaptor.forClass(Team.class);
        verify(teamRepository).save(saved.capture());
        org.junit.jupiter.api.Assertions.assertEquals("Finance", saved.getValue().getName());
    }

    @Test
    @DisplayName("refuses to rename a team to only whitespace")
    void renameRejectsBlankName() throws Exception {
        mockMvc.perform(post("/api/v1/team/rename").param("teamId", "1").param("newName", " "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Team name is required."));

        verify(teamRepository, never()).findById(any());
    }

    @Test
    @DisplayName("stores a renamed team's name trimmed")
    void renameTrimsName() throws Exception {
        Team team = new Team();
        team.setId(1L);
        team.setName("Old");
        when(teamRepository.findById(1L)).thenReturn(Optional.of(team));
        when(teamRepository.existsByNameIgnoreCase("Finance")).thenReturn(false);

        mockMvc.perform(
                        post("/api/v1/team/rename")
                                .param("teamId", "1")
                                .param("newName", "  Finance  "))
                .andExpect(status().isOk());

        org.junit.jupiter.api.Assertions.assertEquals("Finance", team.getName());
    }
}
