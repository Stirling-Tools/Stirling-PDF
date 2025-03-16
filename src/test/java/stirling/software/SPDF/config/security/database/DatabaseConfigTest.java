package stirling.software.SPDF.config.security.database;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.exception.UnsupportedProviderException;

@ExtendWith(MockitoExtension.class)
class DatabaseConfigTest {

    @Mock private ApplicationProperties applicationProperties;

    private DatabaseConfig databaseConfig;

    @BeforeEach
    void setUp() {
        databaseConfig = new DatabaseConfig(applicationProperties, true);
    }

    @Test
    void testDataSource_whenRunningEEIsFalse() throws UnsupportedProviderException {
        databaseConfig = new DatabaseConfig(applicationProperties, false);

        var result = databaseConfig.dataSource();

        assertInstanceOf(DataSource.class, result);
    }

    @Test
    void testDefaultConfigurationForDataSource() throws UnsupportedProviderException {
        var system = mock(ApplicationProperties.System.class);
        var datasource = mock(ApplicationProperties.Datasource.class);

        when(applicationProperties.getSystem()).thenReturn(system);
        when(system.getDatasource()).thenReturn(datasource);
        when(datasource.isEnableCustomDatabase()).thenReturn(false);

        var result = databaseConfig.dataSource();

        assertInstanceOf(DataSource.class, result);
    }

    @Test
    void testCustomUrlForDataSource() throws UnsupportedProviderException {
        var system = mock(ApplicationProperties.System.class);
        var datasource = mock(ApplicationProperties.Datasource.class);

        when(applicationProperties.getSystem()).thenReturn(system);
        when(system.getDatasource()).thenReturn(datasource);
        when(datasource.isEnableCustomDatabase()).thenReturn(true);
        when(datasource.getCustomDatabaseUrl()).thenReturn("jdbc:postgresql://mockUrl");
        when(datasource.getUsername()).thenReturn("test");
        when(datasource.getPassword()).thenReturn("pass");

        var result = databaseConfig.dataSource();

        assertInstanceOf(DataSource.class, result);
    }

    @Test
    void testCustomConfigurationForDataSource() throws UnsupportedProviderException {
        var system = mock(ApplicationProperties.System.class);
        var datasource = mock(ApplicationProperties.Datasource.class);

        when(applicationProperties.getSystem()).thenReturn(system);
        when(system.getDatasource()).thenReturn(datasource);
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
        var system = mock(ApplicationProperties.System.class);
        var datasource = mock(ApplicationProperties.Datasource.class);

        when(applicationProperties.getSystem()).thenReturn(system);
        when(system.getDatasource()).thenReturn(datasource);
        when(datasource.isEnableCustomDatabase()).thenReturn(true);
        when(datasource.getCustomDatabaseUrl()).thenReturn("");
        when(datasource.getType()).thenReturn(datasourceType);

        assertThrows(UnsupportedProviderException.class, () -> databaseConfig.dataSource());
    }
}
