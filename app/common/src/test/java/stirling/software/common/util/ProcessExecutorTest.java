package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("ProcessExecutor Tests")
public class ProcessExecutorTest {

    private ProcessExecutor processExecutor;

    @BeforeEach
    public void setUp() {
        // Initialize the ProcessExecutor instance
        processExecutor = ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE);
    }

    @Nested
    @DisplayName("Command Execution Tests")
    class CommandExecutionTests {

        @Test
        @DisplayName("Executes valid command and returns expected output")
        public void testRunCommandWithOutputHandling() throws IOException, InterruptedException {
            // Arrange
            List<String> command = new ArrayList<>();
            command.add("java");
            command.add("-version");

            // Act
            ProcessExecutor.ProcessExecutorResult result =
                    processExecutor.runCommandWithOutputHandling(command);

            // Assert
            assertEquals(
                    0, result.getRc(), "Exit code should be 0 for successful command execution");
            assertNotNull(result.getMessages(), "Output messages should not be null");
        }

        @Test
        @DisplayName("Throws IOException for non-existent command")
        public void testRunCommandWithOutputHandling_Error() {
            // Arrange
            List<String> command = new ArrayList<>();
            command.add("nonexistent-command");

            // Act & Assert
            IOException thrown =
                    assertThrows(
                            IOException.class,
                            () -> processExecutor.runCommandWithOutputHandling(command),
                            "Should throw IOException for non-existent command");

            // Assert
            String errorMessage = thrown.getMessage();
            assertTrue(
                    errorMessage.contains("error=2")
                            || errorMessage.contains("No such file or directory"),
                    "Error message should indicate command not found: " + errorMessage);
        }
    }
}
