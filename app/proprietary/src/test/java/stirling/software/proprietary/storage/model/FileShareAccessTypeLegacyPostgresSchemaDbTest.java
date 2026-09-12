package stirling.software.proprietary.storage.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import jakarta.persistence.EntityManager;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.config.FileShareAccessTypeSchemaRepair;

/**
 * The upgrade path the H2 fixture cannot reach: on PostgreSQL the pre-EDIT mapping expressed the
 * enum as a check constraint rather than a native column type, so widening the column leaves the
 * old value list enforcing {@code VIEW}/{@code DOWNLOAD}. H2 rewrites its native enum column and
 * passes without any repair.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
@Import(FileShareAccessTypeSchemaRepair.class)
@DirtiesContext
class FileShareAccessTypeLegacyPostgresSchemaDbTest {

    @Container
    static PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired private EntityManager entityManager;

    @DynamicPropertySource
    static void legacyDatabase(DynamicPropertyRegistry registry) throws Exception {
        createPreEditSchema();
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        // Production upgrade strategy; it widens the column but never drops the constraint.
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "update");
    }

    // Exactly what @Enumerated(STRING) generated on PostgreSQL before EDIT existed.
    private static void createPreEditSchema() throws Exception {
        try (Connection connection =
                        DriverManager.getConnection(
                                POSTGRES.getJdbcUrl(),
                                POSTGRES.getUsername(),
                                POSTGRES.getPassword());
                Statement statement = connection.createStatement()) {
            statement.executeUpdate(
                    "create table file_share_accesses ("
                            + " file_share_access_id bigserial not null,"
                            + " access_type varchar(255) not null"
                            + " check (access_type in ('VIEW','DOWNLOAD')),"
                            + " accessed_at timestamp(6),"
                            + " file_share_id bigint not null,"
                            + " user_id bigint not null,"
                            + " primary key (file_share_access_id))");
        }
    }

    @Test
    void editAccessTypeIsWritableAgainstAPreEditPostgresSchema() {
        Team team = new Team();
        team.setName("team-" + UUID.randomUUID());
        entityManager.persist(team);

        User owner = new User();
        owner.setUsername("owner-" + UUID.randomUUID());
        owner.setPassword("x");
        owner.setTeam(team);
        entityManager.persist(owner);

        StoredFile file = new StoredFile();
        file.setOwner(owner);
        file.setOriginalFilename("doc.pdf");
        file.setContentType("application/pdf");
        file.setSizeBytes(1);
        file.setStorageKey("k-" + UUID.randomUUID());
        entityManager.persist(file);

        FileShare share = new FileShare();
        share.setFile(file);
        share.setSharedWithUser(owner);
        share.setShareToken(UUID.randomUUID().toString());
        share.setAccessRole(ShareAccessRole.EDITOR);
        entityManager.persist(share);

        FileShareAccess access = new FileShareAccess();
        access.setFileShare(share);
        access.setUser(owner);
        access.setAccessType(FileShareAccessType.EDIT);
        entityManager.persist(access);
        entityManager.flush();
        entityManager.clear();

        FileShareAccess reloaded = entityManager.find(FileShareAccess.class, access.getId());
        assertThat(reloaded.getAccessType()).isEqualTo(FileShareAccessType.EDIT);
    }

    @Test
    void noValueConstraintSurvivesOnTheAccessTypeColumn() {
        Object constraints =
                entityManager
                        .createNativeQuery(
                                "SELECT count(*) FROM pg_constraint c"
                                        + " JOIN pg_class t ON t.oid = c.conrelid"
                                        + " WHERE c.contype = 'c'"
                                        + " AND t.relname = 'file_share_accesses'"
                                        + " AND pg_get_constraintdef(c.oid) LIKE '%access_type%'")
                        .getSingleResult();

        assertThat(((Number) constraints).intValue()).isZero();
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage(basePackages = "stirling.software.proprietary")
    static class TestApp {}
}
