package stirling.software.proprietary.security.service;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.repository.TeamRepository;

@Service
@RequiredArgsConstructor
public class TeamService {

    private final TeamRepository teamRepository;
    private final OrganizationService organizationService;

    public static final String DEFAULT_TEAM_NAME = "Default";
    public static final String INTERNAL_TEAM_NAME = "Internal";

    public Team getOrCreateDefaultTeam() {
        Organization defaultOrg = organizationService.getOrCreateDefaultOrganization();
        return teamRepository
                .findByNameAndOrganizationId(DEFAULT_TEAM_NAME, defaultOrg.getId())
                .orElseGet(
                        () -> {
                            Team defaultTeam = new Team();
                            defaultTeam.setName(DEFAULT_TEAM_NAME);
                            defaultTeam.setOrganization(defaultOrg);
                            return teamRepository.save(defaultTeam);
                        });
    }

    public Team getOrCreateInternalTeam() {
        Organization internalOrg = organizationService.getOrCreateInternalOrganization();
        return teamRepository
                .findByNameAndOrganizationId(INTERNAL_TEAM_NAME, internalOrg.getId())
                .orElseGet(
                        () -> {
                            Team internalTeam = new Team();
                            internalTeam.setName(INTERNAL_TEAM_NAME);
                            internalTeam.setOrganization(internalOrg);
                            return teamRepository.save(internalTeam);
                        });
    }

    public Team getOrCreateTeamForOrganization(String teamName, Organization organization) {
        return teamRepository
                .findByNameAndOrganizationId(teamName, organization.getId())
                .orElseGet(
                        () -> {
                            Team team = new Team();
                            team.setName(teamName);
                            team.setOrganization(organization);
                            return teamRepository.save(team);
                        });
    }
}
