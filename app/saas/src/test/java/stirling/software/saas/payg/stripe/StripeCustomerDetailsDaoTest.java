package stirling.software.saas.payg.stripe;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class StripeCustomerDetailsDaoTest {
    @Test
    void renewalsUseEachSubscriptionsItemsAndStayWithinTheCustomer() {
        JdbcTemplate jdbc =
                new JdbcTemplate(
                        new DriverManagerDataSource(
                                "jdbc:h2:mem:"
                                        + UUID.randomUUID()
                                        + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
                                "sa",
                                ""));
        jdbc.execute("CREATE SCHEMA stripe");
        jdbc.execute(
                "CREATE TABLE stripe.subscriptions (id text, customer text, status text, current_period_end bigint, cancel_at_period_end boolean)");
        jdbc.execute(
                "CREATE TABLE stripe.subscription_items (subscription text, price text, current_period_end bigint, deleted boolean)");
        jdbc.execute("CREATE TABLE stripe.prices (id text, product text)");
        jdbc.execute("CREATE TABLE stripe.products (id text, name text)");
        jdbc.execute(
                "INSERT INTO stripe.products VALUES ('team', 'Team'), ('processor', 'Processor')");
        jdbc.execute(
                "INSERT INTO stripe.prices VALUES ('team_price', 'team'), ('processor_price', 'processor')");
        jdbc.execute(
                "INSERT INTO stripe.subscriptions VALUES ('team_sub', 'buyer', 'active', null, false), ('processor_sub', 'buyer', 'active', 1792071850, false), ('other_sub', 'other', 'active', 1792071850, false), ('cancelled_sub', 'buyer', 'active', 1792071850, true), ('unsynced_sub', 'buyer', 'active', null, false)");
        jdbc.execute(
                "INSERT INTO stripe.subscription_items VALUES ('team_sub', 'team_price', 1792071502, false), ('processor_sub', 'processor_price', 1792071850, false), ('team_sub', 'team_price', 1789479502, true)");

        var renewals = new StripeCustomerDetailsDao(jdbc).findUpcomingInvoices("buyer");

        assertThat(renewals).hasSize(2);
        assertThat(renewals.getFirst().subscriptionId()).isEqualTo("team_sub");
        assertThat(renewals.getFirst().description()).isEqualTo("Team");
        assertThat(renewals.getFirst().date()).isEqualTo(Instant.ofEpochSecond(1792071502));
        assertThat(renewals.getLast().date()).isEqualTo(Instant.ofEpochSecond(1792071850));
    }
}
