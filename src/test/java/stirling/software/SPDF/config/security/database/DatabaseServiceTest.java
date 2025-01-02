package stirling.software.SPDF.config.security.database;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import stirling.software.SPDF.model.ApplicationProperties;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DatabaseServiceTest {

    public static final String TEST_FILE = "test";
    private final String BACKUP_PATH = "configs/db/backup/";

    @Mock
    private ApplicationProperties applicationProperties;

    @Mock
    private DataSource dataSource;

    @InjectMocks
    private DatabaseService databaseService;

    @BeforeEach
    void setUp() throws IOException {
        Files.deleteIfExists(Paths.get(BACKUP_PATH + TEST_FILE));
    }

    @Test
    void testHasNoBackups() {
        ApplicationProperties.System system = mock(ApplicationProperties.System.class);
        ApplicationProperties.Datasource datasource = mock(ApplicationProperties.Datasource.class);

        when(applicationProperties.getSystem()).thenReturn(system);
        when(system.getDatasource()).thenReturn(datasource);
        when(datasource.isEnableCustomDatabase()).thenReturn(false);

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