package stirling.software.saas.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;

import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Query;

class FleetSeatQueriesTest {
    @Test
    void ownerExemptionAgreesAcrossDisplayAvailabilityAndAtomicSeatClaims() throws Exception {
        try (var db = DriverManager.getConnection("jdbc:h2:mem:fleetSeats;MODE=PostgreSQL")) {
            try (var sql = db.createStatement()) {
                sql.execute("CREATE SCHEMA stirling_pdf");
                sql.execute(
                        "CREATE TABLE stirling_pdf.saas_team_extensions (team_id BIGINT PRIMARY KEY, seats_used INT, max_seats INT)");
                sql.execute(
                        "CREATE TABLE stirling_pdf.linked_instance (team_id BIGINT, seat_count INT, revoked_at TIMESTAMP)");
                sql.execute("INSERT INTO stirling_pdf.saas_team_extensions VALUES (1, 1, 5)");
                assertThat(total(db)).isEqualTo(1);
                sql.execute(
                        "INSERT INTO stirling_pdf.linked_instance VALUES (1, 4, NULL), (1, 0, NULL), (2, 99, NULL)");
                assertThat(total(db)).isEqualTo(4);
                assertThat(available(db)).isTrue();
                assertThat(claim(db)).isEqualTo(1);
                assertThat(total(db)).isEqualTo(5);
                assertThat(available(db)).isFalse();
                assertThat(claim(db)).isZero();
                sql.execute(
                        "UPDATE stirling_pdf.linked_instance SET revoked_at=CURRENT_TIMESTAMP WHERE team_id=1");
                assertThat(total(db)).isEqualTo(2);
                sql.execute("UPDATE stirling_pdf.saas_team_extensions SET seats_used=0");
                sql.execute("INSERT INTO stirling_pdf.linked_instance VALUES (1, NULL, NULL)");
                assertThat(total(db)).isZero();
            }
        }
    }

    private static String query(String method) throws Exception {
        return SaasTeamExtensionsRepository.class
                .getMethod(method, Long.class)
                .getAnnotation(Query.class)
                .value()
                .replace(":teamId", "1");
    }

    private static long total(Connection db) throws Exception {
        try (var statement = db.createStatement();
                var rows = statement.executeQuery(query("fleetUsersInUse"))) {
            rows.next();
            return rows.getLong(1);
        }
    }

    private static boolean available(Connection db) throws Exception {
        try (var statement = db.createStatement();
                var rows = statement.executeQuery(query("fleetHasAvailableSeats"))) {
            rows.next();
            return rows.getBoolean(1);
        }
    }

    private static int claim(Connection db) throws Exception {
        try (var statement = db.createStatement()) {
            return statement.executeUpdate(query("incrementSeatsUsed"));
        }
    }
}
