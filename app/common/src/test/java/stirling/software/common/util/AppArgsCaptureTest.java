package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.ApplicationArguments;

class AppArgsCaptureTest {

    private AppArgsCapture capture;

    @BeforeEach
    void setUp() {
        capture = new AppArgsCapture();
        AppArgsCapture.APP_ARGS.set(List.of());
    }

    @Test
    void run_withArgs_capturesArgs() {
        ApplicationArguments args = mock(ApplicationArguments.class);
        when(args.getSourceArgs()).thenReturn(new String[] {"--server.port=8080", "--debug"});
        capture.run(args);
        assertEquals(List.of("--server.port=8080", "--debug"), AppArgsCapture.APP_ARGS.get());
    }

    @Test
    void run_withNoArgs_capturesEmptyList() {
        ApplicationArguments args = mock(ApplicationArguments.class);
        when(args.getSourceArgs()).thenReturn(new String[] {});
        capture.run(args);
        assertEquals(List.of(), AppArgsCapture.APP_ARGS.get());
    }

    @Test
    void run_calledTwice_overwritesPreviousArgs() {
        ApplicationArguments args1 = mock(ApplicationArguments.class);
        when(args1.getSourceArgs()).thenReturn(new String[] {"--first"});
        capture.run(args1);
        assertEquals(List.of("--first"), AppArgsCapture.APP_ARGS.get());

        ApplicationArguments args2 = mock(ApplicationArguments.class);
        when(args2.getSourceArgs()).thenReturn(new String[] {"--second", "--third"});
        capture.run(args2);
        assertEquals(List.of("--second", "--third"), AppArgsCapture.APP_ARGS.get());
    }

    @Test
    void appArgs_defaultValue_isEmptyList() {
        // After setUp resets it
        assertTrue(AppArgsCapture.APP_ARGS.get().isEmpty());
    }
}
