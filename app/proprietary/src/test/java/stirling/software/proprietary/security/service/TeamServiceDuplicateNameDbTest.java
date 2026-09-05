package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.dao.IncorrectResultSizeDataAccessException;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.repository.TeamRepository;

/**
 * Peers cold-booting a shared DB can each commit a "Default" row, because teams.name carries no
 * unique constraint. Every node must still converge on one team instead of failing to boot.
 */
@DataJpaTest
class TeamServiceDuplicateNameDbTest {

    @Autowired private TeamRepository teamRepository;

    private Long saveTeam(String name) {
        Team team = new Team();
        team.setName(name);
        return teamRepository.saveAndFlush(team).getId();
    }

    @Test
    @DisplayName("two same-named rows really can be committed - the race is not hypothetical")
    void duplicateNamesArePersistable() {
        Long first = saveTeam(TeamService.DEFAULT_TEAM_NAME);
        Long second = saveTeam(TeamService.DEFAULT_TEAM_NAME);

        assertEquals(
                2,
                teamRepository.findAll().stream()
                        .filter(t -> TeamService.DEFAULT_TEAM_NAME.equals(t.getName()))
                        .count(),
                "no unique constraint on teams.name, so both inserts commit");
        assertEquals(true, first < second, "ids are monotonic, so 'lowest' is well defined");
    }

    @Test
    @DisplayName("the old finder throws on duplicates - this is what killed startup")
    void findByNameThrowsOnDuplicates() {
        saveTeam(TeamService.DEFAULT_TEAM_NAME);
        saveTeam(TeamService.DEFAULT_TEAM_NAME);

        assertThrows(
                IncorrectResultSizeDataAccessException.class,
                () -> teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME),
                "a derived Optional finder cannot survive two rows");
    }

    @Test
    @DisplayName("getOrCreateDefaultTeam converges on the lowest id instead of throwing")
    void getOrCreateConvergesOnLowestId() {
        Long first = saveTeam(TeamService.DEFAULT_TEAM_NAME);
        saveTeam(TeamService.DEFAULT_TEAM_NAME);

        TeamService teamService = new TeamService(teamRepository);

        assertEquals(first, teamService.getOrCreateDefaultTeam().getId());
        assertEquals(
                first,
                teamService.getOrCreateDefaultTeam().getId(),
                "repeated calls must not drift between the duplicates");
    }

    @Test
    @DisplayName("the internal team converges the same way")
    void internalTeamConvergesOnLowestId() {
        Long first = saveTeam(TeamService.INTERNAL_TEAM_NAME);
        saveTeam(TeamService.INTERNAL_TEAM_NAME);

        assertEquals(first, new TeamService(teamRepository).getOrCreateInternalTeam().getId());
    }

    @Test
    @DisplayName("with no row at all it still creates one")
    void createsWhenAbsent() {
        Team created = new TeamService(teamRepository).getOrCreateDefaultTeam();

        assertEquals(TeamService.DEFAULT_TEAM_NAME, created.getName());
        assertEquals(
                created.getId(),
                teamRepository
                        .findFirstByNameOrderByIdAsc(TeamService.DEFAULT_TEAM_NAME)
                        .orElseThrow()
                        .getId());
    }

    @SpringBootConfiguration
    @EntityScan(
            basePackages = {
                "stirling.software.proprietary.model",
                "stirling.software.proprietary.security.model"
            })
    @EnableJpaRepositories(basePackages = "stirling.software.proprietary.security.repository")
    static class TestApp {}
}
