package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * MIGRATION (Spring -&gt; Quarkus): {@code AppArgsCapture} replaced the Spring {@code
 * ApplicationRunner.run(ApplicationArguments)} hook with a CDI {@code @Observes StartupEvent}
 * observer reading a {@code @CommandLineArguments String[]} field. The tests drive that observer
 * directly: the {@code args} field and {@code onStart} method are package-private, so they are set
 * and invoked without a running CDI container (the {@code StartupEvent} payload is unused).
 */
class AppArgsCaptureTest {

    private AppArgsCapture capture;

    @BeforeEach
    void setUp() {
        capture = new AppArgsCapture();
        AppArgsCapture.APP_ARGS.set(List.of());
    }

    @Test
    void onStart_withArgs_capturesArgs() {
        capture.args = new String[] {"--server.port=8080", "--debug"};
        capture.onStart(null);
        assertEquals(List.of("--server.port=8080", "--debug"), AppArgsCapture.APP_ARGS.get());
    }

    @Test
    void onStart_withNoArgs_capturesEmptyList() {
        capture.args = new String[] {};
        capture.onStart(null);
        assertEquals(List.of(), AppArgsCapture.APP_ARGS.get());
    }

    @Test
    void onStart_calledTwice_overwritesPreviousArgs() {
        capture.args = new String[] {"--first"};
        capture.onStart(null);
        assertEquals(List.of("--first"), AppArgsCapture.APP_ARGS.get());

        capture.args = new String[] {"--second", "--third"};
        capture.onStart(null);
        assertEquals(List.of("--second", "--third"), AppArgsCapture.APP_ARGS.get());
    }

    @Test
    void appArgs_defaultValue_isEmptyList() {
        // After setUp resets it
        assertTrue(AppArgsCapture.APP_ARGS.get().isEmpty());
    }
}
