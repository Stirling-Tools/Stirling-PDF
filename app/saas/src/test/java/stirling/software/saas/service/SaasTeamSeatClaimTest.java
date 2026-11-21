package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import jakarta.persistence.EntityManager;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.saas.accountlink.LinkedInstanceRepository;
import stirling.software.saas.billing.repository.BillingSubscriptionRepository;
import stirling.software.saas.repository.SaasTeamExtensionsRepository;
import stirling.software.saas.repository.SaasUserExtensionsRepository;
import stirling.software.saas.repository.TeamInvitationRepository;

@DataJpaTest(
        properties = {
            "spring.jpa.properties.hibernate.default_schema=stirling_pdf",
            "spring.jpa.properties.hibernate.hbm2ddl.create_namespaces=true"
        })
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class SaasTeamSeatClaimTest {

    @Autowired private EntityManager entityManager;
    @Autowired private UserRepository userRepository;
    @Autowired private TeamRepository teamRepository;
    @Autowired private TeamMembershipRepository membershipRepository;
    @Autowired private TeamInvitationRepository invitationRepository;
    @Autowired private BillingSubscriptionRepository billingSubscriptionRepository;
    @Autowired private LinkedInstanceRepository linkedInstanceRepository;
    @Autowired private SaasTeamExtensionsRepository teamExtensionsRepository;
    @Autowired private SaasUserExtensionsRepository userExtensionsRepository;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private DataSource dataSource;

    private TransactionTemplate tx;
    private JdbcTemplate jdbc;
    private SaasTeamExtensionService teamExtensionService;
    private SaasTeamService teamService;

    @BeforeEach
    void setUp() {
        tx = new TransactionTemplate(transactionManager);
        jdbc = new JdbcTemplate(dataSource);
        teamExtensionService = new SaasTeamExtensionService(teamExtensionsRepository);
        teamService =
                new SaasTeamService(
                        entityManager,
                        teamRepository,
                        membershipRepository,
                        invitationRepository,
                        userRepository,
                        billingSubscriptionRepository,
                        null,
                        null,
                        null,
                        null,
                        teamExtensionService,
                        teamExtensionsRepository,
                        new SaasUserExtensionService(userExtensionsRepository),
                        linkedInstanceRepository,
                        null);
    }

    @Test
    void personalTeamCommitsTheOwnersSeat() {
        long userId = newUser();

        Long teamId =
                tx.execute(
                        status ->
                                teamService
                                        .createPersonalTeam(
                                                userRepository.findById(userId).orElseThrow())
                                        .getId());

        assertThat(committedSeatsUsed(teamId)).isEqualTo(1);
    }

    @Test
    void claimOnATeamWithoutExtensionsCommitsTheSeat() {
        Long teamId =
                tx.execute(
                        status -> {
                            Team team = new Team();
                            team.setName("seat-claim-" + UUID.randomUUID());
                            return teamRepository.save(team).getId();
                        });

        tx.executeWithoutResult(
                status ->
                        teamExtensionService.incrementSeatsUsed(
                                teamRepository.findById(teamId).orElseThrow()));

        assertThat(committedSeatsUsed(teamId)).isEqualTo(1);
    }

    private long newUser() {
        return tx.execute(
                status -> {
                    String name = "seat-owner-" + UUID.randomUUID();
                    User user = new User();
                    user.setUsername(name);
                    user.setEmail(name + "@example.test");
                    user.setPassword("x");
                    return userRepository.save(user).getId();
                });
    }

    private Integer committedSeatsUsed(long teamId) {
        return jdbc.queryForObject(
                "select seats_used from stirling_pdf.saas_team_extensions where team_id = ?",
                Integer.class,
                teamId);
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    @EntityScan(
            basePackages = {
                "stirling.software.saas",
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model"
            })
    @EnableJpaRepositories(
            basePackages = {
                "stirling.software.saas",
                "stirling.software.proprietary.security.database.repository",
                "stirling.software.proprietary.security.repository"
            })
    static class TestApp {}
}
