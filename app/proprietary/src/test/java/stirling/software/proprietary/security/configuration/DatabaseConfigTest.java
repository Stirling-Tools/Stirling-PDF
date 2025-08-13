package stirling.software.proprietary.security.configuration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.exception.UnsupportedProviderException;

@ExtendWith(MockitoExtension.class)
class DatabaseConfigTest {

    @Mock private ApplicationProperties.Datasource datasource;

    private DatabaseConfig databaseConfig;

    @BeforeEach
    void setUp() {
        databaseConfig = new DatabaseConfig(datasource, true);
    }

    @Test
    void testDataSource_whenRunningEEIsFalse() throws UnsupportedProviderException {
        databaseConfig = new DatabaseConfig(datasource, false);

        var result = databaseConfig.dataSource();

        assertInstanceOf(DataSource.class, result);
    }

    @Test
    void testDefaultConfigurationForDataSource() throws UnsupportedProviderException {
        when(datasource.isEnableCustomDatabase()).thenReturn(false);

        var result = databaseConfig.dataSource();

        assertInstanceOf(DataSource.class, result);
    }

    @Test
    void testCustomUrlForDataSource() throws UnsupportedProviderException {
        when(datasource.isEnableCustomDatabase()).thenReturn(true);
        when(datasource.getCustomDatabaseUrl()).thenReturn("jdbc:postgresql://mockUrl");
        when(datasource.getUsername()).thenReturn("test");
        when(datasource.getPassword()).thenReturn("pass");

        var result = databaseConfig.dataSource();

        assertInstanceOf(DataSource.class, result);
    }

    @Test
    void testCustomConfigurationForDataSource() throws UnsupportedProviderException {
        when(datasource.isEnableCustomDatabase()).thenReturn(true);
        when(datasource.getCustomDatabaseUrl()).thenReturn("");
        when(datasource.getType()).thenReturn("postgresql");
        when(datasource.getHostName()).thenReturn("test");
        when(datasource.getPort()).thenReturn(1234);
        when(datasource.getName()).thenReturn("test_db");
        when(datasource.getUsername()).thenReturn("test");
        when(datasource.getPassword()).thenReturn("pass");

        var result = databaseConfig.dataSource();

        assertInstanceOf(DataSource.class, result);
    }

    @ParameterizedTest(name = "Exception thrown when the DB type [{arguments}] is not supported")
    @ValueSource(strings = {"oracle", "mysql", "mongoDb"})
    void exceptionThrown_whenDBTypeIsUnsupported(String datasourceType) {
        when(datasource.isEnableCustomDatabase()).thenReturn(true);
        when(datasource.getCustomDatabaseUrl()).thenReturn("");
        when(datasource.getType()).thenReturn(datasourceType);

        assertThrows(UnsupportedProviderException.class, () -> databaseConfig.dataSource());
    }
}
