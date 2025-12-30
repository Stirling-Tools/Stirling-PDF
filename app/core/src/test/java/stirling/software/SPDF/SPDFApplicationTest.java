package stirling.software.SPDF;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.env.Environment;

import stirling.software.common.configuration.AppConfig;
import stirling.software.common.model.ApplicationProperties;

@ExtendWith(MockitoExtension.class)
public class SPDFApplicationTest {

    @Mock private Environment env;

    @Mock private ApplicationProperties applicationProperties;

    @InjectMocks private SPDFApplication sPDFApplication;

    @Mock private AppConfig appConfig;

    @BeforeEach
    public void setUp() {
        SPDFApplication.setServerPortStatic("8080");
    }

    @Test
    public void testSetServerPortStatic() {
        SPDFApplication.setServerPortStatic("9090");
        assertEquals("9090", SPDFApplication.getStaticPort());
    }

    @Test
    public void testGetStaticPort() {
        assertEquals("8080", SPDFApplication.getStaticPort());
    }

    @Test
    public void testSetServerPortStaticAuto() {
        SPDFApplication.setServerPortStatic("auto");
        assertEquals("0", SPDFApplication.getStaticPort());
    }

    @Test
    public void testInit() {
        when(appConfig.getBackendUrl()).thenReturn("http://localhost");
        when(appConfig.getContextPath()).thenReturn("/app");
        when(appConfig.getServerPort()).thenReturn("8080");

        sPDFApplication.init();

        assertEquals("http://localhost", SPDFApplication.getStaticBaseUrl());
        assertEquals("/app", SPDFApplication.getStaticContextPath());
        assertEquals("8080", SPDFApplication.getStaticPort());
    }

    // Tests for getActiveProfile removed - method is now private
}
