package stirling.software.saas.serverregistration;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.serverregistration.ServerRegistrationProtocol.PurchaseMapping;
import stirling.software.proprietary.serverregistration.ServerRegistrationProtocol.Receipt;
import stirling.software.proprietary.serverregistration.ServerRegistrationProtocol.RegistrationRequest;
import stirling.software.proprietary.serverregistration.ServerRegistrationProtocol.Report;
import stirling.software.proprietary.serverregistration.ServerRegistrationProtocol.SyncRequest;

/**
 * Migration-owned Postgres records only. No Team, license, account or billing mutation is reachable
 * here.
 */
@Repository
@Profile("saas")
@ConditionalOnProperty(name = "stirling.server-registration.enabled", havingValue = "true")
public class ServerLicenseRegistrationStore {
    private final JdbcTemplate jdbc;

    public ServerLicenseRegistrationStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Unique license/installation identity plus a row lock prevents bootstrap retries rotating
     * credentials.
     */
    @Transactional
    public Receipt register(
            RegistrationRequest request, KeygenServerLicenseVerifier.VerifiedLicense license) {
        List<Purchase> matches =
                jdbc.query(
                        "SELECT id, nullif(trim(server_subscription_id), '') AS server_subscription_id FROM public.license_keys WHERE license_key = ?"
                                + " AND plan = 'server' AND enterprise_seat_subscription_id IS NULL LIMIT 2",
                        (rs, row) ->
                                new Purchase(
                                        rs.getObject("id", UUID.class),
                                        rs.getString("server_subscription_id")),
                        license.key());
        Purchase purchase = matches.size() == 1 ? matches.getFirst() : new Purchase(null, null);
        jdbc.update(
                """
                INSERT INTO public.server_license_registrations
                    (registration_id, installation_id, keygen_license_id, credential_hash,
                     license_record_id, server_subscription_id, license_user_limit)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (keygen_license_id, installation_id) DO NOTHING
                """,
                UUID.randomUUID(),
                request.installationId(),
                license.id(),
                hash(request.registrationSecret()),
                purchase.id(),
                purchase.subscription(),
                license.userLimit());
        Row row =
                jdbc.queryForObject(
                        """
                SELECT * FROM public.server_license_registrations
                WHERE keygen_license_id = ? AND installation_id = ? FOR UPDATE
                """,
                        this::read,
                        license.id(),
                        request.installationId());
        authenticate(row, request.registrationSecret());
        Receipt receipt = accept(row, request.report());
        jdbc.update(
                """
                UPDATE public.server_license_registrations
                SET license_record_id = ?, server_subscription_id = ?, license_user_limit = ?
                WHERE registration_id = ?
                """,
                purchase.id(),
                purchase.subscription(),
                license.userLimit(),
                row.id());
        return new Receipt(
                receipt.registrationId(),
                receipt.acceptedSequence(),
                purchase.subscription() == null
                        ? PurchaseMapping.UNRESOLVED
                        : PurchaseMapping.RESOLVED);
    }

    /** Replays never refresh liveness. Changed payloads at the same sequence are rejected. */
    @Transactional
    public Receipt sync(SyncRequest request) {
        List<Row> rows =
                jdbc.query(
                        "SELECT * FROM public.server_license_registrations WHERE registration_id = ? FOR UPDATE",
                        this::read,
                        request.registrationId());
        if (rows.isEmpty()) throw unauthorized();
        Row row = rows.getFirst();
        authenticate(row, request.registrationSecret());
        return accept(row, request.report());
    }

    private Receipt accept(Row row, Report report) {
        if (report.sequence() < row.sequence()
                || (report.sequence() == row.sequence()
                        && (!report.reportedUserCount().equals(row.users())
                                || !report.applicationVersion().equals(row.version())
                                || report.capabilityVersion() != row.capability()))) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Report sequence already superseded");
        }
        if (report.sequence() > row.sequence()) {
            jdbc.update(
                    """
                    UPDATE public.server_license_registrations
                    SET report_sequence = ?, reported_user_count = ?, application_version = ?,
                        capability_version = ?, reported_at = now(), last_seen_at = now()
                    WHERE registration_id = ?
                    """,
                    report.sequence(),
                    report.reportedUserCount(),
                    report.applicationVersion(),
                    report.capabilityVersion(),
                    row.id());
        }
        return new Receipt(
                row.id(),
                report.sequence(),
                row.subscription() == null ? PurchaseMapping.UNRESOLVED : PurchaseMapping.RESOLVED);
    }

    private void authenticate(Row row, String secret) {
        if (row == null
                || row.revokedAt() != null
                || !MessageDigest.isEqual(
                        row.hash().getBytes(StandardCharsets.UTF_8),
                        hash(secret).getBytes(StandardCharsets.UTF_8))) {
            throw unauthorized();
        }
    }

    private Row read(ResultSet rs, int index) throws SQLException {
        var revoked = rs.getTimestamp("revoked_at");
        return new Row(
                rs.getObject("registration_id", UUID.class),
                rs.getString("credential_hash"),
                rs.getString("server_subscription_id"),
                rs.getLong("report_sequence"),
                rs.getObject("reported_user_count", Long.class),
                rs.getString("application_version"),
                rs.getInt("capability_version"),
                revoked == null ? null : revoked.toInstant());
    }

    private static String hash(String secret) {
        try {
            return HexFormat.of()
                    .formatHex(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(secret.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static ResponseStatusException unauthorized() {
        return new ResponseStatusException(
                HttpStatus.UNAUTHORIZED, "Registration credential rejected");
    }

    private record Purchase(UUID id, String subscription) {}

    private record Row(
            UUID id,
            String hash,
            String subscription,
            long sequence,
            Long users,
            String version,
            int capability,
            Instant revokedAt) {}
}
