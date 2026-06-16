package stirling.software.proprietary.security.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.TeamService;

@ExtendWith(MockitoExtension.class)
class TeamControllerTest {

    @Mock private TeamRepository teamRepository;
    @Mock private UserRepository userRepository;

    @InjectMocks private TeamController teamController;

    private static Team team(Long id, String name) {
        Team t = new Team();
        t.setId(id);
        t.setName(name);
        return t;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> body(ResponseEntity<?> response) {
        assertInstanceOf(Map.class, response.getBody());
        return (Map<String, Object>) response.getBody();
    }

    @Nested
    @DisplayName("createTeam")
    class CreateTeam {

        @Test
        @DisplayName("returns 409 CONFLICT when a team with the same name already exists")
        void rejectsDuplicateName() {
            when(teamRepository.existsByNameIgnoreCase("Sales")).thenReturn(true);

            ResponseEntity<?> response = teamController.createTeam("Sales");

            assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
            assertEquals("Team name already exists.", body(response).get("error"));
            verify(teamRepository, never()).save(any());
        }

        @Test
        @DisplayName("saves and returns 200 OK when the name is unique")
        void createsTeamWhenNameUnique() {
            when(teamRepository.existsByNameIgnoreCase("Marketing")).thenReturn(false);

            ResponseEntity<?> response = teamController.createTeam("Marketing");

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("Team created successfully", body(response).get("message"));

            verify(teamRepository)
                    .save(
                            org.mockito.ArgumentMatchers.argThat(
                                    saved -> "Marketing".equals(saved.getName())));
        }
    }

    @Nested
    @DisplayName("renameTeam")
    class RenameTeam {

        @Test
        @DisplayName("returns 404 NOT_FOUND when the team id does not exist")
        void rejectsMissingTeam() {
            when(teamRepository.findById(99L)).thenReturn(Optional.empty());

            ResponseEntity<?> response = teamController.renameTeam(99L, "NewName");

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("Team not found.", body(response).get("error"));
            verify(teamRepository, never()).save(any());
        }

        @Test
        @DisplayName("returns 409 CONFLICT when the new name is already taken")
        void rejectsDuplicateNewName() {
            when(teamRepository.findById(1L)).thenReturn(Optional.of(team(1L, "OldName")));
            when(teamRepository.existsByNameIgnoreCase("Taken")).thenReturn(true);

            ResponseEntity<?> response = teamController.renameTeam(1L, "Taken");

            assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
            assertEquals("Team name already exists.", body(response).get("error"));
            verify(teamRepository, never()).save(any());
        }

        @Test
        @DisplayName("returns 400 BAD_REQUEST when attempting to rename the Internal team")
        void rejectsRenamingInternalTeam() {
            Team internal = team(1L, TeamService.INTERNAL_TEAM_NAME);
            when(teamRepository.findById(1L)).thenReturn(Optional.of(internal));
            when(teamRepository.existsByNameIgnoreCase("NewName")).thenReturn(false);

            ResponseEntity<?> response = teamController.renameTeam(1L, "NewName");

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Cannot rename Internal team.", body(response).get("error"));
            verify(teamRepository, never()).save(any());
        }

        @Test
        @DisplayName("renames and returns 200 OK on the happy path")
        void renamesTeamSuccessfully() {
            Team existing = team(5L, "OldName");
            when(teamRepository.findById(5L)).thenReturn(Optional.of(existing));
            when(teamRepository.existsByNameIgnoreCase("FreshName")).thenReturn(false);

            ResponseEntity<?> response = teamController.renameTeam(5L, "FreshName");

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("Team renamed successfully", body(response).get("message"));
            assertEquals("FreshName", existing.getName());
            verify(teamRepository).save(existing);
        }
    }

    @Nested
    @DisplayName("deleteTeam")
    class DeleteTeam {

        @Test
        @DisplayName("returns 404 NOT_FOUND when the team id does not exist")
        void rejectsMissingTeam() {
            when(teamRepository.findById(7L)).thenReturn(Optional.empty());

            ResponseEntity<?> response = teamController.deleteTeam(7L);

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("Team not found.", body(response).get("error"));
            verify(teamRepository, never()).delete(any());
        }

        @Test
        @DisplayName("returns 400 BAD_REQUEST when attempting to delete the Internal team")
        void rejectsDeletingInternalTeam() {
            Team internal = team(2L, TeamService.INTERNAL_TEAM_NAME);
            when(teamRepository.findById(2L)).thenReturn(Optional.of(internal));

            ResponseEntity<?> response = teamController.deleteTeam(2L);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Cannot delete Internal team.", body(response).get("error"));
            verify(teamRepository, never()).delete(any());
            verify(userRepository, never()).countByTeam(any());
        }

        @Test
        @DisplayName("returns 400 BAD_REQUEST when the team still has members")
        void rejectsDeletingNonEmptyTeam() {
            Team team = team(3L, "Engineering");
            when(teamRepository.findById(3L)).thenReturn(Optional.of(team));
            when(userRepository.countByTeam(team)).thenReturn(4L);

            ResponseEntity<?> response = teamController.deleteTeam(3L);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals(
                    "Team must be empty before deletion. Please remove all members first.",
                    body(response).get("error"));
            verify(teamRepository, never()).delete(any());
        }

        @Test
        @DisplayName("deletes and returns 200 OK when the team is empty")
        void deletesEmptyTeamSuccessfully() {
            Team team = team(4L, "Support");
            when(teamRepository.findById(4L)).thenReturn(Optional.of(team));
            when(userRepository.countByTeam(team)).thenReturn(0L);

            ResponseEntity<?> response = teamController.deleteTeam(4L);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("Team deleted successfully", body(response).get("message"));
            verify(teamRepository).delete(team);
        }
    }

    @Nested
    @DisplayName("addUserToTeam")
    class AddUserToTeam {

        @Test
        @DisplayName("returns 404 NOT_FOUND when the team id does not exist")
        void rejectsMissingTeam() {
            when(teamRepository.findById(10L)).thenReturn(Optional.empty());

            ResponseEntity<?> response = teamController.addUserToTeam(10L, 20L);

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("Team not found.", body(response).get("error"));
            verify(userRepository, never()).findById(any());
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("returns 400 BAD_REQUEST when the target team is the Internal team")
        void rejectsAddingToInternalTeam() {
            Team internal = team(11L, TeamService.INTERNAL_TEAM_NAME);
            when(teamRepository.findById(11L)).thenReturn(Optional.of(internal));

            ResponseEntity<?> response = teamController.addUserToTeam(11L, 20L);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Cannot add users to Internal team.", body(response).get("error"));
            verify(userRepository, never()).findById(any());
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("returns 404 NOT_FOUND when the user id does not exist")
        void rejectsMissingUser() {
            Team team = team(12L, "Engineering");
            when(teamRepository.findById(12L)).thenReturn(Optional.of(team));
            when(userRepository.findById(20L)).thenReturn(Optional.empty());

            ResponseEntity<?> response = teamController.addUserToTeam(12L, 20L);

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("User not found.", body(response).get("error"));
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("returns 400 BAD_REQUEST when the user currently belongs to the Internal team")
        void rejectsMovingUserFromInternalTeam() {
            Team target = team(13L, "Engineering");
            when(teamRepository.findById(13L)).thenReturn(Optional.of(target));

            User user = new User();
            user.setUsername("bob");
            user.setTeam(team(99L, TeamService.INTERNAL_TEAM_NAME));
            when(userRepository.findById(21L)).thenReturn(Optional.of(user));

            ResponseEntity<?> response = teamController.addUserToTeam(13L, 21L);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("Cannot move users from Internal team.", body(response).get("error"));
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("assigns the user and returns 200 OK when the user has no current team")
        void addsUserWithNoTeamSuccessfully() {
            Team target = team(14L, "Engineering");
            when(teamRepository.findById(14L)).thenReturn(Optional.of(target));

            User user = new User();
            user.setUsername("alice");
            // No current team -> getTeam() returns null, branch skipped.
            when(userRepository.findById(22L)).thenReturn(Optional.of(user));

            ResponseEntity<?> response = teamController.addUserToTeam(14L, 22L);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("User added to team successfully", body(response).get("message"));
            assertEquals(target, user.getTeam());
            verify(userRepository).save(user);
        }

        @Test
        @DisplayName("moves a user from a non-Internal team and returns 200 OK")
        void movesUserFromAnotherTeamSuccessfully() {
            Team target = team(15L, "Engineering");
            when(teamRepository.findById(15L)).thenReturn(Optional.of(target));

            User user = new User();
            user.setUsername("carol");
            user.setTeam(team(16L, "Marketing"));
            when(userRepository.findById(23L)).thenReturn(Optional.of(user));

            ResponseEntity<?> response = teamController.addUserToTeam(15L, 23L);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("User added to team successfully", body(response).get("message"));
            assertEquals(target, user.getTeam());
            verify(userRepository).save(user);
        }
    }
}
