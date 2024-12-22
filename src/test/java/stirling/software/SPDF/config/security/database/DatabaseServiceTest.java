package stirling.software.SPDF.config.security.database;

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

    private final Path BACKUP_PATH = Paths.get("configs/db/backup/*");

    @Mock
    private DatabaseConfig databaseConfig;

    @InjectMocks
    private DatabaseService databaseService;

    @Test
    void testHasBackups() throws IOException {
        Files.createDirectories(BACKUP_PATH);

        assertTrue(databaseService.hasBackup());
    }
}