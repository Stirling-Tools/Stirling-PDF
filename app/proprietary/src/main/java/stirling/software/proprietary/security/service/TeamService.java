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
        return getOrCreate(DEFAULT_TEAM_NAME);
    }

    public Team getOrCreateInternalTeam() {
        return getOrCreate(INTERNAL_TEAM_NAME);
    }

    /**
     * Lowest id wins, so peers that raced a cold shared DB into two same-named rows still agree.
     * Duplicates cannot be prevented here: teams.name has no unique constraint, by design.
     */
    private Team getOrCreate(String name) {
        return teamRepository
                .findFirstByNameOrderByIdAsc(name)
                .orElseGet(
                        () -> {
                            Team team = new Team();
                            team.setName(name);
                            return teamRepository.save(team);
                        });
    }
}
