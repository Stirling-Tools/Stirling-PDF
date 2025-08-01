package stirling.software.proprietary.security.controller.api;

import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.config.PremiumEndpoint;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.RoleBasedAuthorizationService;

@RestController
@RequestMapping("/api/v1/org-admin")
@Tag(name = "Organization Admin", description = "Organization Admin Management APIs")
@Slf4j
@RequiredArgsConstructor
@PremiumEndpoint
public class OrgAdminController {

    private final TeamRepository teamRepository;
    private final UserRepository userRepository;
    private final RoleBasedAuthorizationService authorizationService;

    /** Get all teams in the org admin's organization */
    @GetMapping("/teams")
    public ResponseEntity<List<Team>> getOrganizationTeams() {
        if (!authorizationService.canManageOrgTeams()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        User currentUser = authorizationService.getCurrentUser();
        if (currentUser == null || currentUser.getOrganization() == null) {
            return ResponseEntity.badRequest().build();
        }

        List<Team> teams =
                teamRepository.findByOrganizationId(currentUser.getOrganization().getId());
        return ResponseEntity.ok(teams);
    }

    /** Get all users in the org admin's organization */
    @GetMapping("/users")
    public ResponseEntity<List<User>> getOrganizationUsers() {
        if (!authorizationService.canManageOrgUsers()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        User currentUser = authorizationService.getCurrentUser();
        if (currentUser == null || currentUser.getOrganization() == null) {
            return ResponseEntity.badRequest().build();
        }

        // Get all users in teams belonging to this organization
        List<Team> orgTeams =
                teamRepository.findByOrganizationId(currentUser.getOrganization().getId());
        List<User> orgUsers =
                orgTeams.stream().flatMap(team -> team.getUsers().stream()).distinct().toList();

        return ResponseEntity.ok(orgUsers);
    }

    /** Assign a user to a team within the organization */
    @PostMapping("/assign-user-to-team")
    @Transactional
    public ResponseEntity<?> assignUserToTeam(
            @RequestParam("userId") Long userId, @RequestParam("teamId") Long teamId) {

        if (!authorizationService.canManageOrgUsers()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Not authorized to manage organization users");
        }

        Optional<User> userOpt = userRepository.findById(userId);
        Optional<Team> teamOpt = teamRepository.findById(teamId);

        if (userOpt.isEmpty() || teamOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        User user = userOpt.get();
        Team team = teamOpt.get();

        if (!authorizationService.canAddUserToTeam(userId, team)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Not authorized to add user to this team");
        }

        // Assign user to team
        user.setTeam(team);
        userRepository.save(user);

        return ResponseEntity.ok().body("User assigned to team successfully");
    }

    /** Promote a user to team lead */
    @PostMapping("/promote-to-team-lead")
    @Transactional
    public ResponseEntity<?> promoteToTeamLead(@RequestParam("userId") Long userId) {
        if (!authorizationService.canManageUser(userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Not authorized to manage this user");
        }

        if (!authorizationService.canAssignRole(Role.TEAM_LEAD)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Not authorized to assign team lead role");
        }

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        User user = userOpt.get();

        // User must be in a team to become a team lead
        if (user.getTeam() == null) {
            return ResponseEntity.badRequest()
                    .body("User must be assigned to a team before becoming a team lead");
        }

        user.setUserRole(Role.TEAM_LEAD);
        userRepository.save(user);

        return ResponseEntity.ok().body("User promoted to team lead successfully");
    }

    /** Demote a team lead to regular user */
    @PostMapping("/demote-from-team-lead")
    @Transactional
    public ResponseEntity<?> demoteFromTeamLead(@RequestParam("userId") Long userId) {
        if (!authorizationService.canManageUser(userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Not authorized to manage this user");
        }

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        User user = userOpt.get();
        user.setUserRole(Role.USER);
        userRepository.save(user);

        return ResponseEntity.ok().body("User demoted from team lead successfully");
    }

    /** Create a new team in the organization */
    @PostMapping("/create-team")
    @Transactional
    public ResponseEntity<?> createTeam(@RequestParam("teamName") String teamName) {
        if (!authorizationService.canManageOrgTeams()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Not authorized to create teams");
        }

        User currentUser = authorizationService.getCurrentUser();
        if (currentUser == null || currentUser.getOrganization() == null) {
            return ResponseEntity.badRequest()
                    .body("Org admin must be assigned to an organization");
        }

        Organization organization = currentUser.getOrganization();

        // Check if team name already exists in the organization
        if (teamRepository.existsByNameIgnoreCaseAndOrganizationId(
                teamName, organization.getId())) {
            return ResponseEntity.badRequest()
                    .body("Team with name '" + teamName + "' already exists in this organization");
        }

        Team newTeam = new Team();
        newTeam.setName(teamName);
        newTeam.setOrganization(organization);

        Team savedTeam = teamRepository.save(newTeam);
        return ResponseEntity.ok(savedTeam);
    }

    /** Remove a user from the organization (removes from their team) */
    @PostMapping("/remove-user")
    @Transactional
    public ResponseEntity<?> removeUserFromOrganization(@RequestParam("userId") Long userId) {
        if (!authorizationService.canRemoveUserFromTeam(userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Not authorized to remove this user");
        }

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        User user = userOpt.get();
        user.setTeam(null);
        user.setUserRole(Role.USER); // Reset to basic user role
        userRepository.save(user);

        return ResponseEntity.ok().body("User removed from organization successfully");
    }
}
