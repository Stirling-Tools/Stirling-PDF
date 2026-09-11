package stirling.software.proprietary.security.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.sql.DriverManager;
import java.util.Properties;
import java.util.jar.Attributes;
import java.util.jar.JarInputStream;

import org.junit.jupiter.api.Test;

class H2VersionCompatibilityTest {

    private static final String H2_VERSIONS_LOCK_RESOURCE = "h2-versions.lock";
    private static final String OLD_H2_RESOURCE = "h2-migration/h2-2.3.232.jar";

    @Test
    void runtimeAndMigrationDriverMatchTheReviewedCompatibilityLock() throws Exception {
        Properties lockedVersions = readLockedVersions();

        assertThat(runtimeH2Version()).isEqualTo(lockedVersions.getProperty("runtime"));
        assertThat(migrationDriverVersion()).isEqualTo(lockedVersions.getProperty("migration"));
    }

    private Properties readLockedVersions() throws IOException {
        try (InputStream resource =
                H2VersionCompatibilityTest.class
                        .getClassLoader()
                        .getResourceAsStream(H2_VERSIONS_LOCK_RESOURCE)) {
            assertThat(resource).as("H2 compatibility lock resource").isNotNull();
            Properties versions = new Properties();
            versions.load(resource);
            assertThat(versions).containsKeys("runtime", "migration");
            return versions;
        }
    }

    private String runtimeH2Version() throws Exception {
        try (var connection = DriverManager.getConnection("jdbc:h2:mem:h2VersionCompatibility")) {
            try (var statement = connection.prepareStatement("SELECT H2VERSION() FROM DUAL")) {
                try (var result = statement.executeQuery()) {
                    assertThat(result.next()).isTrue();
                    return result.getString(1);
                }
            }
        }
    }

    private String migrationDriverVersion() throws IOException {
        InputStream resource =
                H2VersionCompatibilityTest.class
                        .getClassLoader()
                        .getResourceAsStream(OLD_H2_RESOURCE);
        assertThat(resource).as("bundled H2 migration driver").isNotNull();
        try (resource;
                JarInputStream jar = new JarInputStream(resource)) {
            return jar.getManifest()
                    .getMainAttributes()
                    .getValue(Attributes.Name.IMPLEMENTATION_VERSION);
        }
    }
}
