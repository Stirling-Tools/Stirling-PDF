package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class ProcessExecutorTest {

    private ProcessExecutor processExecutor;

    @BeforeEach
    public void setUp() {
        // Initialize the ProcessExecutor instance
        processExecutor = ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE);
    }

    @Test
    public void testRunCommandWithOutputHandling() throws IOException, InterruptedException {
        // Mock the command to execute
        List<String> command = new ArrayList<>();
        command.add("java");
        command.add("-version");

        // Execute the command
        ProcessExecutor.ProcessExecutorResult result =
                processExecutor.runCommandWithOutputHandling(command);

        // Check the exit code and output messages
        assertEquals(0, result.getRc());
        assertNotNull(result.getMessages()); // Check if messages are not null
    }

    @Test
    public void testRunCommandWithOutputHandling_Error() {
        // Test with a command that will fail to execute (non-existent command)
        List<String> command = new ArrayList<>();
        command.add("nonexistent-command-that-does-not-exist");

        // Execute the command and expect an IOException (command not found)
        assertThrows(
                IOException.class, () -> processExecutor.runCommandWithOutputHandling(command));
    }

    @Test
    public void testRunCommandWithOutputHandling_PathTraversal() {
        // Test that path traversal is blocked
        List<String> command = new ArrayList<>();
        command.add("../../../etc/passwd");

        // Execute the command and expect an IllegalArgumentException
        IllegalArgumentException thrown =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> processExecutor.runCommandWithOutputHandling(command));

        // Check the exception message
        String errorMessage = thrown.getMessage();
        assertTrue(
                errorMessage.contains("path traversal"),
                "Unexpected error message: " + errorMessage);
    }

    @Test
    public void testRunCommandWithOutputHandling_NullByte() {
        // Test that null bytes are blocked
        List<String> command = new ArrayList<>();
        command.add("test\0command");

        // Execute the command and expect an IllegalArgumentException
        IllegalArgumentException thrown =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> processExecutor.runCommandWithOutputHandling(command));

        // Check the exception message
        String errorMessage = thrown.getMessage();
        assertTrue(
                errorMessage.contains("invalid characters"),
                "Unexpected error message: " + errorMessage);
    }
}
