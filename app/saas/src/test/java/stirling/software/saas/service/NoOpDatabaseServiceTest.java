package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link NoOpDatabaseService}.
 *
 * <p>The saas profile manages Postgres externally, so every {@link
 * stirling.software.proprietary.security.service.DatabaseServiceInterface} method is a safe no-op.
 * These tests pin the no-op return values so callers can rely on them.
 */
class NoOpDatabaseServiceTest {

    private final NoOpDatabaseService service = new NoOpDatabaseService();

    @Test
    @DisplayName("exportDatabase is a no-op that does not throw")
    void exportDatabase_noThrow() {
        assertThatCode(service::exportDatabase).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("importDatabase is a no-op that does not throw")
    void importDatabase_noThrow() {
        assertThatCode(service::importDatabase).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("hasBackup is always false")
    void hasBackup_false() {
        assertThat(service.hasBackup()).isFalse();
    }

    @Test
    @DisplayName("getBackupList returns an empty list")
    void getBackupList_empty() {
        assertThat(service.getBackupList()).isEmpty();
    }

    @Test
    @DisplayName("deleteAllBackups returns an empty list")
    void deleteAllBackups_empty() {
        assertThat(service.deleteAllBackups()).isEmpty();
    }

    @Test
    @DisplayName("deleteLastBackup returns an empty list")
    void deleteLastBackup_empty() {
        assertThat(service.deleteLastBackup()).isEmpty();
    }

    @Test
    @DisplayName("getH2Version reports managed Postgres")
    void getH2Version_managedPostgres() {
        assertThat(service.getH2Version()).isEqualTo("N/A (managed Postgres)");
    }
}
