package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import stirling.software.common.configuration.InstallationPathConfig;

class LogbackPropertyLoaderTest {

    @Test
    void getPropertyValueReturnsLogPath() {
        LogbackPropertyLoader loader = new LogbackPropertyLoader();
        String result = loader.getPropertyValue();
        assertEquals(InstallationPathConfig.getLogPath(), result);
    }

    @Test
    void getPropertyValueIsNotNull() {
        LogbackPropertyLoader loader = new LogbackPropertyLoader();
        assertNotNull(loader.getPropertyValue());
    }

    @Test
    void getPropertyValueIsConsistentAcrossCalls() {
        LogbackPropertyLoader loader = new LogbackPropertyLoader();
        String first = loader.getPropertyValue();
        String second = loader.getPropertyValue();
        assertEquals(first, second);
    }
}
