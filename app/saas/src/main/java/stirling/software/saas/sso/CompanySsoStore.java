package stirling.software.saas.sso;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import lombok.RequiredArgsConstructor;

/**
 * Transactional persistence for SSO connections, identity bindings and single-use login attempts.
 */
@Repository
@Profile("saas")
@RequiredArgsConstructor
public class CompanySsoStore {
    private final JdbcTemplate jdbc;

    public record Connection(
            UUID id, long teamId, UUID providerId, boolean active, int revision, Long testedBy) {}

    public record Binding(UUID authId, long userId, long teamId) {}

    public record Attempt(
            String hash,
            UUID connectionId,
            int revision,
            Long originalUserId,
            Instant createdAt,
            Instant expiresAt) {}

    private static final RowMapper<Connection> CONNECTION =
            (rs, n) ->
                    new Connection(
                            rs.getObject("id", UUID.class),
                            rs.getLong("team_id"),
                            rs.getObject("provider_id", UUID.class),
                            rs.getBoolean("active"),
                            rs.getInt("revision"),
                            rs.getObject("tested_by", Long.class));
    private static final RowMapper<Binding> BINDING =
            (rs, n) ->
                    new Binding(
                            rs.getObject("auth_id", UUID.class),
                            rs.getLong("user_id"),
                            rs.getLong("team_id"));

    public Optional<Connection> connection(UUID id) {
        return jdbc
                .query(
                        "select * from stirling_pdf.company_sso_connections where id = ?",
                        CONNECTION,
                        id)
                .stream()
                .findFirst();
    }

    public Optional<Connection> team(long id) {
        return jdbc
                .query(
                        "select * from stirling_pdf.company_sso_connections where team_id = ?",
                        CONNECTION,
                        id)
                .stream()
                .findFirst();
    }

    public Optional<Binding> binding(UUID authId) {
        return jdbc
                .query(
                        "select * from stirling_pdf.company_sso_bindings where auth_id = ?",
                        BINDING,
                        authId)
                .stream()
                .findFirst();
    }

    public Optional<Binding> userBinding(long userId) {
        return jdbc
                .query(
                        "select * from stirling_pdf.company_sso_bindings where user_id = ?",
                        BINDING,
                        userId)
                .stream()
                .findFirst();
    }

    public void save(Connection c) {
        jdbc.update(
                """
                insert into stirling_pdf.company_sso_connections (id,team_id,provider_id,active,revision,tested_by)
                values (?,?,?,?,?,?) on conflict (team_id) do update set provider_id=excluded.provider_id,
                revision=excluded.revision,tested_by=null
                """,
                c.id(),
                c.teamId(),
                c.providerId(),
                c.active(),
                c.revision(),
                c.testedBy());
    }

    public void start(String hash, Connection c, Long originalUserId, Instant now) {
        jdbc.update(
                "delete from stirling_pdf.company_sso_attempts where expires_at < ?",
                Timestamp.from(now));
        jdbc.update(
                """
                insert into stirling_pdf.company_sso_attempts
                (token_hash,connection_id,revision,original_user_id,created_at,expires_at) values (?,?,?,?,?,?)
                """,
                hash,
                c.id(),
                c.revision(),
                originalUserId,
                Timestamp.from(now),
                Timestamp.from(now.plusSeconds(600)));
    }

    /**
     * Must be called within a transaction; serialises verify/connect/complete on the same attempt.
     */
    public Attempt lockAttempt(String hash) {
        return jdbc
                .query(
                        "select * from stirling_pdf.company_sso_attempts where token_hash = ? for update",
                        (rs, n) ->
                                new Attempt(
                                        rs.getString("token_hash"),
                                        rs.getObject("connection_id", UUID.class),
                                        rs.getInt("revision"),
                                        rs.getObject("original_user_id", Long.class),
                                        rs.getTimestamp("created_at").toInstant(),
                                        rs.getTimestamp("expires_at").toInstant()),
                        hash)
                .stream()
                .findFirst()
                .orElseThrow(
                        () ->
                                new CompanySsoException(
                                        "ATTEMPT_EXPIRED", "Start company sign-in again."));
    }

    public void bind(UUID authId, long userId, long teamId) {
        jdbc.update(
                "insert into stirling_pdf.company_sso_bindings(auth_id,user_id,team_id) values (?,?,?)",
                authId,
                userId,
                teamId);
    }

    public void admit(UUID sessionId, long userId, long teamId, long membershipId) {
        jdbc.update(
                "insert into stirling_pdf.company_sso_sessions(session_id,user_id,team_id,membership_id) values (?,?,?,?)",
                sessionId,
                userId,
                teamId,
                membershipId);
    }

    public boolean sessionUsed(UUID sessionId) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "select exists(select 1 from stirling_pdf.company_sso_sessions where session_id=?)",
                        Boolean.class,
                        sessionId));
    }

    public boolean admitted(UUID sessionId, long userId, long membershipId) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "select exists(select 1 from stirling_pdf.company_sso_sessions where session_id=? and user_id=? and membership_id=?)",
                        Boolean.class,
                        sessionId,
                        userId,
                        membershipId));
    }

    public void tested(Connection c, long userId) {
        jdbc.update(
                "update stirling_pdf.company_sso_connections set tested_by=? where id=? and revision=?",
                userId,
                c.id(),
                c.revision());
    }

    public void activate(UUID id) {
        jdbc.update("update stirling_pdf.company_sso_connections set active=true where id=?", id);
    }

    public void consume(String hash) {
        jdbc.update("delete from stirling_pdf.company_sso_attempts where token_hash=?", hash);
    }

    public List<Long> connectedUsers(long teamId) {
        return jdbc.queryForList(
                "select user_id from stirling_pdf.company_sso_bindings where team_id=?",
                Long.class,
                teamId);
    }
}
