package stirling.software.proprietary.security.controller.web;

import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.dto.TeamWithUserCountDTO;
import stirling.software.proprietary.security.database.repository.SessionRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.TeamService;

@Controller
@RequestMapping("/teams")
@RequiredArgsConstructor
@Slf4j
public class TeamWebController {

    private final TeamRepository teamRepository;
    private final SessionRepository sessionRepository;
    private final UserRepository userRepository;

    @GetMapping
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public String listTeams(HttpServletRequest request, Model model) {
        // Get teams with user counts using a DTO projection
        List<TeamWithUserCountDTO> allTeamsWithCounts = teamRepository.findAllTeamsWithUserCount();

        // Filter out the Internal team
        List<TeamWithUserCountDTO> teamsWithCounts =
                allTeamsWithCounts.stream()
                        .filter(team -> !team.getName().equals(TeamService.INTERNAL_TEAM_NAME))
                        .toList();

        // Get the latest activity for each team
        List<Object[]> teamActivities = sessionRepository.findLatestActivityByTeam();

        // Convert the query results to a map for easy access in the view
        Map<Long, Date> teamLastRequest = new HashMap<>();
        for (Object[] result : teamActivities) {
            Long teamId = (Long) result[0]; // teamId alias
            Date lastActivity = (Date) result[1]; // lastActivity alias
            teamLastRequest.put(teamId, lastActivity);
        }

        String messageType = request.getParameter("messageType");
        if (messageType != null) {
            if ("teamCreated".equals(messageType)) {
                model.addAttribute("addMessage", "teamCreated");
            } else if ("teamExists".equals(messageType)) {
                model.addAttribute("errorMessage", "teamExists");
            } else if ("teamNotFound".equals(messageType)) {
                model.addAttribute("errorMessage", "teamNotFound");
            } else if ("teamNameExists".equals(messageType)) {
                model.addAttribute("errorMessage", "teamNameExists");
            } else if ("internalTeamNotAccessible".equals(messageType)) {
                model.addAttribute("errorMessage", "team.internalTeamNotAccessible");
            } else if ("teamRenamed".equals(messageType)) {
                model.addAttribute("changeMessage", "teamRenamed");
            } else if ("teamHasUsers".equals(messageType)) {
                model.addAttribute("errorMessage", "teamHasUsers");
            } else if ("teamDeleted".equals(messageType)) {
                model.addAttribute("deleteMessage", "teamDeleted");
            }
        }

        // Add data to the model
        model.addAttribute("teamsWithCounts", teamsWithCounts);
        model.addAttribute("teamLastRequest", teamLastRequest);

        return "accounts/teams";
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public String viewTeamDetails(
            HttpServletRequest request, @PathVariable("id") Long id, Model model) {
        // Get the team
        Team team =
                teamRepository
                        .findById(id)
                        .orElseThrow(() -> new RuntimeException("Team not found"));

        // Prevent access to Internal team
        if (team.getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return "redirect:/teams?error=internalTeamNotAccessible";
        }

        // Get users for this team directly using the direct query
        List<User> teamUsers = userRepository.findAllByTeamId(id);

        // Get all users not in this team for the Add User to Team dropdown
        // Exclude users that are in the Internal team
        List<User> allUsers = userRepository.findAllWithTeam();
        List<User> availableUsers =
                allUsers.stream()
                        .filter(
                                user ->
                                        (user.getTeam() == null
                                                        || !user.getTeam().getId().equals(id))
                                                && (user.getTeam() == null
                                                        || !user.getTeam()
                                                                .getName()
                                                                .equals(
                                                                        TeamService
                                                                                .INTERNAL_TEAM_NAME)))
                        .toList();

        // Get the latest session for each user in the team
        List<Object[]> userSessions = sessionRepository.findLatestSessionByTeamId(id);

        // Create a map of username to last request date
        Map<String, Date> userLastRequest = new HashMap<>();
        for (Object[] result : userSessions) {
            String username = (String) result[0]; // username alias
            Date lastRequest = (Date) result[1]; // lastRequest alias
            userLastRequest.put(username, lastRequest);
        }

        String errorMessage = request.getParameter("error");
        if (errorMessage != null) {
            if ("cannotMoveInternalUsers".equals(errorMessage)) {
                model.addAttribute("errorMessage", "team.cannotMoveInternalUsers");
            }
        }

        model.addAttribute("team", team);
        model.addAttribute("teamUsers", teamUsers);
        model.addAttribute("availableUsers", availableUsers);
        model.addAttribute("userLastRequest", userLastRequest);
        return "accounts/team-details";
    }
}
