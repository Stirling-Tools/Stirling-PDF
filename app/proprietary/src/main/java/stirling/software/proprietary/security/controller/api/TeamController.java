package stirling.software.proprietary.security.controller.api;

import java.util.Map;
import java.util.Optional;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.TeamApi;
import stirling.software.proprietary.access.model.PrincipalType;
import stirling.software.proprietary.access.repository.ResourceGrantRepository;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.config.PremiumEndpoint;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.TeamMembershipService;
import stirling.software.proprietary.security.service.TeamService;

@TeamApi
@Path("/api/v1/team")
@ApplicationScoped
@Slf4j
@RequiredArgsConstructor
@PremiumEndpoint
public class TeamController {

    private final TeamRepository teamRepository;
    private final UserRepository userRepository;
    private final ResourceGrantRepository resourceGrantRepository;
    private final IntegrationConfigRepository integrationConfigRepository;
    private final TeamMembershipService teamMembershipService;

    @RolesAllowed("ADMIN")
    @POST
    @Path("/create")
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    @Transactional
    public Response createTeam(@QueryParam("name") String name) {
        if (teamRepository.existsByNameIgnoreCase(name)) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(Map.of("error", "Team name already exists."))
                    .build();
        }
        Team team = new Team();
        team.setName(name);
        teamRepository.persist(team);
        return Response.ok(Map.of("message", "Team created successfully")).build();
    }

    @RolesAllowed("ADMIN")
    @POST
    @Path("/rename")
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    @Transactional
    public Response renameTeam(
            @QueryParam("teamId") Long teamId, @QueryParam("newName") String newName) {
        Optional<Team> existing = teamRepository.findByIdOptional(teamId);
        if (existing.isEmpty()) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Team not found."))
                    .build();
        }
        if (teamRepository.existsByNameIgnoreCase(newName)) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(Map.of("error", "Team name already exists."))
                    .build();
        }
        Team team = existing.get();

        // Prevent renaming the Internal team
        if (team.getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Cannot rename Internal team."))
                    .build();
        }

        team.setName(newName);
        teamRepository.persist(team);
        return Response.ok(Map.of("message", "Team renamed successfully")).build();
    }

    @RolesAllowed("ADMIN")
    @POST
    @Path("/delete")
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    @Transactional
    public Response deleteTeam(@QueryParam("teamId") Long teamId) {
        Optional<Team> teamOpt = teamRepository.findByIdOptional(teamId);
        if (teamOpt.isEmpty()) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Team not found."))
                    .build();
        }

        Team team = teamOpt.get();

        // Prevent deleting the Internal team
        if (team.getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Cannot delete Internal team."))
                    .build();
        }

        long memberCount = userRepository.countByTeam(team);
        if (memberCount > 0) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            Map.of(
                                    "error",
                                    "Team must be empty before deletion. Please remove all members first."))
                    .build();
        }

        if (integrationConfigRepository.existsByOwnerTeam_Id(teamId)) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(
                            Map.of(
                                    "error",
                                    "Team still owns integration configurations. Delete or reassign them first."))
                    .build();
        }

        // Team grants and membership rows would dangle once the team row is gone
        resourceGrantRepository.deleteByPrincipalTypeAndPrincipalId(PrincipalType.TEAM, teamId);
        teamMembershipService.deleteAllForTeam(teamId);
        teamRepository.delete(team);
        return Response.ok(Map.of("message", "Team deleted successfully")).build();
    }

    @RolesAllowed("ADMIN")
    @POST
    @Path("/setOwner")
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    @Transactional
    public Response setTeamOwner(
            @QueryParam("teamId") Long teamId, @QueryParam("userId") Long userId) {
        return mutateOwner(teamId, userId, true);
    }

    @RolesAllowed("ADMIN")
    @POST
    @Path("/removeOwner")
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    @Transactional
    public Response removeTeamOwner(
            @QueryParam("teamId") Long teamId, @QueryParam("userId") Long userId) {
        return mutateOwner(teamId, userId, false);
    }

    private Response mutateOwner(Long teamId, Long userId, boolean owner) {
        Optional<Team> teamOpt = teamRepository.findByIdOptional(teamId);
        if (teamOpt.isEmpty()) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Team not found."))
                    .build();
        }
        Team team = teamOpt.get();

        // System teams have no owners
        if (TeamService.INTERNAL_TEAM_NAME.equals(team.getName())
                || TeamService.DEFAULT_TEAM_NAME.equals(team.getName())) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "System teams cannot have owners."))
                    .build();
        }

        Optional<User> userOpt = userRepository.findByIdOptional(userId);
        if (userOpt.isEmpty()) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "User not found."))
                    .build();
        }
        User user = userOpt.get();

        if (user.getTeam() == null || !user.getTeam().getId().equals(teamId)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "User must be a member of the team."))
                    .build();
        }

        if (owner) {
            teamMembershipService.setOwner(team, user);
            return Response.ok(Map.of("message", "Team owner assigned successfully")).build();
        }
        teamMembershipService.removeOwner(team, user);
        return Response.ok(Map.of("message", "Team owner removed successfully")).build();
    }

    @RolesAllowed("ADMIN")
    @POST
    @Path("/addUser")
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    @Transactional
    public Response addUserToTeam(
            @QueryParam("teamId") Long teamId, @QueryParam("userId") Long userId) {

        // Find the team
        Optional<Team> teamOpt = teamRepository.findByIdOptional(teamId);
        if (teamOpt.isEmpty()) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Team not found."))
                    .build();
        }
        Team team = teamOpt.get();

        // Prevent adding users to the Internal team
        if (team.getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Cannot add users to Internal team."))
                    .build();
        }

        // Find the user
        Optional<User> userOpt = userRepository.findByIdOptional(userId);
        if (userOpt.isEmpty()) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "User not found."))
                    .build();
        }
        User user = userOpt.get();

        // Check if user is in the Internal team - prevent moving them
        if (user.getTeam() != null
                && user.getTeam().getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Cannot move users from Internal team."))
                    .build();
        }

        // Assign user to team
        user.setTeam(team);
        userRepository.persist(user);
        teamMembershipService.syncMembership(user);

        return Response.ok(Map.of("message", "User added to team successfully")).build();
    }
}
