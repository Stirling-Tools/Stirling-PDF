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
import stirling.software.proprietary.security.repository.TeamRepository;

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
            return new RedirectView("/adminSettings?messageType=teamExists");
        }
        Team team = new Team();
        team.setName(name);
        teamRepository.save(team);
        return new RedirectView("/adminSettings?messageType=teamCreated");
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/rename")
    public RedirectView renameTeam(
            @RequestParam("teamId") Long teamId, @RequestParam("newName") String newName) {
        Optional<Team> existing = teamRepository.findById(teamId);
        if (existing.isEmpty()) {
            return new RedirectView("/adminSettings?messageType=teamNotFound");
        }
        if (teamRepository.existsByNameIgnoreCase(newName)) {
            return new RedirectView("/adminSettings?messageType=teamNameExists");
        }
        Team team = existing.get();
        team.setName(newName);
        teamRepository.save(team);
        return new RedirectView("/adminSettings?messageType=teamRenamed");
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/delete")
    @Transactional
    public RedirectView deleteTeam(@RequestParam("teamId") Long teamId) {
        Optional<Team> teamOpt = teamRepository.findById(teamId);
        if (teamOpt.isEmpty()) {
            return new RedirectView("/adminSettings?messageType=teamNotFound");
        }

        Team team = teamOpt.get();
        long memberCount = userRepository.countByTeam(team);
        if (memberCount > 0) {
            return new RedirectView("/adminSettings?messageType=teamHasUsers");
        }

        teamRepository.delete(team);
        return new RedirectView("/adminSettings?messageType=teamDeleted");
    }
}
