package stirling.software.proprietary.security.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.repository.TeamRepository;

@ApplicationScoped
@RequiredArgsConstructor
public class TeamService {

    private final TeamRepository teamRepository;

    public static final String DEFAULT_TEAM_NAME = "Default";
    public static final String INTERNAL_TEAM_NAME = "Internal";

    @Transactional
    public Team getOrCreateDefaultTeam() {
        return teamRepository
                .findByName(DEFAULT_TEAM_NAME)
                .orElseGet(
                        () -> {
                            Team defaultTeam = new Team();
                            defaultTeam.setName(DEFAULT_TEAM_NAME);
                            teamRepository.persist(defaultTeam);
                            return defaultTeam;
                        });
    }

    @Transactional
    public Team getOrCreateInternalTeam() {
        return teamRepository
                .findByName(INTERNAL_TEAM_NAME)
                .orElseGet(
                        () -> {
                            Team internalTeam = new Team();
                            internalTeam.setName(INTERNAL_TEAM_NAME);
                            teamRepository.persist(internalTeam);
                            return internalTeam;
                        });
    }
}
