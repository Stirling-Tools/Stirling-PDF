package stirling.software.proprietary.security.database.migration;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Comparator;
import java.util.List;

import javax.sql.DataSource;

import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.FileInfo;
import stirling.software.proprietary.security.database.H2SQLCondition;
import stirling.software.proprietary.security.service.DatabaseServiceInterface;

@Component
@RequiredArgsConstructor
@Slf4j
@Conditional(H2SQLCondition.class)
public class H2DataOnly_0331_to_0340 implements MigrationStep {

    private final DatabaseServiceInterface databaseService;
    private final DataSource dataSource;

    @Override
    public String fromSchemaVersion() {
        return "0.33.1";
    }

    @Override
    public String toSchemaVersion() {
        return "0.34.0";
    }

    /**
     * Performs an H2-specific, data-only migration from version 0.33.1 to 0.34.0.
     *
     * <p>The goal is to carry user-facing data from an existing H2 backup into the new 0.34.0
     * schema <em>without</em> altering that schema. The new schema must already be in place; data
     * is imported using INSERT-only operations (and MERGE for TEAMS) to avoid overwriting
     * structures.
     *
     * <h3>Flow</h3>
     *
     * <ol>
     *   <li>If no backups are present, exit early (fresh install → no upgrade needed).
     *   <li>Pick the most recent backup and load it into a temporary in-memory H2 database.
     *   <li>Temporarily disable referential integrity in the target DB (<code>
     *       SET REFERENTIAL_INTEGRITY FALSE</code>).
     *   <li>Ensure teams <code>'Default'</code> and <code>'Internal'</code> exist via idempotent
     *       <code>MERGE</code>.
     *   <li>Expose the old data via H2 <em>linked tables</em> (<code>CREATE LINKED TABLE</code>) as
     *       <code>OLD_*</code> for: USERS, AUTHORITIES, PERSISTENT_LOGINS, SESSIONS, USER_SETTINGS.
     *   <li>Copy data with <strong>insert-only</strong> semantics, skipping existing rows:
     *       <ul>
     *         <li><b>USERS</b>: set <code>TEAM_ID</code> based on username (API user → <code>
     *             'Internal'</code>, otherwise → <code>'Default'</code>); also backfill <code>
     *             TEAM_ID</code> if null.
     *         <li><b>AUTHORITIES</b>, <b>PERSISTENT_LOGINS</b>, <b>SESSIONS</b> (safely truncate
     *             <code>PRINCIPAL_NAME</code> to 255), <b>USER_SETTINGS</b> (composite key): insert
     *             only when not already present.
     *       </ul>
     *   <li>Advance identity sequences <em>only if</em> the column is actually IDENTITY by calling
     *       <code>restartIdentityIfApplicable</code> using <code>SELECT COALESCE(MAX(...),0)+1
     *       </code>.
     *   <li>Drop linked tables, re-enable referential integrity, and commit. On errors, perform a
     *       rollback and best-effort cleanup and RI re-enable.
     * </ol>
     *
     * <h3>Characteristics</h3>
     *
     * <ul>
     *   <li><b>Idempotent</b>: MERGE/insert-only logic avoids duplicates on re-runs.
     *   <li><b>H2-specific</b>: uses RUNSCRIPT, CREATE LINKED TABLE, and REFERENTIAL_INTEGRITY.
     *   <li><b>Schema-preserving</b>: performs no DDL changes to the new schema; imports data only.
     * </ul>
     *
     * <h3>Prerequisites</h3>
     *
     * <ul>
     *   <li>Target database is H2 and already initialized with the 0.34.0 schema.
     *   <li>At least one valid H2 SCRIPT backup (<code>backup_*.sql</code>) is available.
     * </ul>
     *
     * @throws Exception if loading the backup, creating linked tables, copying data, or committing
     *     fails (rollback is attempted; cleanup and RI re-enable are best-effort).
     * @since 0.34.0
     */
    @Override
    public void run() throws Exception {
        if (!databaseService.hasBackup()) {
            log.info(
                    "New Database without old data, no upgrade necessary. Schema upgrade"
                            + " automatic.");
            return;
        }
        List<FileInfo> backupList = databaseService.getBackupList();
        backupList.sort(Comparator.comparing(FileInfo::getModificationDate).reversed());

        Path latestExport = Paths.get(backupList.get(0).getFilePath()).normalize();

        log.info("latest backup for data-only import: {}", latestExport);

        try {
            String memUrl = "jdbc:h2:mem:olddb_" + System.nanoTime() + ";DB_CLOSE_DELAY=-1";
            String memUrlEsc = memUrl.replace("'", "''");

            String createLinkedTableUsers = databaseService.createLinkedTable(memUrlEsc, "USERS");
            String createLinkedTableAuthorities =
                    databaseService.createLinkedTable(memUrlEsc, "AUTHORITIES");
            String createLinkedTablePersistentLogins =
                    databaseService.createLinkedTable(memUrlEsc, "PERSISTENT_LOGINS");
            String createLinkedTableSessions =
                    databaseService.createLinkedTable(memUrlEsc, "SESSIONS");
            String createLinkedTableUserSettings =
                    databaseService.createLinkedTable(memUrlEsc, "USER_SETTINGS");

            try (Connection memConn = DriverManager.getConnection(memUrl, "sa", "")) {
                try (PreparedStatement ps = memConn.prepareStatement("RUNSCRIPT FROM ?")) {
                    ps.setString(1, latestExport.toAbsolutePath().toString());
                    ps.execute();
                }
                try (Connection newConn = dataSource.getConnection()) {
                    newConn.setAutoCommit(false);
                    boolean riDisabled = false;
                    try (Statement st = newConn.createStatement()) {
                        // RI sicher deaktivieren
                        st.execute("SET REFERENTIAL_INTEGRITY FALSE");
                        riDisabled = true;

                        // TEAMS absichern
                        st.execute(
                                """
                                    MERGE INTO PUBLIC.TEAMS("NAME")
                                    KEY("NAME")
                                    VALUES('Default')
                                """);
                        st.execute(
                                """
                                    MERGE INTO PUBLIC.TEAMS("NAME")
                                    KEY("NAME")
                                    VALUES('Internal')
                                """);

                        st.execute(createLinkedTableUsers);
                        st.execute(createLinkedTableAuthorities);
                        st.execute(createLinkedTablePersistentLogins);
                        st.execute(createLinkedTableSessions);
                        st.execute(createLinkedTableUserSettings);

                        // USERS: Insert-only
                        st.execute(
                                """
                                    INSERT INTO PUBLIC.USERS ("USER_ID","API_KEY","AUTHENTICATIONTYPE","ENABLED","IS_FIRST_LOGIN",
                                                               "PASSWORD","ROLE_NAME","USERNAME","TEAM_ID")
                                    SELECT u."USER_ID", u."API_KEY", u."AUTHENTICATIONTYPE", u."ENABLED", u."IS_FIRST_LOGIN",
                                           u."PASSWORD", u."ROLE_NAME", u."USERNAME",
                                           CASE
                                             WHEN u."USERNAME"='STIRLING-PDF-BACKEND-API-USER'
                                               THEN (SELECT t."TEAM_ID" FROM PUBLIC.TEAMS t WHERE t."NAME"='Internal')
                                             ELSE (SELECT t."TEAM_ID" FROM PUBLIC.TEAMS t WHERE t."NAME"='Default')
                                           END
                                    FROM OLD_USERS u
                                    LEFT JOIN PUBLIC.USERS n ON n."USER_ID" = u."USER_ID"
                                    WHERE n."USER_ID" IS NULL
                                """);

                        // USERS: TEAM_ID nur setzen, wenn NULL
                        st.execute(
                                """
                                    UPDATE PUBLIC.USERS u
                                    SET "TEAM_ID" = CASE
                                      WHEN u."USERNAME"='STIRLING-PDF-BACKEND-API-USER'
                                        THEN (SELECT t."TEAM_ID" FROM PUBLIC.TEAMS t WHERE t."NAME"='Internal')
                                      ELSE (SELECT t."TEAM_ID" FROM PUBLIC.TEAMS t WHERE t."NAME"='Default')
                                    END
                                    WHERE u."TEAM_ID" IS NULL
                                """);

                        // AUTHORITIES: Insert-only
                        st.execute(
                                """
                                    INSERT INTO PUBLIC.AUTHORITIES ("ID","AUTHORITY","USER_ID")
                                    SELECT a."ID", a."AUTHORITY", a."USER_ID"
                                    FROM OLD_AUTHORITIES a
                                    LEFT JOIN PUBLIC.AUTHORITIES n ON n."ID" = a."ID"
                                    WHERE n."ID" IS NULL
                                """);

                        // PERSISTENT_LOGINS: Insert-only
                        st.execute(
                                """
                                    INSERT INTO PUBLIC.PERSISTENT_LOGINS ("SERIES","LAST_USED","TOKEN","USERNAME")
                                    SELECT p."SERIES", p."LAST_USED", p."TOKEN", p."USERNAME"
                                    FROM OLD_PERSISTENT_LOGINS p
                                    LEFT JOIN PUBLIC.PERSISTENT_LOGINS n ON n."SERIES" = p."SERIES"
                                    WHERE n."SERIES" IS NULL
                                """);

                        // SESSIONS: Insert-only + sicheres Kürzen
                        st.execute(
                                """
                                    INSERT INTO PUBLIC.SESSIONS ("SESSION_ID","EXPIRED","LAST_REQUEST","PRINCIPAL_NAME")
                                    SELECT s."SESSION_ID", s."EXPIRED", s."LAST_REQUEST",
                                           CASE WHEN s."PRINCIPAL_NAME" IS NULL
                                                THEN NULL
                                                ELSE SUBSTRING(CAST(s."PRINCIPAL_NAME" AS VARCHAR(255)), 1, 255)
                                           END
                                    FROM OLD_SESSIONS s
                                    LEFT JOIN PUBLIC.SESSIONS n ON n."SESSION_ID" = s."SESSION_ID"
                                    WHERE n."SESSION_ID" IS NULL
                                """);

                        // USER_SETTINGS: Insert-only (Composite-Key)
                        st.execute(
                                """
                                    INSERT INTO PUBLIC.USER_SETTINGS ("USER_ID","SETTING_VALUE","SETTING_KEY")
                                    SELECT us."USER_ID", CAST(us."SETTING_VALUE" AS VARCHAR), us."SETTING_KEY"
                                    FROM OLD_USER_SETTINGS us
                                    LEFT JOIN PUBLIC.USER_SETTINGS n
                                      ON n."USER_ID" = us."USER_ID" AND n."SETTING_KEY" = us."SETTING_KEY"
                                    WHERE n."USER_ID" IS NULL
                                """);

                        // Identity-Sequenzen nur fortsetzen, wenn die Spalte wirklich IDENTITY ist
                        long usersNext = 1L;
                        try (ResultSet rs =
                                st.executeQuery(
                                        databaseService.selectCoalesceMax("USERS", "USER_ID"))) {
                            if (rs.next()) usersNext = rs.getLong(1);
                        }
                        databaseService.restartIdentityIfApplicable(
                                newConn, "USERS", "USER_ID", usersNext);

                        long authNext = 1L;
                        try (ResultSet rs =
                                st.executeQuery(
                                        databaseService.selectCoalesceMax("AUTHORITIES", "ID"))) {
                            if (rs.next()) authNext = rs.getLong(1);
                        }
                        databaseService.restartIdentityIfApplicable(
                                newConn, "AUTHORITIES", "ID", authNext);

                    } catch (Exception ex) {
                        newConn.rollback();
                        throw ex;
                    } finally {
                        try (Statement st2 = newConn.createStatement()) {
                            st2.execute(databaseService.dropLinkedTable("USERS"));
                            st2.execute(databaseService.dropLinkedTable("AUTHORITIES"));
                            st2.execute(databaseService.dropLinkedTable("PERSISTENT_LOGINS"));
                            st2.execute(databaseService.dropLinkedTable("SESSIONS"));
                            st2.execute(databaseService.dropLinkedTable("USER_SETTINGS"));
                        } catch (Exception cleanupEx) {
                            log.warn(
                                    "Cleanup (drop linked tables) failed: {}",
                                    cleanupEx.getMessage(),
                                    cleanupEx);
                        }
                        try (Statement st3 = newConn.createStatement()) {
                            if (riDisabled) st3.execute("SET REFERENTIAL_INTEGRITY TRUE");
                        } catch (Exception riEx) {
                            log.warn(
                                    "Re-enabling referential integrity failed: {}",
                                    riEx.getMessage(),
                                    riEx);
                        }
                        try {
                            newConn.commit();
                        } catch (Exception commitEx) {
                            newConn.rollback();
                            throw commitEx;
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.error("Data-only import failed: {}", e.getMessage(), e);
            throw e;
        }
    }
}
