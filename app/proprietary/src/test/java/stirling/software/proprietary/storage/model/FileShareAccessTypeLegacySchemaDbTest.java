package stirling.software.proprietary.storage.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import jakarta.persistence.EntityManager;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;

/**
 * Runs against a real v2.10.0 user database, upgraded in place by ddl-auto=update, because the
 * mocked service tests never touch a column definition. The v2.10.0 schema pins access_type to the
 * enum values that existed then, so a new constant is unwritable on every upgraded install unless
 * the mapping is plain text.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@DirtiesContext
class FileShareAccessTypeLegacySchemaDbTest {

    private static Path databaseDir;

    @Autowired private EntityManager entityManager;

    @DynamicPropertySource
    static void legacyDatabase(DynamicPropertyRegistry registry) throws Exception {
        databaseDir = Files.createTempDirectory("legacy-share-schema");
        Path database = databaseDir.resolve("legacy.mv.db");
        try (InputStream fixture =
                FileShareAccessTypeLegacySchemaDbTest.class.getResourceAsStream(
                        "/db-migration-fixtures/stirling-pdf-v2.10.0.mv.db")) {
            Files.copy(fixture, database);
        }
        String path = database.toString().replace('\\', '/');
        String base = path.substring(0, path.length() - ".mv.db".length());
        registry.add(
                "spring.datasource.url",
                () -> "jdbc:h2:file:" + base + ";DB_CLOSE_DELAY=-1;MODE=PostgreSQL");
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
        // Production upgrade strategy; it adds columns but never rewrites an existing one.
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "update");
    }

    @Test
    void editAccessTypeIsWritableAgainstAPreEditSchema() {
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
    void accessTypeColumnIsNoLongerANativeEnum() {
        Object dataType =
                entityManager
                        .createNativeQuery(
                                "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS"
                                        + " WHERE TABLE_NAME = 'FILE_SHARE_ACCESSES'"
                                        + " AND COLUMN_NAME = 'ACCESS_TYPE'")
                        .getSingleResult();

        assertThat(String.valueOf(dataType)).isNotEqualTo("ENUM");
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage(basePackages = "stirling.software.proprietary")
    static class TestApp {}
}
