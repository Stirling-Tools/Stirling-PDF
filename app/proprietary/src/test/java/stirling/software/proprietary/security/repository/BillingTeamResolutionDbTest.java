package stirling.software.proprietary.security.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.Comparator;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

/**
 * Pins the resolution rule the billing/read endpoints depend on, against a real (H2) database
 * rather than a mocked repository.
 *
 * <p>The scenario is a genuine joined member: a durable home team the user leads, plus a team they
 * later joined as a member, with {@code users.team_id} repointed to the joined team (exactly what
 * {@code SaasTeamService.acceptInvitation} leaves behind — the home membership is kept). The two
 * memberships are what a mocked unit test cannot produce, and they are why the endpoints must read
 * {@code users.team_id}: the oldest membership is permanently the home team.
 */
@DataJpaTest
class BillingTeamResolutionDbTest {

    @Autowired private UserRepository userRepository;
    @Autowired private TeamRepository teamRepository;
    @Autowired private TeamMembershipRepository membershipRepository;

    @PersistenceContext private EntityManager em;

    @Test
    void usersTeamIdIsTheJoinedTeamWhileTheOldestMembershipIsTheHomeTeam() {
        Team home = teamRepository.save(named("home"));
        Team joined = teamRepository.save(named("joined"));

        User user = new User();
        user.setUsername("joined-member@acme.test");
        user.setTeam(joined); // acceptInvitation repoints the FK to the joined team
        user = userRepository.save(user);

        // Home membership created first (the user leads their personal team), joined membership
        // later (they accepted an invite). createdAt is stamped explicitly so "oldest" is
        // deterministic rather than dependent on H2 insert timing.
        persistMembership(user, home, TeamRole.LEADER, LocalDateTime.of(2026, 1, 1, 0, 0));
        persistMembership(user, joined, TeamRole.MEMBER, LocalDateTime.of(2026, 6, 1, 0, 0));
        em.flush();
        em.clear();

        User reloaded = userRepository.findById(user.getId()).orElseThrow();

        // What the endpoints used to do: pick the oldest membership. It is the home team.
        TeamMembership oldest =
                membershipRepository.findByUserId(reloaded.getId()).stream()
                        .min(Comparator.comparing(TeamMembership::getCreatedAt))
                        .orElseThrow();
        assertThat(oldest.getTeam().getId()).isEqualTo(home.getId());
        assertThat(oldest.getRole()).isEqualTo(TeamRole.LEADER);

        // What the endpoints do now: read users.team_id, with the role from that team's row.
        Long billingTeamId = reloaded.getTeam().getId();
        TeamMembership billingRow =
                membershipRepository
                        .findByTeamIdAndUserId(billingTeamId, reloaded.getId())
                        .orElseThrow();
        assertThat(billingTeamId).isEqualTo(joined.getId());
        assertThat(billingRow.getRole()).isEqualTo(TeamRole.MEMBER);

        // The whole bug in one line: the two strategies resolve to different teams. Reading the
        // oldest membership shows the home team's wallet/cap and grants the home team's LEADER
        // role;
        // reading users.team_id shows the team the user is actually billed against.
        assertThat(oldest.getTeam().getId()).isNotEqualTo(billingTeamId);
    }

    private Team named(String name) {
        Team t = new Team();
        t.setName(name);
        return t;
    }

    private void persistMembership(User user, Team team, TeamRole role, LocalDateTime createdAt) {
        TeamMembership m = new TeamMembership();
        m.setUser(user);
        m.setTeam(team);
        m.setRole(role);
        m.setInvitedAt(createdAt);
        m = membershipRepository.save(m);
        // @CreationTimestamp stamps createdAt on insert; overwrite it so ordering is deterministic.
        em.createQuery("update TeamMembership tm set tm.createdAt = :ts where tm.id = :id")
                .setParameter("ts", createdAt)
                .setParameter("id", m.getMembershipId())
                .executeUpdate();
    }

    @SpringBootConfiguration
    @EntityScan(
            basePackages = {
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model"
            })
    @EnableJpaRepositories(
            basePackages = {
                "stirling.software.proprietary.security.database.repository",
                "stirling.software.proprietary.security.repository"
            })
    static class TestApp {}
}
