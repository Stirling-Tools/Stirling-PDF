package stirling.software.proprietary.security.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.zaxxer.hikari.HikariDataSource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.exception.UnsupportedProviderException;

/**
 * Declaring the {@code @Primary} DataSource bean makes Boot's Hikari auto-config back off, so
 * {@code spring.datasource.hikari.*} used to bind to nothing on every non-SaaS deployment.
 */
class DatabaseConfigPoolTest {

    private DatabaseConfig configWith(int maxPool, int minIdle, long keepalive) {
        DatabaseConfig config = new DatabaseConfig(new ApplicationProperties.Datasource());
        ReflectionTestUtils.setField(config, "maximumPoolSize", maxPool);
        ReflectionTestUtils.setField(config, "minimumIdle", minIdle);
        ReflectionTestUtils.setField(config, "idleTimeout", 600000L);
        ReflectionTestUtils.setField(config, "maxLifetime", 1800000L);
        ReflectionTestUtils.setField(config, "keepaliveTime", keepalive);
        ReflectionTestUtils.setField(config, "connectionTimeout", 30000L);
        return config;
    }

    @Test
    void poolPropertiesReachTheDataSource() throws UnsupportedProviderException {
        DataSource dataSource = configWith(40, 40, 120000L).dataSource();

        HikariDataSource hikari = assertInstanceOf(HikariDataSource.class, dataSource);
        assertEquals(40, hikari.getMaximumPoolSize());
        assertEquals(40, hikari.getMinimumIdle());
        assertEquals(120000L, hikari.getKeepaliveTime());
        assertEquals(1800000L, hikari.getMaxLifetime());
    }

    @Test
    void minimumIdleOfMinusOneLeavesHikariTrackingTheMaximum() throws UnsupportedProviderException {
        DataSource dataSource = configWith(25, -1, 0L).dataSource();

        HikariDataSource hikari = assertInstanceOf(HikariDataSource.class, dataSource);
        assertEquals(25, hikari.getMaximumPoolSize());
        // Hikari holds -1 until validate() runs at pool start, then resolves it to the maximum.
        // Leaving it untouched is the point: setting it here would freeze it at the old default.
        assertEquals(-1, hikari.getMinimumIdle());
    }

    @Test
    void unsetPropertiesLeaveThePoolUntouched() throws UnsupportedProviderException {
        // Direct construction, as the existing unit tests do — nothing injected, nothing applied.
        DataSource dataSource =
                new DatabaseConfig(new ApplicationProperties.Datasource()).dataSource();

        HikariDataSource hikari = assertInstanceOf(HikariDataSource.class, dataSource);
        assertEquals(10, hikari.getMaximumPoolSize(), "Hikari's own default must survive");
    }
}
