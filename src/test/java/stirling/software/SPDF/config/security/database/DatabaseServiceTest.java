package stirling.software.SPDF.config.security.database;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DatabaseServiceTest {

    @Mock
    private DatabaseConfig databaseConfig;

    @InjectMocks
    private DatabaseService databaseService;

    @Test
    void setAdminUser() throws SQLException {
        Connection connection = mock(Connection.class);
        Statement statement = mock(Statement.class);

        when(databaseConfig.connection()).thenReturn(connection);
        when(connection.createStatement()).thenReturn(statement);

        databaseService.setAdminUser();

        verify(statement).execute(anyString());
    }

}