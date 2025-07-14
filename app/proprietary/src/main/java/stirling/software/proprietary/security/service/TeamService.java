package stirling.software.proprietary.security.service;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.repository.TeamRepository;

@Service
@RequiredArgsConstructor
public class TeamService {

    private final TeamRepository teamRepository;

    public static final String DEFAULT_TEAM_NAME = "Default";
    public static final String INTERNAL_TEAM_NAME = "Internal";

    public Team getOrCreateDefaultTeam() {
        return teamRepository
                .findByName(DEFAULT_TEAM_NAME)
                .orElseGet(
                        () -> {
                            Team defaultTeam = new Team();
                            defaultTeam.setName(DEFAULT_TEAM_NAME);
                            return teamRepository.save(defaultTeam);
                        });
    }

    public Team getOrCreateInternalTeam() {
        return teamRepository
                .findByName(INTERNAL_TEAM_NAME)
                .orElseGet(
                        () -> {
                            Team internalTeam = new Team();
                            internalTeam.setName(INTERNAL_TEAM_NAME);
                            return teamRepository.save(internalTeam);
                        });
    }
}
