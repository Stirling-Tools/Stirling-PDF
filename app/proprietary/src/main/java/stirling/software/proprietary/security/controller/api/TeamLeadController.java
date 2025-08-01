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
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.config.PremiumEndpoint;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.RoleBasedAuthorizationService;

@RestController
@RequestMapping("/api/v1/team-lead")
@Tag(name = "Team Lead", description = "Team Lead Management APIs")
@Slf4j
@RequiredArgsConstructor
@PremiumEndpoint
public class TeamLeadController {

    private final TeamRepository teamRepository;
    private final UserRepository userRepository;
    private final RoleBasedAuthorizationService authorizationService;

    /** Get team members that the current team lead can manage */
    @GetMapping("/my-team-members")
    public ResponseEntity<List<User>> getMyTeamMembers() {
        if (!authorizationService.canManageTeamUsers()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        User currentUser = authorizationService.getCurrentUser();
        if (currentUser == null || currentUser.getTeam() == null) {
            return ResponseEntity.badRequest().build();
        }

        List<User> teamMembers = userRepository.findByTeam(currentUser.getTeam());
        return ResponseEntity.ok(teamMembers);
    }

    /** Add a user to the team lead's team */
    @PostMapping("/add-member")
    @Transactional
    public ResponseEntity<?> addMemberToMyTeam(@RequestParam("userId") Long userId) {
        User currentUser = authorizationService.getCurrentUser();
        if (currentUser == null || currentUser.getTeam() == null) {
            return ResponseEntity.badRequest().body("Team lead must be assigned to a team");
        }

        if (!authorizationService.canAddUserToTeam(userId, currentUser.getTeam())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Not authorized to add users to this team");
        }

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        User user = userOpt.get();

        // Check if user is already in a team
        if (user.getTeam() != null) {
            return ResponseEntity.badRequest()
                    .body("User is already assigned to team: " + user.getTeam().getName());
        }

        // Assign user to team
        user.setTeam(currentUser.getTeam());
        userRepository.save(user);

        return ResponseEntity.ok().body("User added to team successfully");
    }

    /** Remove a user from the team lead's team */
    @PostMapping("/remove-member")
    @Transactional
    public ResponseEntity<?> removeMemberFromMyTeam(@RequestParam("userId") Long userId) {
        if (!authorizationService.canRemoveUserFromTeam(userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Not authorized to remove this user");
        }

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        User user = userOpt.get();
        User currentUser = authorizationService.getCurrentUser();

        // Prevent team leads from removing themselves
        if (currentUser != null && currentUser.getId().equals(userId)) {
            return ResponseEntity.badRequest()
                    .body("Team leads cannot remove themselves from the team");
        }

        // Remove user from team
        user.setTeam(null);
        userRepository.save(user);

        return ResponseEntity.ok().body("User removed from team successfully");
    }

    /** Get users that can be added to the team (within same organization, not in any team) */
    @GetMapping("/available-users")
    public ResponseEntity<List<User>> getAvailableUsers() {
        if (!authorizationService.canManageTeamUsers()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        User currentUser = authorizationService.getCurrentUser();
        if (currentUser == null || currentUser.getOrganization() == null) {
            return ResponseEntity.badRequest().build();
        }

        // Find users in the same organization who are not in any team
        List<User> availableUsers =
                userRepository.findUsersInOrganizationWithoutTeam(
                        currentUser.getOrganization().getId());

        return ResponseEntity.ok(availableUsers);
    }

    /** Update a team member's role (team leads can only assign USER role) */
    @PostMapping("/update-member-role")
    @Transactional
    public ResponseEntity<?> updateMemberRole(
            @RequestParam("userId") Long userId, @RequestParam("role") String roleString) {

        if (!authorizationService.canManageUser(userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Not authorized to manage this user");
        }

        try {
            Role newRole = Role.fromString(roleString);

            // Team leads can only assign USER role
            if (!authorizationService.canAssignRole(newRole)) {
                return ResponseEntity.badRequest()
                        .body("Not authorized to assign role: " + newRole.getRoleName());
            }

            Optional<User> userOpt = userRepository.findById(userId);
            if (userOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            User user = userOpt.get();
            user.setUserRole(newRole);
            userRepository.save(user);

            return ResponseEntity.ok().body("User role updated successfully");

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body("Invalid role: " + roleString);
        }
    }

    /** Get team information for the current team lead */
    @GetMapping("/my-team")
    public ResponseEntity<Team> getMyTeam() {
        User currentUser = authorizationService.getCurrentUser();
        if (currentUser == null || currentUser.getTeam() == null) {
            return ResponseEntity.badRequest().build();
        }

        if (!authorizationService.canManageTeam(currentUser.getTeam())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        return ResponseEntity.ok(currentUser.getTeam());
    }
}
