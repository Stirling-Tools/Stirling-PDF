package stirling.software.saas.payg.stripe;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class StripeSubscriptionScheduledEndTest {
    private JdbcTemplate jdbc;
    private StripeSubscriptionDao dao;

    @BeforeEach
    void mirror() {
        jdbc =
                new JdbcTemplate(
                        new DriverManagerDataSource(
                                "jdbc:h2:mem:"
                                        + UUID.randomUUID()
                                        + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
                                "sa",
                                ""));
        jdbc.execute("CREATE SCHEMA stripe");
        jdbc.execute(
                "CREATE TABLE stripe.subscriptions (id text, status text, current_period_end bigint,"
                        + " cancel_at_period_end boolean, cancel_at bigint)");
        jdbc.execute(
                "CREATE TABLE stripe.subscription_items (subscription text, current_period_end bigint, deleted boolean)");
        jdbc.execute(
                "CREATE TABLE team_capacity_subscriptions (subscription_id text, team_id bigint, canceled boolean)");
        jdbc.execute(
                "INSERT INTO stripe.subscriptions VALUES"
                        + " ('renewing', 'active', 1794614400, false, null),"
                        + " ('period_end', 'active', 1000, true, null),"
                        + " ('explicit', 'active', 1794614400, false, 1790000000),"
                        + " ('gone', 'canceled', 1794614400, true, null)");
        jdbc.execute(
                "INSERT INTO stripe.subscription_items VALUES ('period_end', 1794614400, false),"
                        + " ('period_end', 1, true)");
        dao = new StripeSubscriptionDao(jdbc);
    }

    @Test
    void aRenewingSubscriptionHasNoEnd() {
        assertThat(dao.findScheduledEnd("renewing")).isEmpty();
    }

    @Test
    void aPeriodEndCancelEndsWhenTheLiveItemsPeriodDoes() {
        assertThat(dao.findScheduledEnd("period_end"))
                .contains(Instant.parse("2026-11-14T00:00:00Z"));
    }

    @Test
    void anExplicitCancelDateWins() {
        assertThat(dao.findScheduledEnd("explicit")).contains(Instant.ofEpochSecond(1790000000));
    }

    @Test
    void anEndedSubscriptionIsNotReportedAsEnding() {
        assertThat(dao.findScheduledEnd("gone")).isEmpty();
    }

    @Test
    void theTeamEndComesFromItsLiveCapacitySubscription() {
        jdbc.execute(
                "INSERT INTO team_capacity_subscriptions VALUES ('gone', 7, true), ('period_end', 7, false),"
                        + " ('renewing', 8, false)");
        assertThat(dao.findTeamScheduledEnd(7)).contains(Instant.parse("2026-11-14T00:00:00Z"));
        assertThat(dao.findTeamScheduledEnd(8)).isEmpty();
        assertThat(dao.findTeamScheduledEnd(9)).isEmpty();
    }

    @Test
    void anUnsyncedMirrorDegradesToNoEnd() {
        jdbc.execute("DROP TABLE stripe.subscription_items");
        assertThat(dao.findScheduledEnd("period_end")).isEmpty();
    }
}
