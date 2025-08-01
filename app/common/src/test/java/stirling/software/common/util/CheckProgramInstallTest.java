package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.lang.reflect.Field;
import java.util.Arrays;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

@DisplayName("CheckProgramInstall Tests")
class CheckProgramInstallTest {

    private MockedStatic<ProcessExecutor> mockProcessExecutor;
    private ProcessExecutor mockExecutor;

    @BeforeEach
    void setUp() throws Exception {
        // Reset static fields before each test to ensure test isolation
        resetStaticFields();

        // Mock ProcessExecutor instance and static getter
        mockExecutor = Mockito.mock(ProcessExecutor.class);
        mockProcessExecutor = mockStatic(ProcessExecutor.class);
        mockProcessExecutor
                .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV))
                .thenReturn(mockExecutor);
    }

    @AfterEach
    void tearDown() {
        if (mockProcessExecutor != null) {
            mockProcessExecutor.close(); // Close static mock to prevent leaks
        }
    }

    private void resetStaticFields() throws Exception {
        Field pythonAvailableCheckedField =
                CheckProgramInstall.class.getDeclaredField("pythonAvailableChecked");
        pythonAvailableCheckedField.setAccessible(true);
        pythonAvailableCheckedField.set(null, false);

        Field availablePythonCommandField =
                CheckProgramInstall.class.getDeclaredField("availablePythonCommand");
        availablePythonCommandField.setAccessible(true);
        availablePythonCommandField.set(null, null);
    }

    @Nested
    @DisplayName("Python Command Availability Tests")
    class PythonCommandAvailabilityTests {

        @Test
        @DisplayName("Returns 'python3' when python3 command is available")
        void testGetAvailablePythonCommand_WhenPython3IsAvailable()
                throws IOException, InterruptedException {
            ProcessExecutorResult result = mock(ProcessExecutorResult.class);
            when(result.getRc()).thenReturn(0);
            when(result.getMessages()).thenReturn("Python 3.9.0");
            when(mockExecutor.runCommandWithOutputHandling(Arrays.asList("python3", "--version")))
                    .thenReturn(result);

            String pythonCommand = CheckProgramInstall.getAvailablePythonCommand();

            assertEquals("python3", pythonCommand, "Should return 'python3' when available");
            assertTrue(
                    CheckProgramInstall.isPythonAvailable(),
                    "isPythonAvailable should return true");
            verify(mockExecutor)
                    .runCommandWithOutputHandling(Arrays.asList("python3", "--version"));
        }

        @Test
        @DisplayName("Returns 'python' when python3 is unavailable but python is available")
        void testGetAvailablePythonCommand_WhenPython3IsNotAvailableButPythonIs()
                throws IOException, InterruptedException {
            when(mockExecutor.runCommandWithOutputHandling(Arrays.asList("python3", "--version")))
                    .thenThrow(new IOException("Command not found"));

            ProcessExecutorResult result = mock(ProcessExecutorResult.class);
            when(result.getRc()).thenReturn(0);
            when(result.getMessages()).thenReturn("Python 2.7.0");
            when(mockExecutor.runCommandWithOutputHandling(Arrays.asList("python", "--version")))
                    .thenReturn(result);

            String pythonCommand = CheckProgramInstall.getAvailablePythonCommand();

            assertEquals("python", pythonCommand, "Should return 'python' when available");
            assertTrue(
                    CheckProgramInstall.isPythonAvailable(),
                    "isPythonAvailable should return true");
            verify(mockExecutor)
                    .runCommandWithOutputHandling(Arrays.asList("python3", "--version"));
            verify(mockExecutor).runCommandWithOutputHandling(Arrays.asList("python", "--version"));
        }

        @Test
        @DisplayName("Returns null and false when both python3 and python commands fail")
        void testGetAvailablePythonCommand_WhenPythonReturnsNonZeroExitCode()
                throws IOException, InterruptedException, Exception {
            resetStaticFields();

            when(mockExecutor.runCommandWithOutputHandling(Arrays.asList("python3", "--version")))
                    .thenThrow(new IOException("Command failed with non-zero exit code"));
            when(mockExecutor.runCommandWithOutputHandling(Arrays.asList("python", "--version")))
                    .thenThrow(new IOException("Command failed with non-zero exit code"));

            String pythonCommand = CheckProgramInstall.getAvailablePythonCommand();

            assertNull(pythonCommand, "Should return null when no Python is available");
            assertFalse(
                    CheckProgramInstall.isPythonAvailable(),
                    "isPythonAvailable should return false");
        }

        @Test
        @DisplayName("Returns null and false when no python commands are available")
        void testGetAvailablePythonCommand_WhenNoPythonIsAvailable()
                throws IOException, InterruptedException {
            when(mockExecutor.runCommandWithOutputHandling(anyList()))
                    .thenThrow(new IOException("Command not found"));

            String pythonCommand = CheckProgramInstall.getAvailablePythonCommand();

            assertNull(pythonCommand, "Should return null when no Python is available");
            assertFalse(
                    CheckProgramInstall.isPythonAvailable(),
                    "isPythonAvailable should return false");
            verify(mockExecutor)
                    .runCommandWithOutputHandling(Arrays.asList("python3", "--version"));
            verify(mockExecutor).runCommandWithOutputHandling(Arrays.asList("python", "--version"));
        }
    }

    @Nested
    @DisplayName("Caching and Direct Call Tests")
    class CachingAndDirectCallTests {

        @Test
        @DisplayName("Caches the python command result to avoid repeated checks")
        void testGetAvailablePythonCommand_CachesResult() throws IOException, InterruptedException {
            ProcessExecutorResult result = mock(ProcessExecutorResult.class);
            when(result.getRc()).thenReturn(0);
            when(result.getMessages()).thenReturn("Python 3.9.0");
            when(mockExecutor.runCommandWithOutputHandling(Arrays.asList("python3", "--version")))
                    .thenReturn(result);

            String firstCall = CheckProgramInstall.getAvailablePythonCommand();

            // Simulate environment change to fail on later calls
            when(mockExecutor.runCommandWithOutputHandling(anyList()))
                    .thenThrow(new IOException("Command not found"));

            String secondCall = CheckProgramInstall.getAvailablePythonCommand();

            assertEquals("python3", firstCall, "First call should return 'python3'");
            assertEquals("python3", secondCall, "Second call should return cached 'python3'");
            verify(mockExecutor, times(1))
                    .runCommandWithOutputHandling(Arrays.asList("python3", "--version"));
        }

        @Test
        @DisplayName(
                "Direct call to isPythonAvailable triggers command check and returns true when available")
        void testIsPythonAvailable_DirectCall() throws Exception {
            ProcessExecutorResult result = mock(ProcessExecutorResult.class);
            when(result.getRc()).thenReturn(0);
            when(result.getMessages()).thenReturn("Python 3.9.0");
            when(mockExecutor.runCommandWithOutputHandling(Arrays.asList("python3", "--version")))
                    .thenReturn(result);

            resetStaticFields();

            boolean pythonAvailable = CheckProgramInstall.isPythonAvailable();

            assertTrue(
                    pythonAvailable,
                    "isPythonAvailable should return true when Python is available");
            verify(mockExecutor)
                    .runCommandWithOutputHandling(Arrays.asList("python3", "--version"));
        }
    }
}
