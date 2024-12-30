package stirling.software.SPDF.config.security.database;

import java.nio.file.attribute.FileAttribute;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
class DatabaseServiceTest {

    public static final String TEST_FILE = "test";
    private final String BACKUP_PATH = "configs/db/backup/";

    @Mock
    private DatabaseConfig databaseConfig;

    @InjectMocks
    private DatabaseService databaseService;

    @BeforeEach
    void setUp() throws IOException {
        Files.deleteIfExists(Paths.get(BACKUP_PATH + TEST_FILE));
    }

    @Test
    void testHasNoBackups() {
        assertFalse(databaseService.hasBackup());
    }

    @Test
    @Disabled
    void testHasBackups() throws IOException {
        Path backupDir = Paths.get(BACKUP_PATH);
        Files.createDirectories(backupDir);
        Path testFile = Paths.get(BACKUP_PATH + TEST_FILE);

        Files.createFile(testFile);
        Files.createTempFile(backupDir, TEST_FILE, null);

        assertTrue(databaseService.hasBackup());
    }
}