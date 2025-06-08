package stirling.software.proprietary.security.controller.web;

import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.config.PremiumEndpoint;
import stirling.software.proprietary.security.database.repository.SessionRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;

@Controller
@RequestMapping("/teams")
@RequiredArgsConstructor

public class TeamWebController {

    private final TeamRepository teamRepository;
    private final UserRepository userRepository;
    private final SessionRepository sessionRepository;

    @GetMapping
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public String listTeams(Model model) {
        // Get all teams with their users
        List<Team> teams = teamRepository.findAllWithUsers();

        // Get the latest activity for each team
        List<Object[]> teamActivities = sessionRepository.findLatestActivityByTeam();

        // Convert the query results to a map for easy access in the view
        Map<Long, Date> teamLastRequest = new HashMap<>();
        for (Object[] result : teamActivities) {
            // For JPQL query with aliases
            Long teamId = (Long) result[0]; // teamId alias
            Date lastActivity = (Date) result[1]; // lastActivity alias

            teamLastRequest.put(teamId, lastActivity);
        }

        model.addAttribute("teams", teams);
        model.addAttribute("teamLastRequest", teamLastRequest);
        return "enterprise/teams";
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public String viewTeamDetails(@PathVariable("id") Long id, Model model) {
        // Get the team with its users
        Team team =
                teamRepository
                        .findById(id)
                        .orElseThrow(() -> new RuntimeException("Team not found"));

        List<User> members = userRepository.findAllByTeam(team);
        team.setUsers(new HashSet<>(members));

        // Get the latest session for each user in the team
        List<Object[]> userSessions = sessionRepository.findLatestSessionByTeamId(id);

        // Create a map of username to last request date
        Map<String, Date> userLastRequest = new HashMap<>();

        // Process results from JPQL query
        for (Object[] result : userSessions) {
            String username = (String) result[0]; // username alias
            Date lastRequest = (Date) result[1]; // lastRequest alias

            userLastRequest.put(username, lastRequest);
        }

        model.addAttribute("team", team);
        model.addAttribute("userLastRequest", userLastRequest);
        return "enterprise/team-details";
    }
}
