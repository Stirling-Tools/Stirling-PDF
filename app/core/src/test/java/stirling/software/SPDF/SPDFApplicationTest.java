package stirling.software.SPDF;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.util.Optional;

import org.eclipse.microprofile.config.Config;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.configuration.AppConfig;
import stirling.software.common.model.ApplicationProperties;

/**
 * Unit tests for {@link SPDFApplication}.
 *
 * <p>Migrated off Spring: the entry-point class is now a Quarkus {@code QuarkusApplication} rather
 * than a {@code @SpringBootApplication}, and the former instance {@code init()} moved into the
 * inner CDI {@link SPDFApplication.StartupObserver} bean (driven by {@code @Observes
 * StartupEvent}). The static port/URL accessors are unchanged and still unit-testable directly;
 * {@code init()} is exercised by constructing the {@code StartupObserver} with mocked collaborators
 * (Spring's {@code Environment} dependency was dropped - the active profile is now resolved
 * internally).
 */
@ExtendWith(MockitoExtension.class)
public class SPDFApplicationTest {

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
    public void testInit() throws Exception {
        AppConfig appConfig = mock(AppConfig.class);
        Config config = mock(Config.class);
        ApplicationProperties applicationProperties = mock(ApplicationProperties.class);

        when(appConfig.getBackendUrl()).thenReturn("http://localhost");
        when(appConfig.getContextPath()).thenReturn("/app");
        when(appConfig.getServerPort()).thenReturn("8080");
        // Keep the browser-open path disabled so init() does not shell out during the test.
        lenient()
                .when(config.getOptionalValue("BROWSER_OPEN", String.class))
                .thenReturn(Optional.empty());

        SPDFApplication.StartupObserver observer =
                new SPDFApplication.StartupObserver(appConfig, config, applicationProperties);

        // init() carries the former @PostConstruct logic; it is private on the inner bean.
        Method init = SPDFApplication.StartupObserver.class.getDeclaredMethod("init");
        init.setAccessible(true);
        init.invoke(observer);

        assertEquals("http://localhost:8080", SPDFApplication.getStaticBaseUrl());
        assertEquals("/app", SPDFApplication.getStaticContextPath());
        assertEquals("8080", SPDFApplication.getStaticPort());
    }

    // Tests for getActiveProfile removed - method is now private
}
