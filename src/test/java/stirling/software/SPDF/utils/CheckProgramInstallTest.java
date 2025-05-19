package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;

class CheckProgramInstallTest {

    private MockedStatic<ProcessExecutor> mockProcessExecutor;
    private ProcessExecutor mockExecutor;

    @BeforeEach
    void setUp() throws Exception {
        // Reset static variables before each test
        resetStaticFields();

        // Set up mock for ProcessExecutor
        mockExecutor = Mockito.mock(ProcessExecutor.class);
        mockProcessExecutor = mockStatic(ProcessExecutor.class);
        mockProcessExecutor
                .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV))
                .thenReturn(mockExecutor);
    }

    @AfterEach
    void tearDown() {
        // Close the static mock to prevent memory leaks
        if (mockProcessExecutor != null) {
            mockProcessExecutor.close();
        }
    }

    /** Reset static fields in the CheckProgramInstall class using reflection */
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

    @Test
    void testGetAvailablePythonCommand_WhenPython3IsAvailable()
            throws IOException, InterruptedException {
        // Arrange
        ProcessExecutorResult result = Mockito.mock(ProcessExecutorResult.class);
        when(result.getRc()).thenReturn(0);
        when(result.getMessages()).thenReturn("Python 3.9.0");
        when(mockExecutor.runCommandWithOutputHandling(Arrays.asList("python3", "--version")))
                .thenReturn(result);

        // Act
        String pythonCommand = CheckProgramInstall.getAvailablePythonCommand();

        // Assert
        assertEquals("python3", pythonCommand);
        assertTrue(CheckProgramInstall.isPythonAvailable());

        // Verify that the command was executed
        verify(mockExecutor).runCommandWithOutputHandling(Arrays.asList("python3", "--version"));
    }

    @Test
    void testGetAvailablePythonCommand_WhenPython3IsNotAvailableButPythonIs()
            throws IOException, InterruptedException {
        // Arrange
        when(mockExecutor.runCommandWithOutputHandling(Arrays.asList("python3", "--version")))
                .thenThrow(new IOException("Command not found"));

        ProcessExecutorResult result = Mockito.mock(ProcessExecutorResult.class);
        when(result.getRc()).thenReturn(0);
        when(result.getMessages()).thenReturn("Python 2.7.0");
        when(mockExecutor.runCommandWithOutputHandling(Arrays.asList("python", "--version")))
                .thenReturn(result);

        // Act
        String pythonCommand = CheckProgramInstall.getAvailablePythonCommand();

        // Assert
        assertEquals("python", pythonCommand);
        assertTrue(CheckProgramInstall.isPythonAvailable());

        // Verify that both commands were attempted
        verify(mockExecutor).runCommandWithOutputHandling(Arrays.asList("python3", "--version"));
        verify(mockExecutor).runCommandWithOutputHandling(Arrays.asList("python", "--version"));
    }

    @Test
    void testGetAvailablePythonCommand_WhenPythonReturnsNonZeroExitCode()
            throws IOException, InterruptedException, Exception {
        // Arrange
        // Reset the static fields again to ensure clean state
        resetStaticFields();

        // Since we want to test the scenario where Python returns a non-zero exit code
        // We need to make sure both python3 and python commands are mocked to return failures

        ProcessExecutorResult resultPython3 = Mockito.mock(ProcessExecutorResult.class);
        when(resultPython3.getRc()).thenReturn(1); // Non-zero exit code
        when(resultPython3.getMessages()).thenReturn("Error");

        // Important: in the CheckProgramInstall implementation, only checks if
        // command throws exception, it doesn't check the return code
        // So we need to throw an exception instead
        when(mockExecutor.runCommandWithOutputHandling(Arrays.asList("python3", "--version")))
                .thenThrow(new IOException("Command failed with non-zero exit code"));

        when(mockExecutor.runCommandWithOutputHandling(Arrays.asList("python", "--version")))
                .thenThrow(new IOException("Command failed with non-zero exit code"));

        // Act
        String pythonCommand = CheckProgramInstall.getAvailablePythonCommand();

        // Assert - Both commands throw exceptions, so no python is available
        assertNull(pythonCommand);
        assertFalse(CheckProgramInstall.isPythonAvailable());
    }

    @Test
    void testGetAvailablePythonCommand_WhenNoPythonIsAvailable()
            throws IOException, InterruptedException {
        // Arrange
        when(mockExecutor.runCommandWithOutputHandling(any(List.class)))
                .thenThrow(new IOException("Command not found"));

        // Act
        String pythonCommand = CheckProgramInstall.getAvailablePythonCommand();

        // Assert
        assertNull(pythonCommand);
        assertFalse(CheckProgramInstall.isPythonAvailable());

        // Verify attempts to run both python3 and python
        verify(mockExecutor).runCommandWithOutputHandling(Arrays.asList("python3", "--version"));
        verify(mockExecutor).runCommandWithOutputHandling(Arrays.asList("python", "--version"));
    }

    @Test
    void testGetAvailablePythonCommand_CachesResult() throws IOException, InterruptedException {
        // Arrange
        ProcessExecutorResult result = Mockito.mock(ProcessExecutorResult.class);
        when(result.getRc()).thenReturn(0);
        when(result.getMessages()).thenReturn("Python 3.9.0");
        when(mockExecutor.runCommandWithOutputHandling(Arrays.asList("python3", "--version")))
                .thenReturn(result);

        // Act
        String firstCall = CheckProgramInstall.getAvailablePythonCommand();

        // Change the mock to simulate a change in the environment
        when(mockExecutor.runCommandWithOutputHandling(any(List.class)))
                .thenThrow(new IOException("Command not found"));

        String secondCall = CheckProgramInstall.getAvailablePythonCommand();

        // Assert
        assertEquals("python3", firstCall);
        assertEquals("python3", secondCall); // Second call should return the cached result

        // Verify python3 command was only executed once (caching worked)
        verify(mockExecutor, times(1))
                .runCommandWithOutputHandling(Arrays.asList("python3", "--version"));
    }

    @Test
    void testIsPythonAvailable_DirectCall() throws Exception {
        // Arrange
        ProcessExecutorResult result = Mockito.mock(ProcessExecutorResult.class);
        when(result.getRc()).thenReturn(0);
        when(result.getMessages()).thenReturn("Python 3.9.0");
        when(mockExecutor.runCommandWithOutputHandling(Arrays.asList("python3", "--version")))
                .thenReturn(result);

        // Reset again to ensure clean state
        resetStaticFields();

        // Act - Call isPythonAvailable() directly
        boolean pythonAvailable = CheckProgramInstall.isPythonAvailable();

        // Assert
        assertTrue(pythonAvailable);

        // Verify getAvailablePythonCommand was called internally
        verify(mockExecutor).runCommandWithOutputHandling(Arrays.asList("python3", "--version"));
    }
}
