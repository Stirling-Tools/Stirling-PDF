package stirling.software.proprietary.security.controller.api;

import java.util.Optional;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.view.RedirectView;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.config.PremiumEndpoint;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.OrganizationRepository;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.OrganizationService;
import stirling.software.proprietary.security.service.OrganizationValidationService;
import stirling.software.proprietary.security.service.RoleBasedAuthorizationService;
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
    private final OrganizationRepository organizationRepository;
    private final OrganizationService organizationService;
    private final OrganizationValidationService organizationValidationService;
    private final RoleBasedAuthorizationService authorizationService;

    @PostMapping("/create")
    public RedirectView createTeam(
            @RequestParam("name") String name,
            @RequestParam("organizationId") Long organizationId) {
        if (!authorizationService.canManageOrgTeams()) {
            return new RedirectView("/teams?messageType=accessDenied");
        }
        Organization organization = organizationService.getOrCreateDefaultOrganization();
        if (organizationId != null) {
            organization = organizationRepository.findById(organizationId).orElse(organization);
        }

        if (teamRepository.existsByNameIgnoreCaseAndOrganizationId(name, organization.getId())) {
            return new RedirectView("/teams?messageType=teamExists");
        }
        Team team = new Team();
        team.setName(name);
        team.setOrganization(organization);
        teamRepository.save(team);
        return new RedirectView("/teams?messageType=teamCreated");
    }

    @PostMapping("/rename")
    public RedirectView renameTeam(
            @RequestParam("teamId") Long teamId, @RequestParam("newName") String newName) {
        Optional<Team> existing = teamRepository.findById(teamId);
        if (existing.isEmpty()) {
            return new RedirectView("/teams?messageType=teamNotFound");
        }
        Team team = existing.get();

        if (!authorizationService.canManageTeam(team)) {
            return new RedirectView("/teams?messageType=accessDenied");
        }

        if (teamRepository.existsByNameIgnoreCaseAndOrganizationId(
                newName, team.getOrganization().getId())) {
            return new RedirectView("/teams?messageType=teamNameExists");
        }

        // Prevent renaming the Internal team
        if (team.getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return new RedirectView("/teams?messageType=internalTeamNotAccessible");
        }

        team.setName(newName);
        teamRepository.save(team);
        return new RedirectView("/teams?messageType=teamRenamed");
    }

    @PostMapping("/delete")
    @Transactional
    public RedirectView deleteTeam(@RequestParam("teamId") Long teamId) {
        Optional<Team> teamOpt = teamRepository.findById(teamId);
        if (teamOpt.isEmpty()) {
            return new RedirectView("/teams?messageType=teamNotFound");
        }

        Team team = teamOpt.get();

        if (!authorizationService.canManageTeam(team)) {
            return new RedirectView("/teams?messageType=accessDenied");
        }

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

    @PostMapping("/addUser")
    @Transactional
    public RedirectView addUserToTeam(
            @RequestParam("teamId") Long teamId, @RequestParam("userId") Long userId) {

        // Find the team
        Team team =
                teamRepository
                        .findById(teamId)
                        .orElseThrow(() -> new RuntimeException("Team not found"));

        if (!authorizationService.canAddUserToTeam(userId, team)) {
            return new RedirectView("/teams/" + teamId + "?error=accessDenied");
        }

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

        // Ensure user and team are in the same organization (or user has no org yet)
        if (user.getOrganization() != null
                && !organizationValidationService.isTeamInOrganization(
                        team, user.getOrganization())) {
            return new RedirectView("/teams/" + teamId + "?error=userNotInSameOrganization");
        }

        // Assign user to team
        user.setTeam(team);
        userRepository.save(user);

        // Redirect back to team details page
        return new RedirectView("/teams/" + teamId + "?messageType=userAdded");
    }
}
