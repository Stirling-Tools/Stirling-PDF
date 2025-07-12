package stirling.software.proprietary.security.controller.api;

import java.util.Optional;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.view.RedirectView;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.config.PremiumEndpoint;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.TeamService;

@Controller
@RequestMapping("/api/v1/team")
@Tag(name = "Team", description = "Team Management APIs")
@Slf4j
@RequiredArgsConstructor
@PremiumEndpoint
public class TeamController {

    private final TeamRepository teamRepository;
    private final UserRepository userRepository;

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/create")
    public RedirectView createTeam(@RequestParam("name") String name) {
        if (teamRepository.existsByNameIgnoreCase(name)) {
            return new RedirectView("/teams?messageType=teamExists");
        }
        Team team = new Team();
        team.setName(name);
        teamRepository.save(team);
        return new RedirectView("/teams?messageType=teamCreated");
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/rename")
    public RedirectView renameTeam(
            @RequestParam("teamId") Long teamId, @RequestParam("newName") String newName) {
        Optional<Team> existing = teamRepository.findById(teamId);
        if (existing.isEmpty()) {
            return new RedirectView("/teams?messageType=teamNotFound");
        }
        if (teamRepository.existsByNameIgnoreCase(newName)) {
            return new RedirectView("/teams?messageType=teamNameExists");
        }
        Team team = existing.get();

        // Prevent renaming the Internal team
        if (team.getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return new RedirectView("/teams?messageType=internalTeamNotAccessible");
        }

        team.setName(newName);
        teamRepository.save(team);
        return new RedirectView("/teams?messageType=teamRenamed");
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/delete")
    @Transactional
    public RedirectView deleteTeam(@RequestParam("teamId") Long teamId) {
        Optional<Team> teamOpt = teamRepository.findById(teamId);
        if (teamOpt.isEmpty()) {
            return new RedirectView("/teams?messageType=teamNotFound");
        }

        Team team = teamOpt.get();

        // Prevent deleting the Internal team
        if (team.getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return new RedirectView("/teams?messageType=internalTeamNotAccessible");
        }

        long memberCount = userRepository.countByTeam(team);
        if (memberCount > 0) {
            return new RedirectView("/teams?messageType=teamHasUsers");
        }

        teamRepository.delete(team);
        return new RedirectView("/teams?messageType=teamDeleted");
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/addUser")
    @Transactional
    public RedirectView addUserToTeam(
            @RequestParam("teamId") Long teamId, @RequestParam("userId") Long userId) {

        // Find the team
        Team team =
                teamRepository
                        .findById(teamId)
                        .orElseThrow(() -> new RuntimeException("Team not found"));

        // Prevent adding users to the Internal team
        if (team.getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return new RedirectView("/teams?error=internalTeamNotAccessible");
        }

        // Find the user
        User user =
                userRepository
                        .findById(userId)
                        .orElseThrow(() -> new RuntimeException("User not found"));

        // Check if user is in the Internal team - prevent moving them
        if (user.getTeam() != null
                && user.getTeam().getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return new RedirectView("/teams/" + teamId + "?error=cannotMoveInternalUsers");
        }

        // Assign user to team
        user.setTeam(team);
        userRepository.save(user);

        // Redirect back to team details page
        return new RedirectView("/teams/" + teamId + "?messageType=userAdded");
    }
}
