package stirling.software.proprietary.security.controller.api;

import java.util.Map;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.TeamApi;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.config.PremiumEndpoint;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.TeamService;

@TeamApi
@Slf4j
@RequiredArgsConstructor
@PremiumEndpoint
public class TeamController {

    private final TeamRepository teamRepository;
    private final UserRepository userRepository;

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/create")
    public ResponseEntity<?> createTeam(@RequestParam("name") String name) {
        if (teamRepository.existsByNameIgnoreCase(name)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Team name already exists."));
        }
        Team team = new Team();
        team.setName(name);
        teamRepository.save(team);
        return ResponseEntity.ok(Map.of("message", "Team created successfully"));
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/rename")
    public ResponseEntity<?> renameTeam(
            @RequestParam("teamId") Long teamId, @RequestParam("newName") String newName) {
        Optional<Team> existing = teamRepository.findById(teamId);
        if (existing.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Team not found."));
        }
        if (teamRepository.existsByNameIgnoreCase(newName)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Team name already exists."));
        }
        Team team = existing.get();

        // Prevent renaming the Internal team
        if (team.getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Cannot rename Internal team."));
        }

        team.setName(newName);
        teamRepository.save(team);
        return ResponseEntity.ok(Map.of("message", "Team renamed successfully"));
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/delete")
    @Transactional
    public ResponseEntity<?> deleteTeam(@RequestParam("teamId") Long teamId) {
        Optional<Team> teamOpt = teamRepository.findById(teamId);
        if (teamOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Team not found."));
        }

        Team team = teamOpt.get();

        // Prevent deleting the Internal team
        if (team.getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Cannot delete Internal team."));
        }

        long memberCount = userRepository.countByTeam(team);
        if (memberCount > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(
                            Map.of(
                                    "error",
                                    "Team must be empty before deletion. Please remove all members first."));
        }

        teamRepository.delete(team);
        return ResponseEntity.ok(Map.of("message", "Team deleted successfully"));
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/addUser")
    @Transactional
    public ResponseEntity<?> addUserToTeam(
            @RequestParam("teamId") Long teamId, @RequestParam("userId") Long userId) {

        // Find the team
        Optional<Team> teamOpt = teamRepository.findById(teamId);
        if (teamOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Team not found."));
        }
        Team team = teamOpt.get();

        // Prevent adding users to the Internal team
        if (team.getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Cannot add users to Internal team."));
        }

        // Find the user
        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "User not found."));
        }
        User user = userOpt.get();

        // Check if user is in the Internal team - prevent moving them
        if (user.getTeam() != null
                && user.getTeam().getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Cannot move users from Internal team."));
        }

        // Assign user to team
        user.setTeam(team);
        userRepository.save(user);

        return ResponseEntity.ok(Map.of("message", "User added to team successfully"));
    }
}
